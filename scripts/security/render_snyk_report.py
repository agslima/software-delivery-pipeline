#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


README_BEGIN = "<!-- [BEGIN_GENERATED_TABLE] -->"
README_END = "<!-- [END_GENERATED_TABLE] -->"


@dataclass
class SeverityCounts:
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0

    def add(self, other: "SeverityCounts") -> "SeverityCounts":
        """
        Add severity counts from another SeverityCounts into this instance.
        
        Parameters:
            other (SeverityCounts): Counts to add to this instance.
        
        Returns:
            SeverityCounts: This instance with its counts incremented by `other`.
        """
        self.critical += other.critical
        self.high += other.high
        self.medium += other.medium
        self.low += other.low
        return self

    def as_dict(self) -> Dict[str, int]:
        """
        Return counts for each severity level as a dictionary.
        
        Returns:
            dict: Mapping with keys "critical", "high", "medium", and "low" to their integer counts.
        """
        return {
            "critical": self.critical,
            "high": self.high,
            "medium": self.medium,
            "low": self.low,
        }


def load_json(path: Path) -> Any:
    """
    Load and parse JSON from the given file path.
    
    Parameters:
        path (Path): Path to the JSON file to read.
    
    Returns:
        The parsed JSON value (dict, list, number, string, etc.).
    
    Raises:
        SystemExit: If the file does not exist or contains invalid JSON. The exit message indicates the problem and the path.
    """
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"Missing JSON file: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in {path}: {exc}")


def norm_severity(value: Any) -> Optional[str]:
    """
    Normalize a severity label or alias to one of: "critical", "high", "medium", or "low".
    
    Parameters:
        value (Any): Input severity value; will be coerced to a string before normalization (handles common aliases like "error", "warning", "note", "info").
    
    Returns:
        Optional[str]: The normalized severity ("critical", "high", "medium", or "low") if recognized, otherwise `None`.
    """
    s = str(value or "").strip().lower()
    if s in {"critical", "high", "medium", "low"}:
        return s
    if s == "error":
        return "high"
    if s == "warning":
        return "medium"
    if s in {"note", "info"}:
        return "low"
    return None


def ensure_list(value: Any) -> List[Any]:
    """
    Return the input if it is a list; otherwise return an empty list.
    
    Parameters:
        value (Any): The value to ensure as a list.
    
    Returns:
        list: The original list if `value` is a list, otherwise an empty list.
    """
    return value if isinstance(value, list) else []


def target_name_standard(result: Dict[str, Any]) -> str:
    """
    Return a normalized display name for a standard scan target.
    
    Parameters:
        result (Dict[str, Any]): Scan result dictionary that may contain "displayTargetFile", "targetFile", "projectName", "docker", or "image".
    
    Returns:
        str: The normalized target name derived from the first available key, or "unknown-target" if none are present.
    """
    return normalize_display_target(
        result.get("displayTargetFile")
        or result.get("targetFile")
        or result.get("projectName")
        or result.get("docker")
        or result.get("image")
        or "unknown-target"
    )


def target_name_iac(result: Dict[str, Any]) -> str:
    """
    Derives a normalized display target name from an IaC scan result.
    
    Checks the result for a target in this order: `path`, `targetFile`, `displayTargetFile`, `projectName`, and falls back to `"unknown-target"` if none are present. The returned string has path separators normalized and applies the script's IaC-specific display normalization (for example, collapsing staged k8s paths to `k8s` or `k8s/<suffix>`).
    
    Parameters:
        result (Dict[str, Any]): A mapping representing an IaC scan result; may contain `path`, `targetFile`, `displayTargetFile`, or `projectName`.
    
    Returns:
        str: The normalized display target name.
    """
    raw = (
        result.get("path")
        or result.get("targetFile")
        or result.get("displayTargetFile")
        or result.get("projectName")
        or "unknown-target"
    )
    return normalize_display_target(raw)


