#!/usr/bin/env bash
set -euo pipefail

# usage prints a usage line to stderr in the form: usage: $0 <trivy-json> <codeql-sarif-json> <vex-json> [output-json].

usage() {
  echo "usage: $0 <trivy-json> <codeql-sarif-json> <vex-json> [output-json]" >&2
}

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  usage
  exit 64
fi

TRIVY_FILE="$1"
CODEQL_FILE="$2"
VEX_FILE="$3"
OUTPUT="${4:-security-evidence.json}"

test -s "$TRIVY_FILE" || { echo "::error::Trivy JSON missing/empty: $TRIVY_FILE"; exit 1; }
jq -e '.Results? | type == "array"' "$TRIVY_FILE" >/dev/null \
  || { echo "::error::Invalid Trivy JSON: missing Results array"; exit 1; }

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

if [ -s "$CODEQL_FILE" ]; then
  CODEQL_AVAILABLE=true
  jq -e '(.runs? // []) | type == "array"' "$CODEQL_FILE" >/dev/null
  cp "$CODEQL_FILE" "$TMPDIR/codeql.sarif"
else
  CODEQL_AVAILABLE=false
  printf '{"runs":[]}\n' > "$TMPDIR/codeql.sarif"
fi

if [ -s "$VEX_FILE" ]; then
  VEX_AVAILABLE=true
  jq -e 'type == "object"' "$VEX_FILE" >/dev/null
  cp "$VEX_FILE" "$TMPDIR/vex.json"
else
  VEX_AVAILABLE=false
  printf '{"vulnerabilities":[]}\n' > "$TMPDIR/vex.json"
fi

jq -n \
  --argjson codeql_available "$CODEQL_AVAILABLE" \
  --argjson vex_available "$VEX_AVAILABLE" \
  --slurpfile trivy "$TRIVY_FILE" \
  --slurpfile codeql "$TMPDIR/codeql.sarif" \
  --slurpfile vex "$TMPDIR/vex.json" \
'
  def vex_entries:
    ($vex[0].vulnerabilities // $vex[0].statements // []);

  def vex_id($entry):
    $entry.id // $entry.vulnerability.id // $entry.vulnerability.name;

  def vex_status($entry):
    $entry.status // $entry.vulnerability.status;

  def vex_justification($entry):
    $entry.justification // $entry.vulnerability.justification // null;

  def codeql_results:
    [
      $codeql[0].runs[]? as $run |
      ($run.tool.driver.rules // []) as $rules |
      $run.results[]? |
      . as $result |
      (first($rules[]? | select(.id == $result.ruleId)) // {}) as $rule |
      {
        id: $result.ruleId,
        rule_id: $result.ruleId,
        message: ($result.message.text // null),
        severity: (
          $result.level //
          $rule.defaultConfiguration.level //
          null
        ),
        tags: ($rule.properties.tags // []),
        cves: (
          [
            ($result.ruleId // empty),
            ($rule.id // empty),
            ($rule.properties.tags // [])[],
            ($rule.properties."security-severity" // empty),
            ($rule.properties.precision // empty)
          ]
          | map(select(type == "string" and test("^CVE-[0-9]{4}-[0-9]+$")))
          | unique
        )
      }
    ];

  def vex_for($id):
    first(vex_entries[] | select(vex_id(.) == $id));

  def is_suppressed_status($status):
    ($status // "") as $s |
    $s == "not_affected" or
    $s == "fixed";

  codeql_results as $sast |
  {
    schema_version: "release.security_evidence.v1",
    generated_at: (now | todate),
    sources: {
      trivy: {
        available: true,
        kind: "container_vulnerability"
      },
      codeql: {
        available: $codeql_available,
        kind: "sast_reachability"
      },
      vex: {
        available: $vex_available,
        kind: "exploitability"
      }
    },
    vulnerabilities: [
      $trivy[0].Results[]? |
      (.Target // "unknown") as $target |
      (.Vulnerabilities // [])[] |
      . as $tv |
      (vex_for($tv.VulnerabilityID) // {}) as $vex_match |
      (vex_status($vex_match)) as $vex_status |
      {
        id: $tv.VulnerabilityID,
        scanner: "trivy",
        target: $target,
        severity: $tv.Severity,
        package: $tv.PkgName,
        installed_version: ($tv.InstalledVersion // null),
        fixed_version: ($tv.FixedVersion // null),
        reachable: (
          if $codeql_available and any($sast[]; ([.id, .rule_id] + (.tags // []) + (.cves // [])) | index($tv.VulnerabilityID))
          then true
          else null
          end
        ),
        exploitable: (if is_suppressed_status($vex_status) then false else true end),
        vex_status: ($vex_status // "not_provided"),
        vex_justification: vex_justification($vex_match),
        vex_suppressed: is_suppressed_status($vex_status)
      }
    ],
    sast_findings: $sast
  }
' > "$OUTPUT"

jq -e '.schema_version == "release.security_evidence.v1" and (.vulnerabilities | type == "array")' "$OUTPUT" >/dev/null
echo "Evidence built: $OUTPUT"
