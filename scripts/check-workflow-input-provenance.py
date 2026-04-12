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
    """
    Emit a GitHub Actions-style error annotation and terminate the process.
    
    Prints `message` to standard error prefixed as a GitHub Actions `::error::` annotation, then exits the program with status code 1.
    
    Parameters:
        message (str): Error message text to include in the GitHub Actions error annotation.
    
    Raises:
        SystemExit: Always raised with exit code 1 after printing the error.
    """
    print(f"::error::{message}", file=sys.stderr)
    raise SystemExit(1)


def resolve_workflow_path(path_str: str) -> Path:
    """
    Resolve a workflow path string to an absolute Path within the repository root.

    Parameters:
        path_str (str): The workflow file path or path fragment to resolve. If relative, it is interpreted relative to the repository root.

    Returns:
        Path: The resolved absolute Path guaranteed to be inside the repository root.

    Notes:
        If the resolved path is outside the repository root, or not under .github/workflows
        with a YAML extension, the function calls `fail(...)` and exits with a non-zero status.
    """
    raw_value = path_str.strip()
    if not raw_value:
        fail("Workflow path must not be empty")
    if "\x00" in raw_value:
        fail("Workflow path contains invalid characters")

    candidate = ROOT / raw_value if not Path(raw_value).is_absolute() else Path(raw_value)
    resolved = candidate.resolve()
    try:
        relative = resolved.relative_to(ROOT)
    except ValueError:
        fail(f"Workflow path must be within repository root: {path_str}")

    workflows_root = Path(".github/workflows")
    if workflows_root not in relative.parents:
        fail(f"Workflow path must be under .github/workflows: {path_str}")
    if resolved.suffix.lower() not in {".yml", ".yaml"}:
        fail(f"Workflow path must be a YAML file: {path_str}")

    return resolved


def read_workflow_text(path: Path) -> str:
    """
    Read workflow text from a repository-rooted path after validating it.

    Parameters:
        path (Path): Candidate workflow path to validate and read.

    Returns:
        str: UTF-8 decoded file contents.
    """
    resolved = resolve_workflow_path(str(path))
    try:
        return resolved.read_text(encoding="utf-8")
    except OSError as exc:
        fail(f"Failed to read {resolved}: {exc}")


def load_yaml(path: Path) -> dict[str, Any]:
    """
    Load and return a YAML mapping from the given file path.
    
    Reads the file at `path`, parses it as YAML, and returns the top-level mapping. Calls `fail(...)` and exits if YAML parsing fails or if the parsed document is not a mapping.
    
    Parameters:
        path (Path): Path to the YAML file to read and parse.
    
    Returns:
        dict[str, Any]: The parsed YAML top-level mapping.
    """
    try:
        data = yaml.safe_load(read_workflow_text(path))
    except yaml.YAMLError as exc:  # pragma: no cover - exercised through SystemExit
        fail(f"Failed to parse {path}: {exc}")
    if not isinstance(data, dict):
        fail(f"{path} must parse to a YAML mapping.")
    return data


def iter_steps(document: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """
    Collects workflow step dictionaries from a GitHub Actions workflow document and returns their locations.
    
    Parameters:
        document (dict[str, Any]): Parsed YAML mapping of a workflow file; expected to contain a top-level "jobs" mapping where each job may include a "steps" sequence.
    
    Returns:
        list[tuple[str, dict[str, Any]]]: A list of (location, step) tuples where `location` is a string like "jobs.<job_name>.steps[<1-based index>]" and `step` is the corresponding step dictionary. Only steps that are mappings are included; jobs or steps with unexpected types are skipped.
    """
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
    """
    Validate a workflow step's `uses` reference for provenance-friendly pinning.
    
    Checks that non-local `uses` entries follow the owner/repo@ref format, that Docker-style actions include a `@sha256:` digest, and that non-Docker actions are pinned to a full 40-hex commit SHA. Records a Finding for each violation.
    
    Parameters:
        path (Path): Path to the workflow file containing the step.
        location (str): Location string for the step (e.g., "jobs.<job>.steps[<n>]").
        step (dict[str, Any]): The step mapping to inspect.
    
    Returns:
        list[Finding]: A list of findings for detected issues; empty if the `uses` value is acceptable or absent.
    """
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
    """
    Collect all string values from a nested structure of strings, lists, and dictionaries.
    
    Recursively traverses the input and returns every string found. Non-string scalar types are ignored.
    
    Parameters:
        value (Any): A value that may be a `str`, `list`, or `dict` (which may contain nested combinations of these types).
    
    Returns:
        list[str]: A list of all strings discovered in `value` in traversal order.
    """
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
    """
    Scan workflow text for OCI image references that use tags instead of digests and return findings for each.
    
    Parameters:
        path (Path): File path used to build finding locations (line numbers appended).
        text (str): Raw file contents to scan line-by-line.
    
    Returns:
        list[Finding]: A list of findings for OCI references that should be digest-pinned. Lines containing any TRUSTED_INSTALLERS prefix are ignored; occurrences on the same line as an `@sha256:` digest are not reported.
    """
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
    """
    Summarizes counts of action references, SHA/digest-pinned action references, and OCI digest-pinned image references found in a workflow.
    
    Parameters:
        document (dict[str, Any]): Parsed YAML workflow mapping (the result of load_yaml).
        raw_text (str): Original workflow file text.
    
    Returns:
        dict[str, int]: A dictionary with:
            - "action_refs": number of non-local `uses` entries (strings not starting with "./").
            - "pinned_action_refs": number of those `uses` entries pinned either by a full 40-hex SHA (for non-docker actions) or by an `@sha256:` digest (for docker actions).
            - "digest_pinned_oci_refs": number of OCI image references in the raw text that are digest-pinned (matchers of OCI_DIGEST_RE).
    """
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
    """
    Evaluate a workflow file for action pinning and mutable OCI references.
    
    @returns A tuple where the first element is a list of Findings detected in the file and the second element is a summary dictionary with integer counters:
    - `action_refs`: number of non-local `uses` action references found
    - `pinned_action_refs`: number of those action references pinned to a full 40-hex SHA or (for docker `uses`) containing `@sha256:`
    - `digest_refs`: number of OCI image references in the file that are digest-pinned (`@sha256:`)
    """
    raw_text = read_workflow_text(path)
    document = load_yaml(path)
    findings: list[Finding] = []

    for location, step in iter_steps(document):
        findings.extend(check_uses(path, location, step))

    findings.extend(check_mutable_oci_refs(path, raw_text))
    return findings, collect_summary(document, raw_text)


def parse_args() -> argparse.Namespace:
    """
    Parse command-line arguments for the workflow validation script.
    
    The parser accepts an optional positional `paths` argument (nargs="*") which specifies workflow files to inspect.
    
    Returns:
        argparse.Namespace: Parsed arguments. The `paths` attribute is a list of workflow file paths to inspect (defaults to DEFAULT_TARGETS).
    """
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
    """
    Validate the provided workflow files and emit GitHub Actions-style error annotations for any pinning findings.
    
    Parses command-line paths (defaults applied if omitted), resolves and checks each workflow file, aggregates any findings produced by the evaluation routines, prints one GitHub Actions `::error` annotation line per finding when present, or prints a single OK summary line when no findings are found.
    
    Returns:
        int: 0 on success (no findings), 1 if any findings were reported.
    """
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