def normalize_display_target(target: str) -> str:
    """
    Normalize a target string for display by normalizing path separators and collapsing IaC staging paths to concise Kubernetes labels.
    
    Parameters:
        target (str): The original target string or path.
    
    Returns:
        normalized (str): The input with backslashes replaced by forward slashes. If the path ends with "/.tmp/snyk-run/iac-stage/k8s" returns "k8s". If it contains "/.tmp/snyk-run/iac-stage/k8s/" returns "k8s/<suffix>" where <suffix> is the remaining path; otherwise returns the normalized path.
    """
    t = str(target).replace("\\", "/")

    # Normalize staged IaC temp path back to a repo-facing label.
    if t.endswith("/.tmp/snyk-run/iac-stage/k8s"):
        return "k8s"

    marker = "/.tmp/snyk-run/iac-stage/k8s/"
    if marker in t:
        suffix = t.split(marker, 1)[1]
        return f"k8s/{suffix}" if suffix else "k8s"

    return t


def iter_standard_results(doc: Any) -> Iterable[Dict[str, Any]]:
    """
    Yield result dictionaries from a Snyk-standard document in a consistent sequence.
    
    Parameters:
        doc (Any): Input document which may be one of:
            - a list of dicts (each dict is yielded),
            - a dict containing a "results" key with a list of dicts (each dict in that list is yielded),
            - a single dict (the dict itself is yielded).
    
    Returns:
        Iterable[Dict[str, Any]]: An iterable producing each result dictionary found in `doc`, in document order.
    """
    if isinstance(doc, list):
        for item in doc:
            if isinstance(item, dict):
                yield item
    elif (
        isinstance(doc, dict) and "results" in doc and isinstance(doc["results"], list)
    ):
        for item in doc["results"]:
            if isinstance(item, dict):
                yield item
    elif isinstance(doc, dict):
        yield doc


def extract_standard_counts(doc: Any) -> SeverityCounts:
    """
    Aggregate severity counts from standard (SCA/container) scan results.
    
    Iterates over results in `doc`, normalizes each vulnerability's severity, and counts unique vulnerabilities deduplicated by the combination of target and vulnerability identifier. Vulnerability identifier is derived from `id`, `packageName`, or `title`; entries with unrecognized severities are ignored.
    
    Parameters:
        doc (Any): Parsed JSON document (a list of results, a dict with a "results" list, or a single result dict) containing `vulnerabilities` entries.
    
    Returns:
        SeverityCounts: Totals of `critical`, `high`, `medium`, and `low` vulnerabilities aggregated across all targets.
    """
    seen = set()
    counts = SeverityCounts()

    for result in iter_standard_results(doc):
        target = target_name_standard(result)
        for vuln in ensure_list(result.get("vulnerabilities")):
            vuln_id = str(
                vuln.get("id")
                or vuln.get("packageName")
                or vuln.get("title")
                or "unknown-id"
            )
            sev = norm_severity(vuln.get("severity"))
            if not sev:
                continue
            key = f"{target}::{vuln_id}"
            if key in seen:
                continue
            seen.add(key)
            setattr(counts, sev, getattr(counts, sev) + 1)

    return counts


def extract_standard_counts_by_target(doc: Any) -> Dict[str, SeverityCounts]:
    """
    Aggregate standard (SCA/container) vulnerability counts per normalized target.
    
    Processes the given Snyk-style document and produces a mapping from each normalized
    target to its severity counts. Vulnerabilities without a recognized severity are
    ignored. Duplicate vulnerabilities for the same target (by target + vulnerability id)
    are counted only once. Ensures every discovered target appears in the result with a
    SeverityCounts instance (zero counts when no vulnerabilities were counted).
    
    Returns:
        Dict[str, SeverityCounts]: Mapping from normalized target name to its severity counts
        (fields: critical, high, medium, low).
    """
    seen = set()
    by_target: Dict[str, SeverityCounts] = {}
    known_targets = set()

    for result in iter_standard_results(doc):
        target = target_name_standard(result)
        known_targets.add(target)
        by_target.setdefault(target, SeverityCounts())

        for vuln in ensure_list(result.get("vulnerabilities")):
            vuln_id = str(
                vuln.get("id")
                or vuln.get("packageName")
                or vuln.get("title")
                or "unknown-id"
            )
            sev = norm_severity(vuln.get("severity"))
            if not sev:
                continue
            key = f"{target}::{vuln_id}"
            if key in seen:
                continue
            seen.add(key)
            setattr(by_target[target], sev, getattr(by_target[target], sev) + 1)

    for target in known_targets:
        by_target.setdefault(target, SeverityCounts())

    return dict(sorted(by_target.items(), key=lambda x: x[0]))


