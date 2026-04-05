from __future__ import annotations

"""Tests for the .cosign/ configuration files and .snyk policy removal.

Covers:
- .cosign/README.md: required headings, key content keywords, file integrity
- .cosign/cosign.pub: PEM format, base64 validity, ECDSA P-256 algorithm
- .snyk removal: policy file must not exist in the repository root
"""

import base64
import pathlib
import re

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
COSIGN_DIR = ROOT / ".cosign"
COSIGN_README = COSIGN_DIR / "README.md"
COSIGN_PUB = COSIGN_DIR / "cosign.pub"
SNYK_POLICY = ROOT / ".snyk"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_HEADING_RE = re.compile(r"^\s*#{1,6}\s+(?P<text>.+?)\s*#*\s*$", re.MULTILINE)


def _extract_headings(text: str) -> set[str]:
    return {m.group("text") for m in _HEADING_RE.finditer(text)}


def _read_pub_key_body(pem_text: str) -> bytes:
    """Strip PEM armour and return raw DER bytes."""
    lines = [
        line.strip()
        for line in pem_text.splitlines()
        if line.strip() and not line.strip().startswith("-----")
    ]
    return base64.b64decode("".join(lines))


# ---------------------------------------------------------------------------
# .cosign/README.md — existence and structure
# ---------------------------------------------------------------------------


class TestCosignReadme:
    def test_file_exists(self):
        assert COSIGN_README.exists(), ".cosign/README.md must exist"

    def test_file_is_not_empty(self):
        assert COSIGN_README.stat().st_size > 0, ".cosign/README.md must not be empty"

    def test_file_is_valid_utf8(self):
        COSIGN_README.read_text(encoding="utf-8")  # raises UnicodeDecodeError if invalid

    def test_has_top_level_heading(self):
        text = COSIGN_README.read_text(encoding="utf-8")
        headings = _extract_headings(text)
        assert "Signed releases" in headings, "Expected top-level heading 'Signed releases'"

    def test_has_scope_heading(self):
        text = COSIGN_README.read_text(encoding="utf-8")
        headings = _extract_headings(text)
        assert "Scope" in headings, "Expected '## Scope' section"

    def test_has_signing_method_heading(self):
        text = COSIGN_README.read_text(encoding="utf-8")
        headings = _extract_headings(text)
        assert "Signing method" in headings, "Expected '## Signing method' section"

    def test_has_release_gate_outputs_heading(self):
        text = COSIGN_README.read_text(encoding="utf-8")
        headings = _extract_headings(text)
        assert (
            "Release-gate outputs to attach" in headings
        ), "Expected '## Release-gate outputs to attach' section"

    def test_has_verification_heading(self):
        text = COSIGN_README.read_text(encoding="utf-8")
        headings = _extract_headings(text)
        assert "Verification" in headings, "Expected '## Verification' section"

    def test_has_failure_handling_heading(self):
        text = COSIGN_README.read_text(encoding="utf-8")
        headings = _extract_headings(text)
        assert "Failure handling" in headings, "Expected '## Failure handling' section"

    def test_all_required_headings_present(self):
        """Single comprehensive check: all six required sections exist."""
        required = {
            "Signed releases",
            "Scope",
            "Signing method",
            "Release-gate outputs to attach",
            "Verification",
            "Failure handling",
        }
        text = COSIGN_README.read_text(encoding="utf-8")
        found = _extract_headings(text)
        missing = required - found
        assert not missing, f"Missing required headings: {missing}"

    def test_references_cosign_tool(self):
        text = COSIGN_README.read_text(encoding="utf-8")
        assert "cosign" in text.lower(), "README must reference the cosign tool"

    def test_references_oidc(self):
        text = COSIGN_README.read_text(encoding="utf-8")
        assert "oidc" in text.lower(), "README must mention OIDC (keyless signing identity)"

    def test_references_sbom(self):
        text = COSIGN_README.read_text(encoding="utf-8")
        assert "sbom" in text.lower(), "README must mention SBOM attestation"

    def test_references_slsa(self):
        text = COSIGN_README.read_text(encoding="utf-8")
        assert "slsa" in text.lower(), "README must mention SLSA provenance"

    def test_references_attestation(self):
        text = COSIGN_README.read_text(encoding="utf-8")
        assert "attestation" in text.lower(), "README must reference attestation artefacts"

    def test_no_trailing_whitespace_on_lines(self):
        """Regression: file should not contain lines with trailing spaces (common editor artifact)."""
        text = COSIGN_README.read_text(encoding="utf-8")
        offenders = [
            i + 1
            for i, line in enumerate(text.splitlines())
            if line != line.rstrip(" \t")
        ]
        assert not offenders, f"Trailing whitespace on lines: {offenders}"


# ---------------------------------------------------------------------------
# .cosign/cosign.pub — PEM public key validity
# ---------------------------------------------------------------------------


