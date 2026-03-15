from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "security" / "render_snyk_report.py"
FIXTURES = ROOT / "scripts" / "tests" / "fixtures" / "snyk"

sys.path.insert(0, str(SCRIPT.parent))
import render_snyk_report as report  # noqa: E402


def load_fixture(name: str):
    """
    Load and parse a JSON fixture file from the FIXTURES directory.
    
    Parameters:
        name (str): Filename of the fixture located in the FIXTURES directory (including extension).
    
    Returns:
        The parsed JSON content (typically a dict or list).
    """
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_extract_standard_counts_deduplicates_per_target():
    doc = load_fixture("sca.json")

    counts = report.extract_standard_counts(doc)

    assert counts.critical == 1
    assert counts.high == 1
    assert counts.medium == 1
    assert counts.low == 1


def test_extract_standard_counts_by_target():
    doc = load_fixture("sca.json")

    by_target = report.extract_standard_counts_by_target(doc)

    assert set(by_target) == {
        "app/client/package.json",
        "app/server/package.json",
    }

    client = by_target["app/client/package.json"]
    assert client.critical == 0
    assert client.high == 1
    assert client.medium == 1
    assert client.low == 0

    server = by_target["app/server/package.json"]
    assert server.critical == 1
    assert server.high == 0
    assert server.medium == 0
    assert server.low == 1


def test_extract_iac_counts():
    doc = load_fixture("iac.json")

    counts = report.extract_iac_counts(doc)

    assert counts.critical == 0
    assert counts.high == 1
    assert counts.medium == 1
    assert counts.low == 1


def test_extract_iac_counts_by_target():
    doc = load_fixture("iac.json")

    by_target = report.extract_iac_counts_by_target(doc)

    deploy = by_target["k8s/deployment.yaml"]
    assert deploy.critical == 0
    assert deploy.high == 1
    assert deploy.medium == 1
    assert deploy.low == 0

    service = by_target["k8s/service.yaml"]
    assert service.critical == 0
    assert service.high == 0
    assert service.medium == 0
    assert service.low == 1


def test_extract_sast_counts_maps_levels_and_deduplicates():
    doc = load_fixture("sast.json")

    counts = report.extract_sast_counts(doc)

    assert counts.critical == 0
    assert counts.high == 1
    assert counts.medium == 1
    assert counts.low == 1


def test_status_for():
    assert report.status_for("Critical", 0) == "✅ Fixed"
    assert report.status_for("Critical", 1) == "❌ Must fix"
    assert report.status_for("Medium", 0) == "✅ Fixed"
    assert report.status_for("Medium", 2) == "ℹ️ Managed Debt"


def test_update_readme_replaces_generated_block(tmp_path: Path):
    readme = tmp_path / "README.md"
    readme.write_text(
        (FIXTURES / "README.md").read_text(encoding="utf-8"), encoding="utf-8"
    )

    baseline = {"critical": 10, "high": 20, "medium": 30, "low": 40}
    totals = report.SeverityCounts(critical=1, high=2, medium=3, low=4)

    report.update_readme(
        readme_path=readme,
        baseline=baseline,
        totals=totals,
        timestamp_utc="2026-03-14 12:00",
    )

    updated = readme.read_text(encoding="utf-8")
    assert "### Automated Security Posture" in updated
    assert "| **Critical** | 10 | 1 | ❌ Must fix |" in updated
    assert "| **Low** | 40 | 4 | ℹ️ Managed Debt |" in updated
    assert "old content" not in updated


def test_render_index_md_writes_expected_sections(tmp_path: Path):
    docs_dir = tmp_path / "docs" / "snyk"
    html_dir = docs_dir / "html"
    html_dir.mkdir(parents=True)

    (html_dir / "snyk-sca.html").write_text("<html></html>", encoding="utf-8")

    rows = [
        {
            "label": "npm dependencies: app/client/package.json",
            "counts": report.SeverityCounts(high=1, medium=1),
            "html_path": str(html_dir / "snyk-sca.html"),
        },
        {
            "label": "Code analysis",
            "counts": report.SeverityCounts(high=1),
            "html_path": None,
        },
    ]

    totals = report.SeverityCounts(critical=0, high=2, medium=1, low=0)

    report.render_index_md(
        docs_dir=docs_dir,
        html_dir=html_dir,
        timestamp_utc="2026-03-14 12:00",
        scan_rows=rows,
        totals=totals,
    )

    content = (docs_dir / "index.md").read_text(encoding="utf-8")
    assert "# Snyk Scans" in content
    assert "## Projects" in content
    assert "| Critical | 0 |" in content
    assert "| High | 2 |" in content
    assert "[npm dependencies: app/client/package.json](html/snyk-sca.html)" in content