def extract_iac_counts(doc: Any) -> SeverityCounts:
    """
    Aggregate infrastructure-as-code (IaC) issue severities into a SeverityCounts object, deduplicating issues by target and issue id.
    
    Parameters:
        doc (Any): Parsed JSON-like Snyk scan document or list of result objects; each result may contain issues under
            "infrastructureAsCodeIssues", "iacIssues", or "issues".
    
    Returns:
        SeverityCounts: Counts of IaC issues by severity (`critical`, `high`, `medium`, `low`). Issues without a mappable
        severity are ignored; duplicates (same target and issue id) are counted once.
    """
    seen = set()
    counts = SeverityCounts()

    for result in iter_standard_results(doc):
        target = target_name_iac(result)
        issues = (
            result.get("infrastructureAsCodeIssues")
            or result.get("iacIssues")
            or result.get("issues")
            or []
        )
        for issue in ensure_list(issues):
            issue_id = str(issue.get("id") or issue.get("title") or "unknown-id")
            sev = norm_severity(issue.get("severity"))
            if not sev:
                continue
            key = f"{target}::{issue_id}"
            if key in seen:
                continue
            seen.add(key)
            setattr(counts, sev, getattr(counts, sev) + 1)

    return counts


def extract_iac_counts_by_target(doc: Any) -> Dict[str, SeverityCounts]:
    """
    Aggregate Infrastructure-as-Code issue counts per target from a Snyk-like document.
    
    Iterates results in the input document, extracts IaC issues for each target, normalizes severities to `critical`, `high`, `medium`, or `low`, deduplicates issues by the combination of target and issue id/title, and increments the corresponding counters on a per-target SeverityCounts object. Issues with unknown or unrecognized severities are ignored.
    
    Returns:
        Dict[str, SeverityCounts]: Mapping from normalized target name to its SeverityCounts (fields: critical, high, medium, low).
    """
    seen = set()
    by_target: Dict[str, SeverityCounts] = {}
    known_targets = set()

    for result in iter_standard_results(doc):
        target = target_name_iac(result)
        known_targets.add(target)
        by_target.setdefault(target, SeverityCounts())

        issues = (
            result.get("infrastructureAsCodeIssues")
            or result.get("iacIssues")
            or result.get("issues")
            or []
        )
        for issue in ensure_list(issues):
            issue_id = str(issue.get("id") or issue.get("title") or "unknown-id")
            sev = norm_severity(issue.get("severity"))
            if not sev:
                continue
            key = f"{target}::{issue_id}"
            if key in seen:
                continue
            seen.add(key)
            setattr(by_target[target], sev, getattr(by_target[target], sev) + 1)

    for target in known_targets:
        by_target.setdefault(target, SeverityCounts())

    return dict(sorted(by_target.items(), key=lambda x: x[0]))