class TestCosignPub:
    def test_file_exists(self):
        assert COSIGN_PUB.exists(), ".cosign/cosign.pub must exist"

    def test_file_is_valid_utf8(self):
        COSIGN_PUB.read_text(encoding="utf-8")

    def test_pem_has_begin_marker(self):
        text = COSIGN_PUB.read_text(encoding="utf-8")
        assert "-----BEGIN PUBLIC KEY-----" in text, "PEM must contain BEGIN PUBLIC KEY header"

    def test_pem_has_end_marker(self):
        text = COSIGN_PUB.read_text(encoding="utf-8")
        assert "-----END PUBLIC KEY-----" in text, "PEM must contain END PUBLIC KEY footer"

    def test_pem_body_is_valid_base64(self):
        text = COSIGN_PUB.read_text(encoding="utf-8")
        # Should not raise
        der = _read_pub_key_body(text)
        assert len(der) > 0, "Decoded PEM body must not be empty"

    def test_exactly_one_key_block(self):
        text = COSIGN_PUB.read_text(encoding="utf-8")
        begin_count = text.count("-----BEGIN PUBLIC KEY-----")
        end_count = text.count("-----END PUBLIC KEY-----")
        assert begin_count == 1, f"Expected exactly 1 BEGIN marker, found {begin_count}"
        assert end_count == 1, f"Expected exactly 1 END marker, found {end_count}"

    def test_der_length_consistent_with_ecdsa_p256(self):
        """ECDSA P-256 SubjectPublicKeyInfo DER is typically 91 bytes."""
        text = COSIGN_PUB.read_text(encoding="utf-8")
        der = _read_pub_key_body(text)
        # P-256 SubjectPublicKeyInfo is always 91 bytes; allow a small range for
        # alternative encodings (e.g. compressed point = 88 bytes).
        assert 86 <= len(der) <= 96, (
            f"DER length {len(der)} is outside the expected range for an ECDSA P-256 key"
        )

    def test_der_contains_p256_oid(self):
        """The P-256 curve OID (1.2.840.10045.3.1.7) must appear in the DER bytes."""
        # OID 1.2.840.10045.3.1.7 encodes as: 2a 86 48 ce 3d 03 01 07
        P256_OID = bytes([0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07])
        text = COSIGN_PUB.read_text(encoding="utf-8")
        der = _read_pub_key_body(text)
        assert P256_OID in der, "DER bytes must contain the ECDSA P-256 curve OID"

    def test_der_contains_ecPublicKey_oid(self):
        """The id-ecPublicKey OID (1.2.840.10045.2.1) must appear in the DER bytes."""
        # OID 1.2.840.10045.2.1 encodes as: 2a 86 48 ce 3d 02 01
        EC_OID = bytes([0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01])
        text = COSIGN_PUB.read_text(encoding="utf-8")
        der = _read_pub_key_body(text)
        assert EC_OID in der, "DER bytes must contain the id-ecPublicKey OID"

    def test_key_is_not_placeholder(self):
        """Guard against accidentally committing a dummy/placeholder key."""
        text = COSIGN_PUB.read_text(encoding="utf-8")
        der = _read_pub_key_body(text)
        # A placeholder key would likely be all-zero or repeat bytes.
        assert len(set(der)) > 10, "Key bytes appear to be a placeholder (too little entropy)"

    def test_file_ends_with_newline(self):
        """PEM files should end with a trailing newline."""
        raw = COSIGN_PUB.read_bytes()
        assert raw.endswith(b"\n"), ".cosign/cosign.pub must end with a newline"


# ---------------------------------------------------------------------------
# .snyk removal — policy file must not be present
# ---------------------------------------------------------------------------


class TestSnykPolicyRemoved:
    def test_snyk_policy_file_does_not_exist(self):
        assert not SNYK_POLICY.exists(), (
            ".snyk policy file must be removed from the repository root"
        )

    def test_no_snyk_ignore_for_k8s_test_namespace(self):
        """SNYK-CC-K8S-1 ignore for k8s/test/* must no longer be in effect."""
        # If the file somehow exists, it must not contain the removed ignore rule.
        if SNYK_POLICY.exists():
            content = SNYK_POLICY.read_text(encoding="utf-8")
            assert "SNYK-CC-K8S-1" not in content, (
                "SNYK-CC-K8S-1 ignore rule must be removed from .snyk"
            )

    def test_no_snyk_file_anywhere_in_repo_root(self):
        """Ensure no .snyk file was moved to a neighbouring location."""
        # Only check the conventional top-level location.
        assert not (ROOT / ".snyk").exists(), ".snyk must not exist at repository root"

    def test_snyk_policy_version_not_present(self):
        """The v1.19.0 Snyk policy version string must not appear in the repo root .snyk."""
        if SNYK_POLICY.exists():
            content = SNYK_POLICY.read_text(encoding="utf-8")
            assert "v1.19.0" not in content, (
                "Removed .snyk policy version v1.19.0 must not be present"
            )