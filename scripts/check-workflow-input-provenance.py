#!/usr/bin/env python3
"""Check high-trust workflow inputs for provenance-friendly pinning."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = [
    ".github/workflows/ci-release-gate.yml",
    ".github/workflows/gitops-enforce.yml",
]

FULL_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
USES_RE = re.compile(r"^(?P<action>[^@]+)@(?P<ref>.+)$")
OCI_DIGEST_RE = re.compile(
    r"(?P<image>(?:docker\.io|ghcr\.io|quay\.io|mcr\.microsoft\.com|gcr\.io|public\.ecr\.aws)/[A-Za-z0-9._/@:-]+)@sha256:[0-9a-f]{64}"
)
OCI_TAG_RE = re.compile(
    r"(?P<image>(?:docker\.io|ghcr\.io|quay\.io|mcr\.microsoft\.com|gcr\.io|public\.ecr\.aws)/[A-Za-z0-9._/@-]+):(?P<tag>[A-Za-z0-9._-]+)"
)
TRUSTED_INSTALLERS = {
    "https://raw.githubusercontent.com/aquasecurity/trivy/",
    "https://github.com/mikefarah/yq/releases/download/",
}


@dataclass(frozen=True)
class Finding:
    path: str
    rule: str
    message: str


def fail(message: str) -> None:
    print(f"::error::{message}", file=sys.stderr)
    raise SystemExit(1)


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:  # pragma: no cover - exercised through SystemExit
        fail(f"Failed to parse {path}: {exc}")
    if not isinstance(data, dict):
        fail(f"{path} must parse to a YAML mapping.")
    return data


def iter_steps(document: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    jobs = document.get("jobs")
    if not isinstance(jobs, dict):
        return []

    steps: list[tuple[str, dict[str, Any]]] = []
    for job_name, job in jobs.items():
        if not isinstance(job, dict):
            continue
        raw_steps = job.get("steps", [])
        if not isinstance(raw_steps, list):
            continue
        for index, step in enumerate(raw_steps, start=1):
            if isinstance(step, dict):
                steps.append((f"jobs.{job_name}.steps[{index}]", step))
    return steps


def check_uses(path: Path, location: str, step: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    uses = step.get("uses")
    if not isinstance(uses, str):
        return findings
    if uses.startswith("./"):
        return findings

    match = USES_RE.match(uses)
    if not match:
        findings.append(
            Finding(
                path=f"{path}:{location}.uses",
                rule="action-ref-format",
                message=f"Action reference must use owner/repo@ref format, found {uses!r}.",
            )
        )
        return findings

    ref = match.group("ref")
    if uses.startswith("docker://"):
        if "@sha256:" not in uses:
            findings.append(
                Finding(
                    path=f"{path}:{location}.uses",
                    rule="docker-action-digest-pin",
                    message=f"Docker action must be pinned by digest, found {uses!r}.",
                )
            )
        return findings

    if not FULL_SHA_RE.fullmatch(ref):
        findings.append(
            Finding(
                path=f"{path}:{location}.uses",
                rule="action-full-sha-pin",
                message=f"GitHub Action must be pinned to a full commit SHA, found {uses!r}.",
            )
        )
    return findings


def scan_strings(value: Any) -> list[str]:
    strings: list[str] = []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        for item in value:
            strings.extend(scan_strings(item))
    elif isinstance(value, dict):
        for nested in value.values():
            strings.extend(scan_strings(nested))
    return strings


def check_mutable_oci_refs(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        if any(prefix in line for prefix in TRUSTED_INSTALLERS):
            continue
        for match in OCI_TAG_RE.finditer(line):
            image = match.group("image")
            if "@sha256:" in line:
                continue
            findings.append(
                Finding(
                    path=f"{path}:{lineno}",
                    rule="oci-digest-pin",
                    message=f"OCI image reference should be digest-pinned, found {image}:{match.group('tag')}.",
                )
            )
    return findings


def collect_summary(document: dict[str, Any], raw_text: str) -> dict[str, int]:
    action_refs = 0
    pinned_action_refs = 0
    digest_refs = 0

    for _, step in iter_steps(document):
        uses = step.get("uses")
        if isinstance(uses, str) and not uses.startswith("./"):
            action_refs += 1
            match = USES_RE.match(uses)
            if match and (uses.startswith("docker://") and "@sha256:" in uses or FULL_SHA_RE.fullmatch(match.group("ref"))):
                pinned_action_refs += 1

    for line in raw_text.splitlines():
        if any(prefix in line for prefix in TRUSTED_INSTALLERS):
            continue
        digest_refs += len(OCI_DIGEST_RE.findall(line))

    return {
        "action_refs": action_refs,
        "pinned_action_refs": pinned_action_refs,
        "digest_pinned_oci_refs": digest_refs,
    }


def evaluate_path(path: Path) -> tuple[list[Finding], dict[str, int]]:
    raw_text = path.read_text(encoding="utf-8")
    document = load_yaml(path)
    findings: list[Finding] = []

    for location, step in iter_steps(document):
        findings.extend(check_uses(path, location, step))

    findings.extend(check_mutable_oci_refs(path, raw_text))
    return findings, collect_summary(document, raw_text)


def resolve_workflow_path(path_str: str) -> Path:
    candidate = ROOT / path_str if not Path(path_str).is_absolute() else Path(path_str)
    resolved = candidate.resolve()
    try:
        resolved.relative_to(ROOT)
    except ValueError:
        fail(f"Workflow path must be within repository root: {path_str}")
    return resolved


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Validate that high-trust workflows use SHA-pinned GitHub Actions and "
            "digest-pinned OCI image references."
        )
    )
    parser.add_argument(
        "paths",
        nargs="*",
        default=DEFAULT_TARGETS,
        help="Workflow files to inspect.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    all_findings: list[Finding] = []
    total_summary = {
        "action_refs": 0,
        "pinned_action_refs": 0,
        "digest_pinned_oci_refs": 0,
    }

    for path_str in args.paths:
        path = resolve_workflow_path(path_str)
        if not path.is_file():
            fail(f"Workflow file not found: {path}")
        findings, summary = evaluate_path(path)
        all_findings.extend(findings)
        for key, value in summary.items():
            total_summary[key] += value

    if all_findings:
        for finding in all_findings:
            print(f"::error file={finding.path},title={finding.rule}::{finding.message}", file=sys.stderr)
        return 1

    print(
        "[workflow-input-provenance] OK "
        f"actions={total_summary['pinned_action_refs']}/{total_summary['action_refs']} "
        f"oci_digest_refs={total_summary['digest_pinned_oci_refs']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