def extract_sast_counts(doc: Any) -> SeverityCounts:
    """
    Summarizes SAST (SARIF-like) scan results into severity counts, deduplicating issues.
    
    Processes the provided scan document (expected to be a SARIF-style dict with "runs") to determine each unique issue's severity and increments counts for `critical`, `high`, `medium`, or `low`. Issue identity is deduplicated using available fingerprints or a composite identifier derived from the artifact, region, and rule/message. When a rule or result-level severity is not present, a default severity of "medium" is used; unrecognized severity labels are ignored.
    
    Parameters:
        doc (Any): Parsed scan document (typically a SARIF-like dict) containing "runs", each with tool rules and results.
    
    Returns:
        SeverityCounts: Aggregated counts of unique SAST issues by severity (`critical`, `high`, `medium`, `low`).
    """
    counts = SeverityCounts()
    seen = set()

    runs = ensure_list(doc.get("runs")) if isinstance(doc, dict) else []
    rule_index: Dict[str, Any] = {}

    for run in runs:
        driver = (run.get("tool") or {}).get("driver") or {}
        for rule in ensure_list(driver.get("rules")):
            rule_id = rule.get("id")
            if not rule_id:
                continue
            rule_index[rule_id] = (
                ((rule.get("properties") or {}).get("severity"))
                or ((rule.get("properties") or {}).get("security-severity"))
                or ((rule.get("defaultConfiguration") or {}).get("level"))
                or "medium"
            )

    for run in runs:
        for result in ensure_list(run.get("results")):
            locations = ensure_list(result.get("locations"))
            first_loc = locations[0] if locations else {}
            physical = first_loc.get("physicalLocation") or {}
            artifact = physical.get("artifactLocation") or {}
            region = physical.get("region") or {}

            issue_id = (
                ((result.get("fingerprints") or {}).get("primaryLocationLineHash"))
                or f"{artifact.get('uri', 'unknown-file')}:{region.get('startLine', 0)}::{result.get('ruleId') or (result.get('message') or {}).get('text') or 'unknown-id'}"
            )

            sev = norm_severity(
                ((result.get("properties") or {}).get("severity"))
                or result.get("level")
                or rule_index.get(result.get("ruleId"))
                or "medium"
            )
            if not sev:
                continue
            if issue_id in seen:
                continue
            seen.add(issue_id)
            setattr(counts, sev, getattr(counts, sev) + 1)

    return counts


def status_for(severity_label: str, count: int) -> str:
    """
    Map a severity label and its count to a concise human-readable status.
    
    For "Critical" or "High" severities, returns "✅ Fixed" when the count is 0, otherwise "❌ Must fix".
    For "Medium" or "Low" severities, returns "✅ Fixed" when the count is 0, otherwise "ℹ️ Managed Debt".
    For any other severity label, returns "Unknown".
    
    Returns:
        status (str): One of "✅ Fixed", "❌ Must fix", "ℹ️ Managed Debt", or "Unknown".
    """
    if severity_label in {"Critical", "High"}:
        return "✅ Fixed" if count == 0 else "❌ Must fix"
    if severity_label in {"Medium", "Low"}:
        return "✅ Fixed" if count == 0 else "ℹ️ Managed Debt"
    return "Unknown"


def rel_link(path: Path, base: Path) -> str:
    """
    Compute the relative path from base to path.
    
    Both inputs are resolved to absolute paths before computing the relative path.
    
    Parameters:
        path (Path): Target filesystem path to be relativized.
        base (Path): Base filesystem path from which to compute the relative path.
    
    Returns:
        relative_path (str): The relative path from base to path.
    """
    return str(path.resolve().relative_to(base.resolve()))


