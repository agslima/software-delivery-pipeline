from __future__ import annotations

import importlib.util
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "scripts"


def load_module(name: str, path: pathlib.Path):
    """
    Load a Python module from a filesystem path and register it under the given import name.
    
    Parameters:
        name (str): Module import name to register in sys.modules.
        path (pathlib.Path): Filesystem path to the module file.
    
    Returns:
        module: The loaded module object.
    
    Raises:
        AssertionError: If a module spec or loader cannot be created for the given path.
    """
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


workflow_input_provenance = load_module(
    "check_workflow_input_provenance",
    SCRIPTS_DIR / "check-workflow-input-provenance.py",
)


def test_evaluate_path_accepts_sha_pinned_actions_and_digest_pinned_images(
    tmp_path: pathlib.Path,
):
    workflow = tmp_path / "workflow.yml"
    workflow.write_text(
        "\n".join(
            [
                "name: Sample",
                "jobs:",
                "  build:",
                "    runs-on: ubuntu-latest",
                "    steps:",
                "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
                "      - uses: docker/login-action@4907a6ddec9925e35a0a9e82d7399ccc52663121",
                "      - name: Scan",
                "        run: docker run ghcr.io/example/scanner@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            ]
        ),
        encoding="utf-8",
    )

    findings, summary = workflow_input_provenance.evaluate_path(workflow)

    assert findings == []
    assert summary["action_refs"] == 2
    assert summary["pinned_action_refs"] == 2
    assert summary["digest_pinned_oci_refs"] == 1


def test_evaluate_path_flags_mutable_action_refs_and_image_tags(tmp_path: pathlib.Path):
    workflow = tmp_path / "workflow.yml"
    workflow.write_text(
        "\n".join(
            [
                "name: Sample",
                "jobs:",
                "  build:",
                "    runs-on: ubuntu-latest",
                "    steps:",
                "      - uses: actions/checkout@v4",
                "      - name: Scan",
                "        run: docker run ghcr.io/example/scanner:latest",
            ]
        ),
        encoding="utf-8",
    )

    findings, _ = workflow_input_provenance.evaluate_path(workflow)

    rules = {finding.rule for finding in findings}
    assert "action-full-sha-pin" in rules
    assert "oci-digest-pin" in rules


def test_evaluate_path_ignores_known_installer_urls(tmp_path: pathlib.Path):
    workflow = tmp_path / "workflow.yml"
    workflow.write_text(
        "\n".join(
            [
                "name: Sample",
                "jobs:",
                "  build:",
                "    runs-on: ubuntu-latest",
                "    steps:",
                "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
                "      - name: Install Trivy",
                "        run: |",
                "          curl -sfL \"https://raw.githubusercontent.com/aquasecurity/trivy/v0.58.1/contrib/install.sh\" | sh -s -- -b /usr/local/bin",
            ]
        ),
        encoding="utf-8",
    )

    findings, summary = workflow_input_provenance.evaluate_path(workflow)

    assert findings == []
    assert summary["digest_pinned_oci_refs"] == 0


def test_load_yaml_rejects_non_mapping_yaml(tmp_path: pathlib.Path):
    workflow = tmp_path / "workflow.yml"
    workflow.write_text("- not-a-mapping\n", encoding="utf-8")

    with pytest.raises(SystemExit):
        workflow_input_provenance.load_yaml(workflow)