def test_main_end_to_end(tmp_path: Path):
    docs_dir = tmp_path / "docs" / "snyk"
    html_dir = docs_dir / "html"
    html_dir.mkdir(parents=True)

    readme = tmp_path / "README.md"
    readme.write_text(
        (FIXTURES / "README.md").read_text(encoding="utf-8"), encoding="utf-8"
    )

    baseline = tmp_path / "baseline.json"
    baseline.write_text(
        (FIXTURES / "baseline.json").read_text(encoding="utf-8"), encoding="utf-8"
    )

    sca = tmp_path / "sca.json"
    sast = tmp_path / "sast.json"
    iac = tmp_path / "iac.json"
    cc = tmp_path / "container-client.json"
    cs = tmp_path / "container-server.json"

    sca.write_text(
        (FIXTURES / "sca.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    sast.write_text(
        (FIXTURES / "sast.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    iac.write_text(
        (FIXTURES / "iac.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    cc.write_text(
        (FIXTURES / "container-client.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    cs.write_text(
        (FIXTURES / "container-server.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    metadata = tmp_path / "metadata.json"
    metadata.write_text(
        json.dumps(
            {
                "scans": [
                    {
                        "name": "snyk-sca",
                        "kind": "sca",
                        "json_path": str(sca),
                        "html_path": None,
                        "source_ref": str(tmp_path),
                    },
                    {
                        "name": "snyk-code",
                        "kind": "sast",
                        "json_path": str(sast),
                        "html_path": None,
                        "source_ref": str(tmp_path),
                    },
                    {
                        "name": "snyk-container-client",
                        "kind": "container",
                        "json_path": str(cc),
                        "html_path": None,
                        "source_ref": "file-server-client:snyk",
                    },
                    {
                        "name": "snyk-container-server",
                        "kind": "container",
                        "json_path": str(cs),
                        "html_path": None,
                        "source_ref": "file-server-server:snyk",
                    },
                    {
                        "name": "snyk-iac",
                        "kind": "iac",
                        "json_path": str(iac),
                        "html_path": None,
                        "source_ref": "k8s",
                    },
                ]
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--metadata",
            str(metadata),
            "--baseline",
            str(baseline),
            "--docs-dir",
            str(docs_dir),
            "--html-dir",
            str(html_dir),
            "--readme",
            str(readme),
            "--timestamp-utc",
            "2026-03-14 12:00",
            "--update-readme",
            "1",
        ],
        capture_output=True,
        text=True,
        check=True,
    )

    assert "Aggregate totals:" in result.stdout
    assert (docs_dir / "index.md").exists()

    index_md = (docs_dir / "index.md").read_text(encoding="utf-8")
    updated_readme = readme.read_text(encoding="utf-8")

    assert "Code analysis" in index_md
    assert "Container: app/docker/Dockerfile.client" in index_md
    assert "Container: app/docker/Dockerfile.server" in index_md
    assert "npm dependencies: app/client/package.json" in index_md
    assert "k8s/deployment.yaml" in index_md

    # Aggregate expected from fixtures:
    # SCA:          C1 H1 M1 L1
    # SAST:         C0 H1 M1 L1
    # Container c:  C0 H1 M0 L1
    # Container s:  C0 H0 M1 L0
    # IaC:          C0 H1 M1 L1
    # TOTAL:        C1 H4 M4 L4
    assert "| Critical | 1 |" in index_md
    assert "| High | 4 |" in index_md
    assert "| Medium | 4 |" in index_md
    assert "| Low | 4 |" in index_md

    assert "### Automated Security Posture" in updated_readme
    assert "| **Critical** | 10 | 1 | ❌ Must fix |" in updated_readme
    assert "| **High** | 20 | 4 | ❌ Must fix |" in updated_readme
    assert "| **Medium** | 30 | 4 | ℹ️ Managed Debt |" in updated_readme
    assert "| **Low** | 40 | 4 | ℹ️ Managed Debt |" in updated_readme