def render_index_md(
    docs_dir: Path,
    html_dir: Path,
    timestamp_utc: str,
    scan_rows: List[Dict[str, Any]],
    totals: SeverityCounts,
) -> None:
    """
    Render a Markdown index of Snyk scan results and write it to docs_dir/index.md.
    
    Parameters:
        docs_dir (Path): Directory where the generated index.md will be written.
        html_dir (Path): Directory containing per-scan HTML artifacts referenced from the index.
        timestamp_utc (str): UTC timestamp string to display as the scan time in the index.
        scan_rows (List[Dict[str, Any]]): List of scan row mappings; each entry must contain:
            - "label" (str): human-friendly project/scan label,
            - "counts" (SeverityCounts): severity totals for that row,
            - optional "html_path" (str/Path): path to an HTML artifact; if present and exists,
              the index links to html/<artifact-name>.
        totals (SeverityCounts): Aggregate severity totals used to populate the Aggregate Summary section.
    """
    project_rows: List[str] = []

    for row in scan_rows:
        link = "-"
        html_path = row.get("html_path")
        if html_path:
            p = Path(html_path)
            if p.exists():
                link = f"[{row['label']}](html/{p.name})"
            else:
                link = row["label"]
        else:
            link = row["label"]

        counts: SeverityCounts = row["counts"]
        project_rows.append(
            f"| {link} | {timestamp_utc} | {counts.critical} | {counts.high} | {counts.medium} | {counts.low} |"
        )

    artifact_rows = []
    for artifact_name in [
        "snyk-sca.html",
        "snyk-code.html",
        "snyk-container-client.html",
        "snyk-container-server.html",
        "snyk-iac.html",
    ]:
        p = html_dir / artifact_name
        artifact_rows.append(
            f"| {artifact_name.removesuffix('.html')} | "
            f"{f'[html/{artifact_name}](html/{artifact_name})' if p.exists() else '-'} |"
        )

    content = "\n".join(
        [
            "# Snyk Scans",
            "",
            "This document contains the latest Snyk scan index for this repository.",
            "",
            "## Projects",
            "",
            "| Project | Tested | C | H | M | L |",
            "| :--- | :--- | ---: | ---: | ---: | ---: |",
            *project_rows,
            "",
            "## Aggregate Summary",
            "",
            "| Severity | Count |",
            "| :--- | ---: |",
            f"| Critical | {totals.critical} |",
            f"| High | {totals.high} |",
            f"| Medium | {totals.medium} |",
            f"| Low | {totals.low} |",
            "",
            "## Artifacts",
            "",
            "| Scan | HTML |",
            "| :--- | :--- |",
            *artifact_rows,
            "",
            "## Notes",
            "",
            "- Counts are aggregated across SCA, Code, container, and IaC scans.",
            "- Container findings come from real built local images, not Dockerfile-only analysis.",
            "- SCA scope reflects the actual Snyk CLI invocation used by the orchestration script.",
            "- Generated at: " + timestamp_utc + " UTC",
            "",
        ]
    )

    (docs_dir / "index.md").write_text(content, encoding="utf-8")


def update_readme(
    readme_path: Path,
    baseline: Dict[str, int],
    totals: SeverityCounts,
    timestamp_utc: str,
) -> None:
    """
    Replace the Automated Security Posture block in the README (between README_BEGIN and README_END markers) with a generated table of baseline and current severity counts and a last-scanned timestamp.
    
    Parameters:
        readme_path (Path): Path to the README file to update.
        baseline (Dict[str, int]): Mapping with integer counts for keys "critical", "high", "medium", and "low" representing the initial baseline.
        totals (SeverityCounts): Current aggregated severity counts.
        timestamp_utc (str): UTC timestamp string to include as the "Last scanned" value.
    
    Raises:
        SystemExit: If the README_BEGIN/README_END markers are not found in the README file.
    """
    text = readme_path.read_text(encoding="utf-8")

    replacement = f"""{README_BEGIN}
### Automated Security Posture

| Severity | Initial Count | Current Count | Status |
| :--- | :---: | :---: | :--- |
| **Critical** | {baseline['critical']} | {totals.critical} | {status_for('Critical', totals.critical)} |
| **High** | {baseline['high']} | {totals.high} | {status_for('High', totals.high)} |
| **Medium** | {baseline['medium']} | {totals.medium} | {status_for('Medium', totals.medium)} |
| **Low** | {baseline['low']} | {totals.low} | {status_for('Low', totals.low)} |

*Last scanned (UTC): {timestamp_utc}*
{README_END}"""

    pattern = re.compile(
        re.escape(README_BEGIN) + r".*?" + re.escape(README_END), re.DOTALL
    )
    if not pattern.search(text):
        raise SystemExit(
            "README markers not found. Add BEGIN/END markers under the intended section."
        )

    updated = pattern.sub(replacement, text, count=1)
    readme_path.write_text(updated, encoding="utf-8")


