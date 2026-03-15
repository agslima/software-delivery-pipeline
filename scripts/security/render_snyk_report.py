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
        self.critical += other.critical
        self.high += other.high
        self.medium += other.medium
        self.low += other.low
        return self

    def as_dict(self) -> Dict[str, int]:
        return {
            "critical": self.critical,
            "high": self.high,
            "medium": self.medium,
            "low": self.low,
        }


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"Missing JSON file: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in {path}: {exc}")


def norm_severity(value: Any) -> Optional[str]:
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
    return value if isinstance(value, list) else []


def target_name_standard(result: Dict[str, Any]) -> str:
    return normalize_display_target(
        result.get("displayTargetFile")
        or result.get("targetFile")
        or result.get("projectName")
        or result.get("docker")
        or result.get("image")
        or "unknown-target"
    )


def target_name_iac(result: Dict[str, Any]) -> str:
    raw = (
        result.get("path")
        or result.get("targetFile")
        or result.get("displayTargetFile")
        or result.get("projectName")
        or "unknown-target"
    )
    return normalize_display_target(raw)


def normalize_display_target(target: str) -> str:
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
    if severity_label in {"Critical", "High"}:
        return "✅ Fixed" if count == 0 else "❌ Must fix"
    if severity_label in {"Medium", "Low"}:
        return "✅ Fixed" if count == 0 else "ℹ️ Managed Debt"
    return "Unknown"


def rel_link(path: Path, base: Path) -> str:
    return str(path.resolve().relative_to(base.resolve()))


def render_index_md(
    docs_dir: Path,
    html_dir: Path,
    timestamp_utc: str,
    scan_rows: List[Dict[str, Any]],
    totals: SeverityCounts,
) -> None:
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--docs-dir", required=True)
    parser.add_argument("--html-dir", required=True)
    parser.add_argument("--readme", required=True)
    parser.add_argument("--timestamp-utc", required=True)
    parser.add_argument("--update-readme", required=True)
    args = parser.parse_args()

    metadata_path = Path(args.metadata)
    baseline_path = Path(args.baseline)
    docs_dir = Path(args.docs_dir)
    docs_dir_resolved = docs_dir.resolve()

    html_dir = Path(args.html_dir).resolve()
    try:
        html_dir.relative_to(docs_dir_resolved)
    except ValueError:
        raise SystemExit(
            f"--html-dir path must be within --docs-dir ({docs_dir_resolved}): {html_dir}"
        )

    readme_path = (docs_dir_resolved / args.readme).resolve()
    try:
        readme_path.relative_to(docs_dir_resolved)
    except ValueError:
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
        docs_dir=docs_dir,
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
