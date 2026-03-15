#!/usr/bin/env python3
# pylint: disable=invalid-name
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


@dataclasses.dataclass(frozen=True)
class RuntimeConfig:
    """Validated runtime inputs for report generation."""

    base_dir: pathlib.Path
    output_dir: pathlib.Path
    debt_file: pathlib.Path
    fixtures_dir: pathlib.Path | None
    repo: str
    fixtures_mode: bool


RELEASE_GATE_RESPONSE = (
    "Review the failed Release runs within 2 business days, classify "
    "workflow/tooling failure vs policy block, and document corrective action "
    "in the governance evidence trail."
)
REMEDIATION_RESPONSE = (
    "Open or update the linked remediation ticket, assign an accountable owner "
    "within 2 business days, and review whether expiry dates or backlog size "
    "need adjustment."
)
POLICY_TEST_RESPONSE = (
    "Treat a breach as governance regression risk: inspect failing backend "
    "Infra Hygiene jobs within 2 business days, restore policy-test green "
    "status, and record any temporary exception or tooling issue."
)


def fail(message: str) -> None:
    """Emit a GitHub Actions error annotation and exit."""
    print(f"::error::{message}", file=sys.stderr)
    raise SystemExit(1)


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for live and fixture-backed report generation."""
    parser = argparse.ArgumentParser(
        description=(
            "Generate governance SLO summary.md and report.json from "
            "workflow telemetry."
        ),
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


def resolve_within_base(
    base_dir: pathlib.Path, target: str, label: str, expect_directory: bool
) -> pathlib.Path:
    """
    Resolve a user-provided path against a trusted base directory.

    Only repository-relative paths are accepted. The resulting path must remain within
    the trusted base directory.
    """
    base_dir_resolved = base_dir.resolve()
    normalized_target = target.replace("\\", "/")
    candidate_parts = pathlib.PurePosixPath(normalized_target).parts

    if not normalized_target or normalized_target.startswith("~"):
        fail(f"{label} must be a repository-relative path, got: {target}")
    if pathlib.PurePosixPath(normalized_target).is_absolute() or (
        len(normalized_target) >= 2
        and normalized_target[1] == ":"
        and normalized_target[0].isalpha()
    ):
        fail(
            f"{label} must be relative to {base_dir_resolved}, got absolute path: {target}"
        )
    if any(part == ".." for part in candidate_parts):
        fail(f"{label} must not traverse outside {base_dir_resolved}: {target}")

    candidate = base_dir_resolved.joinpath(*candidate_parts)
    resolved = candidate.resolve(strict=False)
    try:
        # Python 3.9+: direct containment check
        is_within_base = resolved.is_relative_to(base_dir_resolved)
    except AttributeError:
        # Fallback for older Python versions: use relative_to instead of string prefix logic.
        try:
            resolved.relative_to(base_dir_resolved)
        except ValueError:
            is_within_base = False
        else:
            is_within_base = True

    if not is_within_base:
        kind = "directory" if expect_directory else "file"
        fail(
            f"Refusing to access {kind} outside base directory {base_dir_resolved}: {resolved}"
        )
    return resolved


def safe_resolve_file(base_dir: pathlib.Path, path_str: str) -> pathlib.Path:
    """Safely resolve a file path provided by the user against a trusted base directory."""
    return resolve_within_base(base_dir, path_str, "file path", expect_directory=False)


def safe_resolve_dir(base_dir: pathlib.Path, target: str) -> pathlib.Path:
    """Resolve a directory path within a trusted base directory and refuse paths that escape it."""
    return resolve_within_base(
        base_dir, target, "directory path", expect_directory=True
    )


def resolve_child_path(
    parent_dir: pathlib.Path, child_name: str, label: str
) -> pathlib.Path:
    """
    Resolve a child path beneath a trusted directory.

    The child must be a relative path so callers cannot bypass ``parent_dir``.
    """
    child = pathlib.Path(child_name)
    if child.is_absolute():
        fail(f"{label} must be relative to {parent_dir.resolve()}, got {child}")
    return resolve_within_base(parent_dir, child_name, label, expect_directory=False)


def gh_api(path: str) -> Any:
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
    else:
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
    Extract resolved debt rows from the governance debt ledger.

    Reads the file at the given path, locates the Markdown table under the
    "Resolved Debt (Historical)" heading, and parses each data row into a
    dictionary keyed by the table headers. Header and cell values are trimmed.
    Rows with a differing number of cells than the header are ignored.

    Parameters:
        path (pathlib.Path): Path to the governance document to read.

    Returns:
        list[dict[str, str]]: Parsed table rows, or an empty list when the
        table is missing or contains no valid data rows.
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
        tuple[int, int]: The success count and the count of runs whose
        conclusion is neither cancelled, skipped, nor missing.
    """
    relevant = [
        run
        for run in runs
        if run.get("conclusion") not in {"cancelled", "skipped", None}
    ]
    successes = [run for run in relevant if run.get("conclusion") == "success"]
    return len(successes), len(relevant)