def label_for_scan(scan: Dict[str, Any], per_target_label: Optional[str] = None) -> str:
    """
    Produce a human-friendly label for a scan record.
    
    Parameters:
        scan (Dict[str, Any]): Scan metadata; expected keys include "kind" (scan type), "name", and optional "source_ref".
        per_target_label (Optional[str]): Optional per-target display name used for SCA or IaC scans.
    
    Returns:
        str: A formatted label appropriate for the scan kind (e.g., "Code analysis", "SCA: <source_ref>", "Container: <path>", or a normalized display name).
    """
    name = scan["name"]
    source_ref = normalize_display_target(scan.get("source_ref") or "")

    if scan["kind"] == "sast":
        return "Code analysis"

    if scan["kind"] == "sca":
        if per_target_label:
            return f"npm dependencies: {normalize_display_target(per_target_label)}"
        return f"SCA: {source_ref}"

    if scan["kind"] == "container":
        if "client" in name:
            return "Container: app/docker/Dockerfile.client"
        if "server" in name:
            return "Container: app/docker/Dockerfile.server"
        return f"Container: {source_ref}"

    if scan["kind"] == "iac":
        return normalize_display_target(per_target_label or "k8s")

    return normalize_display_target(name)


def parse_baseline(path: Path) -> Dict[str, int]:
    """
    Parse a baseline JSON file into a mapping of severity levels to integer counts.
    
    Loads the JSON at `path` and returns a dict with keys "critical", "high", "medium", and "low".
    Missing keys default to 0; values are converted to ints.
    
    Parameters:
        path (Path): Filesystem path to the baseline JSON file.
    
    Returns:
        Dict[str, int]: Mapping with integer counts for "critical", "high", "medium", and "low".
    
    Raises:
        SystemExit: If the JSON root is not an object.
    """
    raw = load_json(path)
    if not isinstance(raw, dict):
        raise SystemExit(f"Baseline file must be a JSON object: {path}")

    return {
        "critical": int(raw.get("critical", 0)),
        "high": int(raw.get("high", 0)),
        "medium": int(raw.get("medium", 0)),
        "low": int(raw.get("low", 0)),
    }


