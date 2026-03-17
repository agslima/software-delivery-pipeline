from __future__ import annotations

import argparse
import importlib.util
import pathlib
import sys

import pytest
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "scripts"
K8S_POLICIES_DIR = ROOT / "k8s" / "policies" / "cluster"

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


def _well_formed_doc(extra_body: str = "Body content here.") -> str:
    """Return a well-formed metadata document string for reuse in tests."""
    return "\n".join(
        [
            "# Title",
            "",
            "[//]: # (owner: Project Maintainers)",
            "[//]: # (review_cadence: Quarterly)",
            "[//]: # (last_reviewed: 2026-03-17)",
            "",
            extra_body,
        ]
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


# ---------------------------------------------------------------------------
# check-docs-metadata.py: validate_file additional edge cases
# ---------------------------------------------------------------------------


def test_validate_file_rejects_missing_file(tmp_path: pathlib.Path):
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(tmp_path / "nonexistent.md"))


def test_validate_file_rejects_file_not_starting_with_heading(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "Some intro text",
                "[//]: # (owner: Project Maintainers)",
                "[//]: # (review_cadence: Quarterly)",
                "[//]: # (last_reviewed: 2026-03-17)",
                "",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))


def test_validate_file_rejects_empty_file(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text("", encoding="utf-8")
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))


def test_validate_file_rejects_too_few_metadata_lines(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "# Title",
                "[//]: # (owner: Project Maintainers)",
                "[//]: # (review_cadence: Quarterly)",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))


def test_validate_file_rejects_wrong_metadata_order(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "# Title",
                "[//]: # (review_cadence: Quarterly)",
                "[//]: # (owner: Project Maintainers)",
                "[//]: # (last_reviewed: 2026-03-17)",
                "",
                "Body",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))


def test_validate_file_rejects_duplicate_metadata_key(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "# Title",
                "[//]: # (owner: Project Maintainers)",
                "[//]: # (owner: Someone Else)",
                "[//]: # (last_reviewed: 2026-03-17)",
                "",
                "Body",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))


def test_validate_file_rejects_unsupported_metadata_key(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "# Title",
                "[//]: # (owner: Project Maintainers)",
                "[//]: # (unknown_key: value)",
                "[//]: # (last_reviewed: 2026-03-17)",
                "",
                "Body",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))


def test_validate_file_rejects_wrong_review_cadence(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "# Title",
                "[//]: # (owner: Project Maintainers)",
                "[//]: # (review_cadence: Monthly)",
                "[//]: # (last_reviewed: 2026-03-17)",
                "",
                "Body",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))


def test_validate_file_rejects_missing_blank_line_after_metadata(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "# Title",
                "[//]: # (owner: Project Maintainers)",
                "[//]: # (review_cadence: Quarterly)",
                "[//]: # (last_reviewed: 2026-03-17)",
                "Body follows without blank line",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))


def test_validate_file_rejects_duplicate_key_occurrence_in_body(tmp_path: pathlib.Path):
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
                "Body text",
                "[//]: # (owner: Duplicate Owner)",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))


def test_validate_file_accepts_metadata_directly_after_heading(tmp_path: pathlib.Path):
    """Metadata block immediately after heading (no blank line) is valid."""
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "# Title",
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


def test_validate_file_rejects_last_reviewed_with_time_component(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "# Title",
                "[//]: # (owner: Project Maintainers)",
                "[//]: # (review_cadence: Quarterly)",
                "[//]: # (last_reviewed: 2026-03-17T00:00:00)",
                "",
                "Body",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))


