#!/usr/bin/env python3
"""Validate markdown metadata conventions for maintained docs pages."""

from __future__ import annotations

import re
import sys
from pathlib import Path


TARGETS = [
    "docs/README.md",
    "docs/architecture.md",
    "docs/decisions.md",
    "docs/runbook.md",
    "docs/remediation-plan.md",
    "docs/adr/001-gitops-strategy.md",
    "docs/adr/002-image-signing-attestation.md",
    "docs/adr/003-policy-enforcement-strategy.md",
    "docs/adr/004-vulnerability-thresholds-risk-acceptance.md",
    "docs/adr/005-break-glass-exception-handling.md",
    "docs/adr/006-scanner-failure-degraded-mode.md",
    "docs/adr/007-supply-chain-incident-response-revocation.md",
]

METADATA_KEYS = ("owner", "review_cadence", "last_reviewed")
COMMENT_RE = re.compile(r"^\[//\]: # \((?P<key>[a-z_]+): (?P<value>.+)\)$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def fail(message: str) -> None:
    """Emit a GitHub Actions error annotation and exit."""
    print(f"::error::{message}", file=sys.stderr)
    raise SystemExit(1)


def validate_file(path_str: str) -> None:
    """Validate metadata comment presence, order, and formatting for one file."""
    path = Path(path_str)
    if not path.is_file():
        fail(f"Missing documentation file for metadata validation: {path}")

    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or not lines[0].startswith("# "):
        fail(f"{path} must start with a top-level markdown heading before metadata comments.")

    metadata_start = 1
    while metadata_start < len(lines) and lines[metadata_start] == "":
        metadata_start += 1

    expected_block = lines[metadata_start : metadata_start + 3]
    if len(expected_block) < 3:
        fail(
            f"{path} must include owner, review_cadence, and last_reviewed metadata comments after the title."
        )

    metadata: dict[str, str] = {}
    for line in expected_block:
        match = COMMENT_RE.match(line)
        if not match:
            fail(
                f"{path} metadata block must contain only standardized comment lines directly below the title."
            )
        key = match.group("key")
        value = match.group("value")
        if key not in METADATA_KEYS:
            fail(f"{path} contains unsupported metadata key: {key}")
        if key in metadata:
            fail(f"{path} contains duplicate metadata key: {key}")
        metadata[key] = value

    if list(metadata.keys()) != list(METADATA_KEYS):
        fail(
            f"{path} metadata block must appear in this exact order: owner, review_cadence, last_reviewed."
        )

    if lines[metadata_start + 3 : metadata_start + 4] != [""]:
        fail(f"{path} must include a blank line after the metadata block.")

    if metadata["review_cadence"] != "Quarterly":
        fail(f"{path} review_cadence must be Quarterly, found: {metadata['review_cadence']}")

    if not DATE_RE.match(metadata["last_reviewed"]):
        fail(f"{path} last_reviewed must use YYYY-MM-DD format, found: {metadata['last_reviewed']}")

    for key in METADATA_KEYS:
        occurrences = 0
        for line in lines:
            match = COMMENT_RE.match(line)
            if match and match.group("key") == key:
                occurrences += 1
        if occurrences != 1:
            fail(f"{path} must contain exactly one {key} metadata comment, found {occurrences}")


def main() -> int:
    """Validate all targeted documentation files."""
    for target in TARGETS:
        validate_file(target)
    print(f"[docs-metadata] OK ({len(TARGETS)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