def main() -> int:
    """
    Orchestrates loading scan metadata and baseline, aggregates severity counts, renders an index.md, and optionally updates the README.
    
    Validates paths (ensuring docs/html/readme locations are within the repository/docs directory), loads and parses the provided metadata and baseline JSON files, computes per-scan and aggregate severity counts for supported scan kinds (sast, sca, container, iac), writes the rendered index into the docs directory, and updates the README when requested. Prints aggregate totals to stdout.
    
    Returns:
        int: 0 on success.
    
    Raises:
        SystemExit: on invalid arguments or path validation failures, missing/invalid JSON, malformed metadata (e.g., missing "scans" list), or unsupported scan kinds.
    """
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--docs-dir", required=True)
    parser.add_argument("--html-dir", required=True)
    parser.add_argument("--readme", required=True)
    parser.add_argument("--timestamp-utc", required=True)
    parser.add_argument("--update-readme", required=True)
    args = parser.parse_args()

    metadata_path = Path(args.metadata).resolve()
    baseline_path = Path(args.baseline).resolve()
    docs_dir = Path(args.docs_dir)
    docs_dir_resolved = docs_dir.resolve()

    repo_root = Path.cwd().resolve()
    try:
        docs_dir_resolved.relative_to(repo_root)
    except ValueError:
        raise SystemExit(f"--docs-dir must be within {repo_root}, got {docs_dir_resolved}")

    try:
        metadata_path.relative_to(repo_root)
    except ValueError:
        raise SystemExit(
            f"--metadata path must be within repo root ({repo_root}): {metadata_path}"
        )

    try:
        baseline_path.relative_to(repo_root)
    except ValueError:
        raise SystemExit(
            f"--baseline path must be within repo root ({repo_root}): {baseline_path}"
        )

    html_dir = Path(args.html_dir).resolve()
    try:
        html_dir.relative_to(docs_dir_resolved)
    except ValueError:
        raise SystemExit(
            f"--html-dir path must be within --docs-dir ({docs_dir_resolved}): {html_dir}"
        )

    # Construct the README path from the docs directory and user-provided argument,
    # then resolve it and ensure it is contained within docs_dir_resolved.
    readme_arg_path = Path(args.readme)
    readme_path = (docs_dir_resolved / readme_arg_path).resolve()
    try:
        readme_path.relative_to(docs_dir_resolved)
    except ValueError:
        raise SystemExit(
            f"--readme path must be within --docs-dir ({docs_dir_resolved}): {readme_path}"
        )

    # Extra safety check to ensure the resolved path is under docs_dir_resolved.
    docs_dir_str = str(docs_dir_resolved)
    readme_path_str = str(readme_path)
    if not (readme_path_str == docs_dir_str or readme_path_str.startswith(docs_dir_str + "/")):
        raise SystemExit(
            f"--readme path must be within --docs-dir ({docs_dir_resolved}): {readme_path}"
        )

    metadata = load_json(metadata_path)
    baseline = parse_baseline(baseline_path)

    scans = metadata.get("scans", [])
    if not isinstance(scans, list):
        raise SystemExit("scan metadata must contain a 'scans' list")

    aggregate = SeverityCounts()
    rows: List[Dict[str, Any]] = []

    for scan in scans:
        parse_input_path = Path(scan.get("parse_input_path") or scan["json_path"])
        html_path = scan.get("html_path")
        doc = load_json(parse_input_path)

        if scan["kind"] == "sast":
            counts = extract_sast_counts(doc)
            aggregate.add(counts)
            rows.append(
                {
                    "label": label_for_scan(scan),
                    "counts": counts,
                    "html_path": html_path,
                }
            )

        elif scan["kind"] == "sca":
            by_target = extract_standard_counts_by_target(doc)
            counts = extract_standard_counts(doc)
            aggregate.add(counts)
            for target, target_counts in by_target.items():
                rows.append(
                    {
                        "label": label_for_scan(scan, target),
                        "counts": target_counts,
                        "html_path": html_path,
                    }
                )

        elif scan["kind"] == "container":
            counts = extract_standard_counts(doc)
            aggregate.add(counts)
            rows.append(
                {
                    "label": label_for_scan(scan),
                    "counts": counts,
                    "html_path": html_path,
                }
            )

        elif scan["kind"] == "iac":
            by_target = extract_iac_counts_by_target(doc)
            counts = extract_iac_counts(doc)
            aggregate.add(counts)
            if by_target:
                for target, target_counts in by_target.items():
                    rows.append(
                        {
                            "label": label_for_scan(scan, target),
                            "counts": target_counts,
                            "html_path": html_path,
                        }
                    )
            else:
                rows.append(
                    {
                        "label": label_for_scan(scan),
                        "counts": counts,
                        "html_path": html_path,
                    }
                )

        else:
            raise SystemExit(f"Unsupported scan kind: {scan['kind']}")

    render_index_md(
        docs_dir=docs_dir_resolved,
        html_dir=html_dir,
        timestamp_utc=args.timestamp_utc,
        scan_rows=rows,
        totals=aggregate,
    )

    if args.update_readme == "1":
        update_readme(
            readme_path=readme_path,
            baseline=baseline,
            totals=aggregate,
            timestamp_utc=args.timestamp_utc,
        )

    print(
        "\n".join(
            [
                "Aggregate totals:",
                f"  Critical: {aggregate.critical}",
                f"  High:     {aggregate.high}",
                f"  Medium:   {aggregate.medium}",
                f"  Low:      {aggregate.low}",
            ]
        )
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
