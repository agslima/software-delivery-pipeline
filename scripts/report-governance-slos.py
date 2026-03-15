#!/usr/bin/env python3
"""Generate governance SLO summary and machine-readable report artifacts."""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import math
import pathlib
import re
import subprocess
import sys
from typing import Any


@dataclasses.dataclass
class TelemetryData:
    """Container for workflow and issue telemetry data."""

    release_runs: list[dict[str, Any]]
    release_jobs: dict[int, list[dict[str, Any]]]
    pr_runs: list[dict[str, Any]]
    pr_jobs: dict[int, list[dict[str, Any]]]
    issues_cache: dict[str, Any]


def fail(message: str) -> None:
    """Emit a GitHub Actions error annotation and exit."""
    print(f"::error::{message}", file=sys.stderr)
    raise SystemExit(1)


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for live and fixture-backed report generation."""
    parser = argparse.ArgumentParser(
        description="Generate governance SLO summary.md and report.json from workflow telemetry.",
    )
    parser.add_argument("--repo", help="Repository in owner/name form for live mode.")
    parser.add_argument(
        "--fixtures-dir",
        help="Read telemetry from a fixture directory instead of GitHub.",
    )
    parser.add_argument(
        "--output-dir",
        default="artifacts/governance-slo-report",
        help="Directory for generated artifacts.",
    )
    parser.add_argument(
        "--debt-file",
        default="docs/security-debt.md",
        help="Path to the security debt registry.",
    )
    return parser.parse_args()


def load_json(path: pathlib.Path) -> Any:
    """Load and return JSON content from a file path."""
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def safe_resolve_file(base_dir: pathlib.Path, path_str: str) -> pathlib.Path:
    """
    Safely resolve a file path provided by the user against a trusted base directory.

    The resulting path is normalized and required to remain within ``base_dir``.
    """
    candidate = base_dir.joinpath(path_str)
    resolved = candidate.resolve(strict=False)
    try:
        # Python 3.9+: pathlib.Path.is_relative_to
        is_within_base = resolved.is_relative_to(base_dir)
    except AttributeError:
        # Fallback for older Python versions.
        base_str = str(base_dir)
        resolved_str = str(resolved)
        is_within_base = pathlib.PurePath(resolved_str).as_posix().startswith(
            pathlib.PurePath(base_str).as_posix().rstrip("/") + "/"
        ) or pathlib.PurePath(resolved_str).as_posix() == pathlib.PurePath(
            base_str
        ).as_posix()

    if not is_within_base:
        fail(f"Refusing to access file outside base directory: {resolved}")
    return resolved


def gh_api(repo: str, path: str) -> Any:
    """Fetch and decode a JSON response from the GitHub CLI API wrapper."""
    try:
        result = subprocess.run(
            ["gh", "api", "-H", "Accept: application/vnd.github+json", path],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        fail(f"gh api failed for {path}: {exc.stderr.strip() or exc.stdout.strip()}")
    return json.loads(result.stdout)


def iso_to_date(value: str) -> dt.date:
    """Convert an ISO 8601 timestamp string into a UTC date."""
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).date()


def markdown_table_row(row: list[str]) -> str:
    """Render a list of cells as a Markdown table row."""
    return "| " + " | ".join(row) + " |"


def percentile(values: list[int], p: float) -> float:
    """Calculate a linear-interpolated percentile for integer samples."""
    if not values:
        return math.nan
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    rank = (len(ordered) - 1) * p
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return float(ordered[lower])
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (rank - lower)


def read_resolved_debt_entries(path: pathlib.Path) -> list[dict[str, str]]:
    """
    Extract the "Resolved Debt (Historical)" Markdown table from a governance document and return its rows as dictionaries.
    
    Reads the file at the given path, locates a Markdown table under the heading "Resolved Debt (Historical)", and parses each data row into a dict keyed by the table header names. Header and cell values are trimmed of surrounding whitespace. Rows with a differing number of cells than the header are ignored.
    
    Parameters:
        path (pathlib.Path): Path to the governance document to read.
    
    Returns:
        list[dict[str, str]]: A list of dictionaries mapping header names to cell values for each valid table row; returns an empty list if the table is not found or contains no valid rows.
    """
    text = path.read_text(encoding="utf-8")
    match = re.search(
        r"## Resolved Debt \(Historical\)\n\n(\|.*(?:\n\|.*)*)",
        text,
        flags=re.MULTILINE,
    )
    if not match:
        return []

    lines = [
        line.strip()
        for line in match.group(1).splitlines()
        if line.strip().startswith("|")
    ]
    if len(lines) < 3:
        return []

    headers = [cell.strip() for cell in lines[0].strip("|").split("|")]
    entries: list[dict[str, str]] = []
    for line in lines[2:]:
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) != len(headers):
            continue
        entries.append(dict(zip(headers, cells, strict=True)))
    return entries


def count_success_conclusions(runs: list[dict[str, Any]]) -> tuple[int, int]:
    """
    Count successful runs among completed, relevant workflow or job run entries.
    
    Parameters:
        runs (list[dict[str, Any]]): Sequence of run objects as returned by GitHub API.
    
    Returns:
        tuple[int, int]: (success_count, relevant_count) where `success_count` is the number of runs with conclusion `"success"`, and `relevant_count` is the number of runs whose conclusion is not `"cancelled"`, not `"skipped"`, and not `None`.
    """
    relevant = [
        run
        for run in runs
        if run.get("conclusion") not in {"cancelled", "skipped", None}
    ]
    successes = [run for run in relevant if run.get("conclusion") == "success"]
    return len(successes), len(relevant)


def get_backend_infra_jobs(
    jobs_by_run: dict[int, list[dict[str, Any]]]
) -> list[dict[str, Any]]:
    """Select backend Infra Hygiene jobs from CI workflow job listings."""
    selected: list[dict[str, Any]] = []
    for jobs in jobs_by_run.values():
        for job in jobs:
            name = job.get("name", "")
            if "Infra Hygiene" in name and "backend" in name:
                selected.append(job)
    return selected


def build_status(actual: float, target: float, comparator: str, samples: int) -> str:
    """
    Determine the SLO status for a measured value against an objective.
    
    Accepts comparator values "gte" (actual must be greater than or equal to target)
    or "lte" (actual must be less than or equal to target).
    
    Parameters:
        comparator (str): Comparison operator to apply; one of "gte" or "lte".
    
    Returns:
        str: "pass" if the measurement meets the objective, "breach" if it does not,
        "insufficient_data" if samples is zero.
    
    Raises:
        ValueError: If an unknown comparator is provided.
    """
    if samples == 0:
        return "insufficient_data"
    if comparator == "gte":
        return "pass" if actual >= target else "breach"
    if comparator == "lte":
        return "pass" if actual <= target else "breach"
    raise ValueError(f"Unknown comparator {comparator}")


def collect_live_inputs(repo: str) -> TelemetryData:
    """
    Collect live telemetry from GitHub Actions for the given repository and return it as a TelemetryData instance.
    
    Parameters:
        repo (str): Repository in "owner/name" form used to query the GitHub API.
    
    Returns:
        TelemetryData: Contains:
            - release_runs: up to 20 completed runs for the "ci-release-gate" workflow.
            - release_jobs: empty dict (individual release job lists are not fetched here).
            - pr_runs: up to 20 completed runs for the "ci-pr-validation" workflow.
            - pr_jobs: mapping of PR run id to its jobs (up to 100 jobs per run).
            - issues_cache: empty dict (issue lookups are not populated).
    """
    release_runs = gh_api(
        repo,
        f"repos/{repo}/actions/workflows/ci-release-gate.yml/runs?per_page=20&status=completed",
    ).get("workflow_runs", [])
    pr_runs = gh_api(
        repo,
        f"repos/{repo}/actions/workflows/ci-pr-validation.yml/runs?per_page=20&status=completed",
    ).get("workflow_runs", [])

    pr_jobs: dict[int, list[dict[str, Any]]] = {}
    for run in pr_runs:
        pr_jobs[int(run["id"])] = gh_api(
            repo,
            f"repos/{repo}/actions/runs/{run['id']}/jobs?per_page=100",
        ).get("jobs", [])

    return TelemetryData(
        release_runs=release_runs,
        release_jobs={},
        pr_runs=pr_runs,
        pr_jobs=pr_jobs,
        issues_cache={},
    )


def collect_fixture_inputs(fixtures_dir: pathlib.Path) -> TelemetryData:
    """
    Load telemetry fixtures from a directory and assemble a TelemetryData object.
    
    The function reads the following JSON files from fixtures_dir:
    - release-runs.json (expects key "workflow_runs")
    - pr-runs.json (expects key "workflow_runs")
    - issues.json (full issues cache)
    - jobs-release-<id>.json for each release run id (expects key "jobs")
    - jobs-pr-<id>.json for each PR run id (expects key "jobs")
    
    Parameters:
        fixtures_dir (pathlib.Path): Directory containing the fixture JSON files.
    
    Returns:
        TelemetryData: Dataclass populated with release_runs, release_jobs (mapping run id -> jobs list),
                       pr_runs, pr_jobs (mapping run id -> jobs list), and issues_cache.
    """
    release_runs = load_json(fixtures_dir / "release-runs.json").get(
        "workflow_runs", []
    )
    pr_runs = load_json(fixtures_dir / "pr-runs.json").get("workflow_runs", [])
    issues_cache = load_json(fixtures_dir / "issues.json")

    release_jobs: dict[int, list[dict[str, Any]]] = {}
    for run in release_runs:
        release_jobs[int(run["id"])] = load_json(
            fixtures_dir / f"jobs-release-{run['id']}.json"
        ).get("jobs", [])

    pr_jobs: dict[int, list[dict[str, Any]]] = {}
    for run in pr_runs:
        pr_jobs[int(run["id"])] = load_json(
            fixtures_dir / f"jobs-pr-{run['id']}.json"
        ).get("jobs", [])

    return TelemetryData(
        release_runs=release_runs,
        release_jobs=release_jobs,
        pr_runs=pr_runs,
        pr_jobs=pr_jobs,
        issues_cache=issues_cache,
    )


def get_issue(
    repo: str, issue_ref: str, issues_cache: dict[str, Any], fixtures: bool
) -> dict[str, Any] | None:
    """
    Resolve a GitHub issue reference and return its issue data, using fixtures or the live GitHub API with caching.
    
    Parameters:
        issue_ref (str): Issue reference in the form "#<number>"; returns `None` if the string does not match this pattern.
        issues_cache (dict[str, Any]): Mutable cache keyed by issue number (string). When not in fixtures mode, a fetched issue will be stored in this cache.
        fixtures (bool): If True, only read from `issues_cache` and do not call the GitHub API.
    
    Returns:
        dict[str, Any] | None: The issue data dictionary if the reference is resolved and available, `None` if the reference is invalid or the issue is not present in fixtures mode.
    """
    match = re.fullmatch(r"#(\d+)", issue_ref.strip())
    if not match:
        return None
    issue_number = match.group(1)
    if fixtures:
        return issues_cache.get(issue_number)
    if issue_number not in issues_cache:
        issues_cache[issue_number] = gh_api(repo, f"repos/{repo}/issues/{issue_number}")
    return issues_cache[issue_number]


def safe_resolve_dir(base_dir: pathlib.Path, target: str) -> pathlib.Path:
    """
    Resolve a target path within a trusted base directory and refuse targets that escape it.
    
    Parameters:
        base_dir (pathlib.Path): The trusted base directory to contain the resolved path.
        target (str): A path relative to `base_dir` (may include subdirectories); absolute or traversal attempts outside `base_dir` are rejected.
    
    Returns:
        pathlib.Path: The resolved absolute path for `target` guaranteed to be within `base_dir`.
    """
    base_dir_resolved = base_dir.resolve()
    # Resolve the target path relative to the trusted base directory to prevent
    # directory traversal or writing outside the intended tree.
    target_path = (base_dir_resolved / target).resolve()
    try:
        is_within_base = target_path.is_relative_to(base_dir_resolved)  # type: ignore[attr-defined]
    except AttributeError:
        # Fallback for Python versions without Path.is_relative_to (pre-3.9)
        is_within_base = str(target_path).startswith(str(base_dir_resolved) + str(pathlib.os.sep))
    if not is_within_base:
        fail(
            f"Refusing to write or read outside of base directory {base_dir_resolved}: {target_path}"
        )
    return target_path


def generate_slos(
    data: TelemetryData,
    repository_name: str,
    fixtures_mode: bool,
    debt_file: pathlib.Path,
) -> list[dict[str, Any]]:
    """
    Compute SLO metrics from telemetry and resolved debt entries and return a list of SLO definition dictionaries with computed actuals, samples, and status.
    
    Parameters:
        data (TelemetryData): Collected telemetry including release and PR runs, job details, and cached issues.
        repository_name (str): Repository identifier in owner/name form used to resolve issue links.
        fixtures_mode (bool): If true, resolve issues from the provided fixtures cache instead of calling the GitHub API.
        debt_file (pathlib.Path): Path to the security debt document from which resolved debt entries are read.
    
    Returns:
        list[dict[str, Any]]: A list of SLO dictionaries. Each dictionary contains keys such as:
            - id, name, target, objective, comparator
            - actual (numeric), unit (e.g., "percent" or "days"), samples (int), window, source, owner, breach_response
            - status: one of "pass", "breach", or "insufficient_data" determined by comparing actual to the objective.
    """
    resolved_entries = read_resolved_debt_entries(debt_file)
    remediation_days: list[int] = []

    for entry in resolved_entries:
        issue = get_issue(
            repository_name,
            entry.get("Ticket/Link", ""),
            data.issues_cache,
            fixtures_mode,
        )
        if not issue:
            continue
        try:
            resolved_on = dt.date.fromisoformat(entry["Date Resolved (YYYY-MM-DD)"])
            created_on = iso_to_date(issue["created_at"])
        except (KeyError, ValueError):
            continue
        remediation_days.append((resolved_on - created_on).days)

    release_successes, release_samples = count_success_conclusions(data.release_runs)
    release_rate = (
        round((release_successes / release_samples) * 100, 1)
        if release_samples
        else math.nan
    )

    backend_policy_jobs = get_backend_infra_jobs(data.pr_jobs)
    policy_successes, policy_samples = count_success_conclusions(backend_policy_jobs)
    policy_rate = (
        round((policy_successes / policy_samples) * 100, 1)
        if policy_samples
        else math.nan
    )

    p80_remediation = (
        round(percentile(remediation_days, 0.8), 1) if remediation_days else math.nan
    )

    slos = [
        {
            "id": "release-gate-reliability",
            "name": "Release-gate reliability",
            "target": ">= 95% success over the last 20 completed Release workflow runs",
            "objective": 95.0,
            "comparator": "gte",
            "actual": release_rate,
            "unit": "percent",
            "samples": release_samples,
            "window": "Last 20 completed Release workflow runs",
            "source": [
                ".github/workflows/ci-release-gate.yml",
                "GitHub Actions workflow runs API",
                "Release artifacts: digest-*, trivy-results-*, zap-results, sbom-*",
            ],
            "owner": "Project Maintainers",
            "breach_response": "Review the failed Release runs within 2 business days, classify workflow/tooling failure vs policy block, and document corrective action in the governance evidence trail.",
        },
        {
            "id": "remediation-lead-time",
            "name": "Remediation lead time",
            "target": "p80 <= 30 days from linked issue creation to resolved debt entry date",
            "objective": 30.0,
            "comparator": "lte",
            "actual": p80_remediation,
            "unit": "days",
            "samples": len(remediation_days),
            "window": "All resolved debt entries with GitHub issue links in docs/security-debt.md",
            "source": [
                "docs/security-debt.md",
                "GitHub Issues API",
                ".github/workflows/ci-security-deep.yml",
            ],
            "owner": "Project Maintainers",
            "breach_response": "Open or update the linked remediation ticket, assign an accountable owner within 2 business days, and review whether expiry dates or backlog size need adjustment.",
        },
        {
            "id": "policy-test-health",
            "name": "Policy-test health",
            "target": ">= 95% success for backend Infra Hygiene jobs over the last 20 completed CI workflow runs",
            "objective": 95.0,
            "comparator": "gte",
            "actual": policy_rate,
            "unit": "percent",
            "samples": policy_samples,
            "window": "Last 20 completed CI workflow runs",
            "source": [
                ".github/workflows/ci-pr-validation.yml",
                "GitHub Actions jobs API (`Infra Hygiene (backend)`)",
                "Kyverno test fixtures under k8s/tests/",
            ],
            "owner": "Project Maintainers",
            "breach_response": "Treat a breach as governance regression risk: inspect failing backend Infra Hygiene jobs within 2 business days, restore policy-test green status, and record any temporary exception or tooling issue.",
        },
    ]

    for slo in slos:
        slo["status"] = build_status(
            float(slo["actual"]),
            float(slo["objective"]),
            slo["comparator"],
            int(slo["samples"]),
        )

    return slos


def create_markdown_summary(
    repository_name: str,
    mode: str,
    generated_at: str,
    overall_status: str,
    slos: list[dict[str, Any]],
) -> str:
    """
    Create a Markdown-formatted governance SLO report.
    
    Parameters:
        repository_name (str): Repository identifier in "owner/name" form used in the header.
        mode (str): Data source label (e.g., "fixtures" or "live") used in the header.
        generated_at (str): UTC timestamp string shown in the header.
        overall_status (str): Aggregate status shown in the header (e.g., "pass", "breach", "insufficient_data").
        slos (list[dict[str, Any]]): List of SLO dictionaries. Each dictionary is expected to contain the keys:
            - name (str)
            - target (str)
            - actual (float or numeric-string; may be NaN)
            - unit (str)
            - samples (int)
            - status (str)
            - owner (str)
            - source (list[str])
            - breach_response (str)
    
    Returns:
        str: The complete report as a Markdown-formatted string.
    """
    summary_lines = [
        "# Governance SLO Report",
        "",
        f"- **Repository:** `{repository_name}`",
        f"- **Mode:** `{mode}`",
        f"- **Generated at (UTC):** `{generated_at}`",
        f"- **Overall status:** `{overall_status}`",
        "",
        markdown_table_row(["SLO", "Target", "Actual", "Samples", "Status"]),
        markdown_table_row([":---", ":---", "---:", "---:", ":---"]),
    ]

    for slo in slos:
        actual = (
            "n/a"
            if math.isnan(float(slo["actual"]))
            else f"{slo['actual']} {slo['unit']}"
        )
        summary_lines.append(
            markdown_table_row(
                [
                    slo["name"],
                    slo["target"],
                    actual,
                    str(slo["samples"]),
                    slo["status"],
                ]
            )
        )

    summary_lines.extend(["", "## Breach Response", ""])
    for slo in slos:
        summary_lines.extend(
            [
                f"### {slo['name']}",
                f"- **Owner:** {slo['owner']}",
                f"- **Telemetry:** {', '.join(slo['source'])}",
                f"- **Response:** {slo['breach_response']}",
                "",
            ]
        )

    return "\n".join(summary_lines)


def main() -> None:
    """Generate the governance SLO report and fail on measured breaches."""
    args = parse_args()
    base_dir = pathlib.Path.cwd().resolve()

    output_dir = safe_resolve_dir(base_dir, args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    debt_file = safe_resolve_file(base_dir, args.debt_file)
    if not debt_file.exists():
        fail(f"Missing security debt registry: {debt_file}")

    fixtures_mode = bool(args.fixtures_dir)
    repo = args.repo or ""
    if not fixtures_mode and not repo:
        fail("Repository must be provided via --repo in live mode.")

    # Data Collection Phase
    if fixtures_mode:
        fixtures_dir = safe_resolve_dir(base_dir, args.fixtures_dir)
        if not fixtures_dir.exists():
            fail(f"Fixtures directory not found: {fixtures_dir}")

        data = collect_fixture_inputs(fixtures_dir)
        mode = "fixture"
        repository_name = repo or "fixtures/software-delivery-pipeline"
    else:
        if subprocess.run(["which", "gh"], capture_output=True).returncode != 0:
            fail("gh CLI is required in live mode.")

        data = collect_live_inputs(repo)
        mode = "live"
        repository_name = repo

    # Processing Phase
    slos = generate_slos(data, repository_name, fixtures_mode, debt_file)

    overall_status = "pass"
    for slo in slos:
        if slo["status"] == "breach":
            overall_status = "breach"
        elif slo["status"] == "insufficient_data" and overall_status != "breach":
            overall_status = "insufficient_data"

    generated_at = (
        dt.datetime.now(dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )

    # Artifact Generation Phase
    report = {
        "schema_version": "1",
        "repository": repository_name,
        "mode": mode,
        "generated_at": generated_at,
        "overall_status": overall_status,
        "slos": slos,
    }

    report_path = output_dir / "report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    summary_path = output_dir / "summary.md"
    markdown_content = create_markdown_summary(
        repository_name, mode, generated_at, overall_status, slos
    )
    summary_path.write_text(markdown_content, encoding="utf-8")

    print(f"[governance-slo-report] report: {report_path}")
    print(f"[governance-slo-report] summary: {summary_path}")

    if overall_status == "breach":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