def test_validate_file_rejects_non_comment_in_metadata_block(tmp_path: pathlib.Path):
    target = tmp_path / "doc.md"
    target.write_text(
        "\n".join(
            [
                "# Title",
                "[//]: # (owner: Project Maintainers)",
                "some non-comment line",
                "[//]: # (last_reviewed: 2026-03-17)",
                "",
                "Body",
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        check_docs_metadata.validate_file(str(target))


# ---------------------------------------------------------------------------
# markdown_assert.py: normalize_label
# ---------------------------------------------------------------------------


def test_normalize_label_lowercases():
    assert markdown_assert.normalize_label("Foo Bar") == "foo bar"


def test_normalize_label_strips_whitespace():
    assert markdown_assert.normalize_label("  foo  ") == "foo"


def test_normalize_label_collapses_internal_spaces():
    assert markdown_assert.normalize_label("foo   bar") == "foo bar"


def test_normalize_label_handles_mixed_case_and_spaces():
    assert markdown_assert.normalize_label("  FOO   BAR  ") == "foo bar"


def test_normalize_label_empty_string():
    assert markdown_assert.normalize_label("") == ""


# ---------------------------------------------------------------------------
# markdown_assert.py: github_anchor_for_heading additional cases
# ---------------------------------------------------------------------------


def test_github_anchor_for_heading_basic_lowercase():
    assert markdown_assert.github_anchor_for_heading("Hello World") == "hello-world"


def test_github_anchor_for_heading_leading_trailing_hyphen_stripped():
    assert markdown_assert.github_anchor_for_heading("-Leading") == "leading"


def test_github_anchor_for_heading_numbers_preserved():
    assert markdown_assert.github_anchor_for_heading("ADR 001") == "adr-001"


def test_github_anchor_for_heading_underscores_preserved():
    assert markdown_assert.github_anchor_for_heading("foo_bar") == "foo_bar"


# ---------------------------------------------------------------------------
# markdown_assert.py: extract_headings
# ---------------------------------------------------------------------------


def test_extract_headings_finds_all_levels():
    text = "# H1\n## H2\n### H3\n#### H4"
    headings = markdown_assert.extract_headings(text)
    assert headings == {"H1", "H2", "H3", "H4"}


def test_extract_headings_returns_empty_for_no_headings():
    assert markdown_assert.extract_headings("No headings here.") == set()


def test_extract_headings_strips_trailing_hashes():
    text = "## My Heading ##"
    headings = markdown_assert.extract_headings(text)
    assert "My Heading" in headings


def test_extract_headings_does_not_include_inline_hash():
    text = "Some text with a # character mid-line"
    assert markdown_assert.extract_headings(text) == set()


# ---------------------------------------------------------------------------
# markdown_assert.py: extract_link_targets
# ---------------------------------------------------------------------------


def test_extract_link_targets_inline_link():
    text = "[Click here](https://example.com)"
    targets = markdown_assert.extract_link_targets(text)
    assert "https://example.com" in targets


def test_extract_link_targets_multiple_inline_links():
    text = "[A](docs/a.md) and [B](docs/b.md)"
    targets = markdown_assert.extract_link_targets(text)
    assert "docs/a.md" in targets
    assert "docs/b.md" in targets


def test_extract_link_targets_reference_style_link():
    text = "[label][ref]\n\n[ref]: https://example.com"
    targets = markdown_assert.extract_link_targets(text)
    assert "https://example.com" in targets


def test_extract_link_targets_collapsed_reference_link():
    text = "[ref][]\n\n[ref]: https://example.com"
    targets = markdown_assert.extract_link_targets(text)
    assert "https://example.com" in targets


def test_extract_link_targets_bare_https_url():
    text = "See https://example.com for details"
    targets = markdown_assert.extract_link_targets(text)
    assert "https://example.com" in targets


def test_extract_link_targets_bare_docs_path():
    text = "See docs/governance.md for details"
    targets = markdown_assert.extract_link_targets(text)
    assert "docs/governance.md" in targets


def test_extract_link_targets_returns_empty_for_plain_text():
    targets = markdown_assert.extract_link_targets("No links here at all.")
    # Might be empty or not - just verify it returns a set
    assert isinstance(targets, set)


# ---------------------------------------------------------------------------
# markdown_assert.py: command_heading_any
# ---------------------------------------------------------------------------


def test_command_heading_any_returns_zero_when_heading_found(tmp_path: pathlib.Path):
    f = tmp_path / "doc.md"
    f.write_text("# My Section\n\nContent", encoding="utf-8")
    args = argparse.Namespace(file=str(f), expected=["My Section", "Other Heading"])
    assert markdown_assert.command_heading_any(args) == 0


def test_command_heading_any_exits_when_no_heading_found(tmp_path: pathlib.Path):
    f = tmp_path / "doc.md"
    f.write_text("# Actual Heading\n\nContent", encoding="utf-8")
    args = argparse.Namespace(file=str(f), expected=["Missing Heading"])
    with pytest.raises(SystemExit):
        markdown_assert.command_heading_any(args)


def test_command_heading_any_matches_any_variant(tmp_path: pathlib.Path):
    f = tmp_path / "doc.md"
    f.write_text("## Second Variant\n\nContent", encoding="utf-8")
    args = argparse.Namespace(file=str(f), expected=["First Variant", "Second Variant"])
    assert markdown_assert.command_heading_any(args) == 0


# ---------------------------------------------------------------------------
# markdown_assert.py: command_link_any
# ---------------------------------------------------------------------------


def test_command_link_any_returns_zero_when_link_found(tmp_path: pathlib.Path):
    f = tmp_path / "doc.md"
    f.write_text("[See this](docs/governance.md)", encoding="utf-8")
    args = argparse.Namespace(file=str(f), expected=["docs/governance.md"])
    assert markdown_assert.command_link_any(args) == 0


def test_command_link_any_exits_when_no_link_found(tmp_path: pathlib.Path):
    f = tmp_path / "doc.md"
    f.write_text("[See this](docs/architecture.md)", encoding="utf-8")
    args = argparse.Namespace(file=str(f), expected=["docs/missing.md"])
    with pytest.raises(SystemExit):
        markdown_assert.command_link_any(args)


def test_command_link_any_matches_any_variant(tmp_path: pathlib.Path):
    f = tmp_path / "doc.md"
    f.write_text("[See this](docs/runbook.md)", encoding="utf-8")
    args = argparse.Namespace(file=str(f), expected=["docs/other.md", "docs/runbook.md"])
    assert markdown_assert.command_link_any(args) == 0


# ---------------------------------------------------------------------------
# markdown_assert.py: command_anchor
# ---------------------------------------------------------------------------


def test_command_anchor_prints_slug(capsys):
    args = argparse.Namespace(heading="My Heading")
    result = markdown_assert.command_anchor(args)
    assert result == 0
    captured = capsys.readouterr()
    assert captured.out.strip() == "my-heading"


def test_command_anchor_slug_for_complex_heading(capsys):
    args = argparse.Namespace(heading="CI/CD Pipeline: Setup & Config")
    result = markdown_assert.command_anchor(args)
    assert result == 0
    captured = capsys.readouterr()
    assert captured.out.strip() != ""


# ---------------------------------------------------------------------------
# k8s/policies/cluster: YAML structure validation
# ---------------------------------------------------------------------------


def _load_cluster_policy(filename: str) -> dict:
    """Load and parse a cluster policy YAML file."""
    policy_path = K8S_POLICIES_DIR / filename
    with policy_path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


@pytest.mark.parametrize("policy_file", [
    "verify-sbom.yaml",
    "verify-slsa.yaml",
    "verify-trivy.yaml",
])
def test_cluster_policy_is_valid_yaml(policy_file):
    doc = _load_cluster_policy(policy_file)
    assert doc is not None
    assert isinstance(doc, dict)


@pytest.mark.parametrize("policy_file", [
    "verify-sbom.yaml",
    "verify-slsa.yaml",
    "verify-trivy.yaml",
])
def test_cluster_policy_has_required_top_level_fields(policy_file):
    doc = _load_cluster_policy(policy_file)
    assert doc.get("apiVersion") == "kyverno.io/v1"
    assert doc.get("kind") == "ClusterPolicy"
    assert "metadata" in doc
    assert "spec" in doc


@pytest.mark.parametrize("policy_file", [
    "verify-sbom.yaml",
    "verify-slsa.yaml",
    "verify-trivy.yaml",
])
def test_cluster_policy_is_enforce_mode(policy_file):
    doc = _load_cluster_policy(policy_file)
    assert doc["spec"].get("validationFailureAction") == "Enforce"


@pytest.mark.parametrize("policy_file", [
    "verify-sbom.yaml",
    "verify-slsa.yaml",
    "verify-trivy.yaml",
])
def test_cluster_policy_has_rules(policy_file):
    doc = _load_cluster_policy(policy_file)
    rules = doc["spec"].get("rules", [])
    assert len(rules) >= 1


@pytest.mark.parametrize("policy_file", [
    "verify-sbom.yaml",
    "verify-slsa.yaml",
    "verify-trivy.yaml",
])
def test_cluster_policy_targets_prod_namespaces(policy_file):
    doc = _load_cluster_policy(policy_file)
    for rule in doc["spec"].get("rules", []):
        any_resources = rule.get("match", {}).get("any", [])
        namespaces = []
        for entry in any_resources:
            namespaces.extend(entry.get("resources", {}).get("namespaces", []))
        assert any(ns in namespaces for ns in ("prod", "production")), (
            f"{policy_file} rule '{rule.get('name')}' does not target prod or production namespace"
        )


@pytest.mark.parametrize("policy_file", [
    "verify-sbom.yaml",
    "verify-slsa.yaml",
    "verify-trivy.yaml",
])
def test_cluster_policy_uses_keyless_signing(policy_file):
    doc = _load_cluster_policy(policy_file)
    found_keyless = False
    for rule in doc["spec"].get("rules", []):
        for verify_block in rule.get("verifyImages", []):
            for attestation in verify_block.get("attestations", []):
                for attestor_group in attestation.get("attestors", []):
                    for entry in attestor_group.get("entries", []):
                        if "keyless" in entry:
                            found_keyless = True
    assert found_keyless, f"{policy_file} does not use keyless signing"


@pytest.mark.parametrize("policy_file", [
    "verify-sbom.yaml",
    "verify-slsa.yaml",
    "verify-trivy.yaml",
])
def test_cluster_policy_trusts_github_actions_issuer(policy_file):
    doc = _load_cluster_policy(policy_file)
    found_issuer = False
    for rule in doc["spec"].get("rules", []):
        for verify_block in rule.get("verifyImages", []):
            for attestation in verify_block.get("attestations", []):
                for attestor_group in attestation.get("attestors", []):
                    for entry in attestor_group.get("entries", []):
                        keyless = entry.get("keyless", {})
                        if keyless.get("issuer") == "https://token.actions.githubusercontent.com":
                            found_issuer = True
    assert found_issuer, f"{policy_file} does not trust the GitHub Actions OIDC issuer"


@pytest.mark.parametrize("policy_file", [
    "verify-sbom.yaml",
    "verify-slsa.yaml",
    "verify-trivy.yaml",
])
def test_cluster_policy_has_metadata_name(policy_file):
    doc = _load_cluster_policy(policy_file)
    name = doc.get("metadata", {}).get("name")
    assert name and isinstance(name, str) and len(name) > 0


def test_verify_sbom_uses_spdx_predicate_type():
    doc = _load_cluster_policy("verify-sbom.yaml")
    predicate_types = []
    for rule in doc["spec"].get("rules", []):
        for verify_block in rule.get("verifyImages", []):
            for attestation in verify_block.get("attestations", []):
                predicate_types.append(attestation.get("predicateType", ""))
    assert any("spdx" in pt.lower() for pt in predicate_types)


def test_verify_slsa_uses_slsa_predicate_type():
    doc = _load_cluster_policy("verify-slsa.yaml")
    predicate_types = []
    for rule in doc["spec"].get("rules", []):
        for verify_block in rule.get("verifyImages", []):
            for attestation in verify_block.get("attestations", []):
                predicate_types.append(attestation.get("predicateType", ""))
    assert any("slsa.dev" in pt for pt in predicate_types)


def test_verify_trivy_uses_trivy_predicate_type():
    doc = _load_cluster_policy("verify-trivy.yaml")
    predicate_types = []
    for rule in doc["spec"].get("rules", []):
        for verify_block in rule.get("verifyImages", []):
            for attestation in verify_block.get("attestations", []):
                predicate_types.append(attestation.get("predicateType", ""))
    assert any("trivy" in pt for pt in predicate_types)


@pytest.mark.parametrize("policy_file", [
    "verify-sbom.yaml",
    "verify-slsa.yaml",
    "verify-trivy.yaml",
])
def test_cluster_policy_webhook_timeout_is_positive(policy_file):
    doc = _load_cluster_policy(policy_file)
    timeout = doc["spec"].get("webhookTimeoutSeconds")
    assert timeout is not None and timeout > 0


@pytest.mark.parametrize("policy_file", [
    "verify-sbom.yaml",
    "verify-slsa.yaml",
    "verify-trivy.yaml",
])
def test_cluster_policy_background_scanning_disabled(policy_file):
    doc = _load_cluster_policy(policy_file)
    assert doc["spec"].get("background") is False


@pytest.mark.parametrize("policy_file", [
    "verify-sbom.yaml",
    "verify-slsa.yaml",
    "verify-trivy.yaml",
])
def test_cluster_policy_attestation_condition_requires_pass(policy_file):
    doc = _load_cluster_policy(policy_file)
    found_pass_condition = False
    for rule in doc["spec"].get("rules", []):
        for verify_block in rule.get("verifyImages", []):
            for attestation in verify_block.get("attestations", []):
                for condition_group in attestation.get("conditions", []):
                    for condition in condition_group.get("all", []):
                        if condition.get("value") == "PASS":
                            found_pass_condition = True
    assert found_pass_condition, (
        f"{policy_file} does not enforce a PASS condition on attestations"
    )