def get_backend_infra_jobs(
    jobs_by_run: dict[int, list[dict[str, Any]]],
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
    Collect live telemetry from GitHub Actions for the given repository.

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
        f"repos/{repo}/actions/workflows/ci-release-gate.yml/runs"
        "?per_page=20&status=completed"
    ).get("workflow_runs", [])
    pr_runs = gh_api(
        f"repos/{repo}/actions/workflows/ci-pr-validation.yml/runs"
        "?per_page=20&status=completed"
    ).get("workflow_runs", [])

    pr_jobs = {
        int(run["id"]): gh_api(
            f"repos/{repo}/actions/runs/{run['id']}/jobs?per_page=100",
        ).get("jobs", [])
        for run in pr_runs
    }

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
        TelemetryData: Dataclass populated with workflow runs, jobs, and the
        cached issue payloads.
    """
    release_runs = load_json(
        resolve_child_path(fixtures_dir, "release-runs.json", "fixture file")
    ).get("workflow_runs", [])
    pr_runs = load_json(
        resolve_child_path(fixtures_dir, "pr-runs.json", "fixture file")
    ).get("workflow_runs", [])
    issues_cache = load_json(
        resolve_child_path(fixtures_dir, "issues.json", "fixture file")
    )

    release_jobs: dict[int, list[dict[str, Any]]] = {}
    for run in release_runs:
        release_jobs[int(run["id"])] = load_json(
            resolve_child_path(
                fixtures_dir, f"jobs-release-{run['id']}.json", "fixture file"
            )
        ).get("jobs", [])

    pr_jobs: dict[int, list[dict[str, Any]]] = {}
    for run in pr_runs:
        pr_jobs[int(run["id"])] = load_json(
            resolve_child_path(
                fixtures_dir, f"jobs-pr-{run['id']}.json", "fixture file"
            )
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
    Resolve a GitHub issue reference using fixtures or the live API cache.

    Parameters:
        issue_ref (str): Issue reference in the form "#<number>"; returns
            `None` if the string does not match this pattern.
        issues_cache (dict[str, Any]): Mutable cache keyed by issue number.
        fixtures (bool): If True, only read from `issues_cache` and do not call the GitHub API.

    Returns:
        dict[str, Any] | None: The issue data dictionary when resolved, or
        `None` if the reference is invalid or unavailable in fixtures mode.
    """
    match = re.fullmatch(r"#(\d+)", issue_ref.strip())
    if not match:
        return None
    issue_number = match.group(1)
    if fixtures:
        return issues_cache.get(issue_number)
    if issue_number not in issues_cache:
        issues_cache[issue_number] = gh_api(f"repos/{repo}/issues/{issue_number}")
    return issues_cache[issue_number]


def build_slo_definition(slo: dict[str, Any]) -> dict[str, Any]:
    """Build a single SLO definition with its derived status."""
    slo["status"] = build_status(
        float(slo["actual"]),
        float(slo["objective"]),
        str(slo["comparator"]),
        int(slo["samples"]),
    )
    return slo


def collect_remediation_days(
    data: TelemetryData,
    repository_name: str,
    fixtures_mode: bool,
    debt_file: pathlib.Path,
) -> list[int]:
    """Collect resolved debt remediation lead times in days."""
    remediation_days: list[int] = []
    for entry in read_resolved_debt_entries(debt_file):
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
    return remediation_days


def calculate_rate(runs: list[dict[str, Any]]) -> tuple[float, int]:
    """Return the success rate percentage and sample count for a run list."""
    successes, samples = count_success_conclusions(runs)
    if not samples:
        return math.nan, 0
    return round((successes / samples) * 100, 1), samples


def calculate_overall_status(slos: list[dict[str, Any]]) -> str:
    """Reduce SLO statuses to the single overall status."""
    overall_status = "pass"
    for slo in slos:
        if slo["status"] == "breach":
            return "breach"
        if slo["status"] == "insufficient_data":
            overall_status = "insufficient_data"
    return overall_status


