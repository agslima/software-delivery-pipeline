import datetime as dt
import importlib.util
import math
import json
import pathlib
import sys
import pytest
from unittest.mock import patch

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "report-governance-slos.py"
MODULE_SPEC = importlib.util.spec_from_file_location(
    "report_governance_slos", MODULE_PATH
)
assert MODULE_SPEC and MODULE_SPEC.loader
report_governance_slos = importlib.util.module_from_spec(MODULE_SPEC)
sys.modules[MODULE_SPEC.name] = report_governance_slos
MODULE_SPEC.loader.exec_module(report_governance_slos)

build_status = report_governance_slos.build_status
count_success_conclusions = report_governance_slos.count_success_conclusions
fail = report_governance_slos.fail
get_backend_infra_jobs = report_governance_slos.get_backend_infra_jobs
iso_to_date = report_governance_slos.iso_to_date
markdown_table_row = report_governance_slos.markdown_table_row
percentile = report_governance_slos.percentile
read_resolved_debt_entries = report_governance_slos.read_resolved_debt_entries
resolve_child_path = report_governance_slos.resolve_child_path
safe_resolve_dir = report_governance_slos.safe_resolve_dir
collect_fixture_inputs = report_governance_slos.collect_fixture_inputs
TelemetryData = report_governance_slos.TelemetryData

# --- 1. Core Logic & Math Tests ---


def test_percentile():
    """Test the linear-interpolated percentile calculation."""
    # Empty list should return NaN
    assert math.isnan(percentile([], 0.8))

    # Single element
    assert percentile([10], 0.8) == 10.0

    # Exact match
    assert percentile([1, 2, 3, 4, 5], 0.5) == 3.0

    # Interpolated match
    # Rank for p=0.8 in 5 items is (5-1)*0.8 = 3.2.
    # Values at index 3 and 4 are 4 and 5. Interpolation: 4 + (5-4)*0.2 = 4.2
    assert percentile([1, 2, 3, 4, 5], 0.8) == 4.2


def test_count_success_conclusions():
    """Test counting logic for workflow runs/jobs."""
    runs = [
        {"conclusion": "success"},
        {"conclusion": "failure"},
        {"conclusion": "success"},
        {"conclusion": "cancelled"},  # Should be ignored
        {"conclusion": "skipped"},  # Should be ignored
        {"conclusion": None},  # Should be ignored
    ]
    successes, total = count_success_conclusions(runs)
    assert successes == 2
    assert total == 3  # Only success and failure count toward the total


def test_build_status():
    """Test SLO status classification."""
    # Insufficient data
    assert build_status(99.0, 95.0, "gte", 0) == "insufficient_data"

    # Greater than or equal (gte)
    assert build_status(96.0, 95.0, "gte", 10) == "pass"
    assert build_status(94.0, 95.0, "gte", 10) == "breach"

    # Less than or equal (lte)
    assert build_status(10.0, 30.0, "lte", 10) == "pass"
    assert build_status(35.0, 30.0, "lte", 10) == "breach"

    # Invalid comparator
    with pytest.raises(ValueError, match="Unknown comparator"):
        build_status(10, 10, "eq", 10)


def test_get_backend_infra_jobs():
    """Test filtering of specific backend jobs."""
    jobs_by_run = {
        1: [{"name": "Infra Hygiene (backend)"}, {"name": "Lint"}],
        2: [{"name": "Infra Hygiene (frontend)"}, {"name": "Test"}],
    }
    selected = get_backend_infra_jobs(jobs_by_run)
    assert len(selected) == 1
    assert selected[0]["name"] == "Infra Hygiene (backend)"


# --- 2. Formatting & Parsing Tests ---


def test_iso_to_date():
    """Test date extraction from ISO 8601 strings."""
    date = iso_to_date("2023-10-25T14:30:00Z")
    assert date == dt.date(2023, 10, 25)


def test_markdown_table_row():
    """Test markdown table generation."""
    assert markdown_table_row(["A", "B", "C"]) == "| A | B | C |"


# --- 3. Filesystem & Security Tests ---


def test_safe_resolve_dir(tmp_path):
    """Test directory traversal security constraint."""
    base_dir = tmp_path / "base"
    base_dir.mkdir()

    # Valid: Subdirectory inside base
    valid_target = base_dir / "artifacts"
    resolved = safe_resolve_dir(base_dir, "artifacts")
    assert resolved == valid_target.resolve()

    # Invalid: Traversal outside base
    with pytest.raises(SystemExit):
        safe_resolve_dir(base_dir, "../outside")


def test_safe_resolve_dir_rejects_absolute_path(tmp_path):
    base_dir = tmp_path / "base"
    base_dir.mkdir()

    with pytest.raises(SystemExit):
        safe_resolve_dir(base_dir, str((tmp_path / "outside").resolve()))


def test_resolve_child_path_rejects_absolute_child(tmp_path):
    parent_dir = tmp_path / "artifacts"
    parent_dir.mkdir()

    with pytest.raises(SystemExit):
        resolve_child_path(
            parent_dir, str((tmp_path / "report.json").resolve()), "artifact"
        )


def test_collect_fixture_inputs_uses_validated_fixture_files(tmp_path):
    fixtures_dir = tmp_path / "fixtures"
    fixtures_dir.mkdir()

    (fixtures_dir / "release-runs.json").write_text(
        json.dumps({"workflow_runs": [{"id": 1}]}), encoding="utf-8"
    )
    (fixtures_dir / "pr-runs.json").write_text(
        json.dumps({"workflow_runs": [{"id": 2}]}), encoding="utf-8"
    )
    (fixtures_dir / "issues.json").write_text(json.dumps({"123": {}}), encoding="utf-8")
    (fixtures_dir / "jobs-release-1.json").write_text(
        json.dumps({"jobs": [{"name": "release"}]}), encoding="utf-8"
    )
    (fixtures_dir / "jobs-pr-2.json").write_text(
        json.dumps({"jobs": [{"name": "Infra Hygiene (backend)"}]}), encoding="utf-8"
    )

    data = collect_fixture_inputs(fixtures_dir)

    assert data.release_runs == [{"id": 1}]
    assert data.pr_runs == [{"id": 2}]
    assert data.release_jobs[1] == [{"name": "release"}]
    assert data.pr_jobs[2] == [{"name": "Infra Hygiene (backend)"}]


def test_read_resolved_debt_entries(tmp_path):
    """Test extracting markdown table data into dictionaries."""
    mock_markdown = """
# Some Doc
Text text text

## Resolved Debt (Historical)

| Ticket/Link | Date Resolved (YYYY-MM-DD) | Owner |
| :--- | :--- | :--- |
| #123 | 2023-01-01 | Team A |
| #456 | 2023-02-15 | Team B |

## Next Section
More text
    """
    debt_file = tmp_path / "security-debt.md"
    debt_file.write_text(mock_markdown, encoding="utf-8")

    entries = read_resolved_debt_entries(debt_file)
    assert len(entries) == 2
    assert entries[0]["Ticket/Link"] == "#123"
    assert entries[1]["Date Resolved (YYYY-MM-DD)"] == "2023-02-15"


# --- 4. System / Exit Tests ---


@patch("sys.stderr")
def test_fail(mock_stderr):
    """Test that fail() exits with code 1 and formats GitHub Actions errors."""
    with pytest.raises(SystemExit) as exc_info:
        fail("Something went wrong")

    assert exc_info.value.code == 1
    # Check that it actually prints the GitHub Action annotation
    assert mock_stderr.write.call_args_list[:2] == [
        (("::error::Something went wrong",), {}),
        (("\n",), {}),
    ]
