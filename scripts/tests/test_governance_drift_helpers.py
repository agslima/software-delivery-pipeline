from __future__ import annotations

import importlib.util
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "scripts"

sys.path.insert(0, str(SCRIPTS_DIR))
import markdown_assert  # noqa: E402


def load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


check_docs_metadata = load_module(
    "check_docs_metadata", SCRIPTS_DIR / "check-docs-metadata.py"
)


def test_github_anchor_for_heading_preserves_unicode_symbols():
    assert (
        markdown_assert.github_anchor_for_heading("README Claims → Controls Matrix")
        == "readme-claims-→-controls-matrix"
    )


def test_github_anchor_for_heading_strips_punctuation_without_double_hyphens():
    assert markdown_assert.github_anchor_for_heading("A/B Test") == "ab-test"
    assert (
        markdown_assert.github_anchor_for_heading("Controls: PR/Release?")
        == "controls-prrelease"
    )
    assert markdown_assert.github_anchor_for_heading("Hello -- World") == "hello-world"


def test_validate_file_accepts_well_formed_metadata(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "# Title",
                "",
                "[//]: # (owner: Project Maintainers)",
                "[//]: # (review_cadence: Quarterly)",
                "[//]: # (last_reviewed: 2026-03-17)",
                "",
                "Body",
            ]
        ),
        encoding="utf-8",
    )

    check_docs_metadata.validate_file(str(target))


def test_validate_file_rejects_invalid_last_reviewed(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "# Title",
                "[//]: # (owner: Project Maintainers)",
                "[//]: # (review_cadence: Quarterly)",
                "[//]: # (last_reviewed: 2026/03/17)",
                "",
                "Body",
            ]
        ),
        encoding="utf-8",
    )

    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))