def generate_slos(
    data: TelemetryData,
    repository_name: str,
    fixtures_mode: bool,
    debt_file: pathlib.Path,
) -> list[dict[str, Any]]:
    """Compute SLO metrics from telemetry and resolved debt entries."""
    remediation_days = collect_remediation_days(
        data, repository_name, fixtures_mode, debt_file
    )
    release_rate, release_samples = calculate_rate(data.release_runs)
    policy_jobs = get_backend_infra_jobs(data.pr_jobs)
    policy_rate, policy_samples = calculate_rate(policy_jobs)
    p80_remediation = (
        round(percentile(remediation_days, 0.8), 1) if remediation_days else math.nan
    )

    return [
        build_slo_definition(
            {
                "id": "release-gate-reliability",
                "name": "Release-gate reliability",
                "target": (
                    ">= 95% success over the last 20 completed Release " "workflow runs"
                ),
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
                "breach_response": RELEASE_GATE_RESPONSE,
            }
        ),
        build_slo_definition(
            {
                "id": "remediation-lead-time",
                "name": "Remediation lead time",
                "target": (
                    "p80 <= 30 days from linked issue creation to resolved "
                    "debt entry date"
                ),
                "objective": 30.0,
                "comparator": "lte",
                "actual": p80_remediation,
                "unit": "days",
                "samples": len(remediation_days),
                "window": (
                    "All resolved debt entries with GitHub issue links in "
                    "docs/security-debt.md"
                ),
                "source": [
                    "docs/security-debt.md",
                    "GitHub Issues API",
                    ".github/workflows/ci-security-deep.yml",
                ],
                "owner": "Project Maintainers",
                "breach_response": REMEDIATION_RESPONSE,
            }
        ),
        build_slo_definition(
            {
                "id": "policy-test-health",
                "name": "Policy-test health",
                "target": (
                    ">= 95% success for backend Infra Hygiene jobs over the "
                    "last 20 completed CI workflow runs"
                ),
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
                "breach_response": POLICY_TEST_RESPONSE,
            }
        ),
    ]


def create_markdown_summary(
    repository_name: str,
    mode: str,
    generated_at: str,
    overall_status: str,
    slos: list[dict[str, Any]],
) -> str:
    """Create a Markdown-formatted governance SLO report."""
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


def build_runtime_config(args: argparse.Namespace) -> RuntimeConfig:
    """Validate filesystem inputs and return normalized runtime configuration."""
    base_dir = pathlib.Path.cwd().resolve()
    output_dir = safe_resolve_dir(base_dir, args.output_dir)
    debt_file = safe_resolve_file(base_dir, args.debt_file)
    fixtures_mode = bool(args.fixtures_dir)
    fixtures_dir = (
        safe_resolve_dir(base_dir, args.fixtures_dir) if fixtures_mode else None
    )
    repo = args.repo or ""

    if not debt_file.exists():
        fail(f"Missing security debt registry: {debt_file}")
    if not fixtures_mode and not repo:
        fail("Repository must be provided via --repo in live mode.")

    return RuntimeConfig(
        base_dir=base_dir,
        output_dir=output_dir,
        debt_file=debt_file,
        fixtures_dir=fixtures_dir,
        repo=repo,
        fixtures_mode=fixtures_mode,
    )


def collect_telemetry(config: RuntimeConfig) -> tuple[TelemetryData, str, str]:
    """Collect telemetry and derive reporting mode metadata."""
    if config.fixtures_mode:
        assert config.fixtures_dir is not None
        if not config.fixtures_dir.exists():
            fail(f"Fixtures directory not found: {config.fixtures_dir}")
        return (
            collect_fixture_inputs(config.fixtures_dir),
            "fixture",
            config.repo or "fixtures/software-delivery-pipeline",
        )

    if (
        subprocess.run(["which", "gh"], capture_output=True, check=False).returncode
        != 0
    ):
        fail("gh CLI is required in live mode.")
    return collect_live_inputs(config.repo), "live", config.repo


def main() -> None:
    """Generate the governance SLO report and fail on measured breaches."""
    config = build_runtime_config(parse_args())
    config.output_dir.mkdir(parents=True, exist_ok=True)
    data, mode, repository_name = collect_telemetry(config)
    slos = generate_slos(data, repository_name, config.fixtures_mode, config.debt_file)
    overall_status = calculate_overall_status(slos)
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

    report_path = resolve_child_path(
        config.output_dir, "report.json", "report artifact"
    )
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    summary_path = resolve_child_path(
        config.output_dir, "summary.md", "summary artifact"
    )
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
