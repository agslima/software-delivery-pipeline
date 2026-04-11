#!/usr/bin/env python3
"""Validate PR migration safety expectations for schema-impacting changes."""

from __future__ import annotations

import argparse
import tempfile
import os
import pathlib
import re
import subprocess
import sys
from typing import Iterable


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = REPO_ROOT / "app/server/src/infra/db/migrations"

SCHEMA_IMPACT_PATH_PREFIXES = (
    "app/server/src/infra/db/",
)

SCHEMA_IMPACT_FILES = {
    "app/server/src/config/database.js",
    "app/server/src/config/knexfile.js",
    "app/server/src/infra/db/knex.js",
    "app/server/src/infra/db/knex-config.js",
}

MIGRATION_PATH_PREFIX = "app/server/src/infra/db/migrations/"

DESTRUCTIVE_PATTERNS = (
    re.compile(r"\brenameColumn\s*\("),
    re.compile(r"\bdropColumn\s*\("),
    re.compile(r"\bdropColumns\s*\("),
    re.compile(r"\bdropTable\s*\("),
    re.compile(r"\bdropTableIfExists\s*\("),
    re.compile(r"\bdropNullable\s*\("),
    re.compile(r"\bdropForeign\s*\("),
    re.compile(r"\bdropUnique\s*\("),
    re.compile(r"\bdropIndex\s*\("),
    re.compile(r"\balter\s*\(\s*\{[^)]*\bnullable\s*:\s*false", re.IGNORECASE | re.DOTALL),
    re.compile(r"\bsetNullable\s*\(\s*false\s*\)"),
)

SAFE_DESTRUCTIVE_ALLOWLIST = (
    re.compile(r"\bexports\.down\b"),
    re.compile(r"\brollback\b", re.IGNORECASE),
)

NO_MIGRATION_CHECKBOX = re.compile(
    r"- \[x\] Migration impact reviewed: no schema migration required", re.IGNORECASE
)
NO_MIGRATION_REASON = re.compile(r"Migration rationale:\s*\S.+", re.IGNORECASE)
EXCEPTION_CHECKBOX = re.compile(
    r"- \[x\] Destructive migration exception approved", re.IGNORECASE
)
EXCEPTION_TICKET = re.compile(r"Migration exception ticket:\s*\S+", re.IGNORECASE)
EXCEPTION_RATIONALE = re.compile(r"Migration exception rationale:\s*\S.+", re.IGNORECASE)


def fail(message: str) -> None:
    print(f"::error::{message}", file=sys.stderr)
    raise SystemExit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=os.environ.get("MIGRATION_CHECK_BASE", "HEAD~1"))
    parser.add_argument("--head", default=os.environ.get("MIGRATION_CHECK_HEAD", "HEAD"))
    parser.add_argument(
        "--pr-body-file",
        default=os.environ.get("MIGRATION_CHECK_PR_BODY_FILE"),
        help="Path to a file containing the pull request body.",
    )
    parser.add_argument(
        "--changed-file",
        action="append",
        default=[],
        help="Explicit changed file path. Repeat instead of using git diff.",
    )
    return parser.parse_args()


def git_changed_files(base: str, head: str) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base}...{head}"],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        fail(f"Unable to compute changed files from git diff {base}...{head}: {result.stderr.strip()}")
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def resolve_path_within_roots(
    path_value: str,
    roots: Iterable[pathlib.Path],
    *,
    require_file: bool,
    error_label: str,
    allow_absolute: bool,
) -> pathlib.Path:
    raw_value = path_value.strip()
    if not raw_value:
        fail(f"{error_label} path must not be empty")
    if "\x00" in raw_value:
        fail(f"{error_label} path contains invalid characters")

    expanded_raw = os.path.expanduser(raw_value)
    if not allow_absolute and os.path.isabs(expanded_raw):
        fail(f"{error_label} path must be repository-relative: {path_value}")

    normalized_for_parts = expanded_raw.replace("\\", "/")
    if any(part == ".." for part in normalized_for_parts.split("/")):
        fail(f"{error_label} path contains invalid traversal segments: {path_value}")

    root_candidates = [root.resolve() for root in roots]
    within_allowed_root = False
    for root_resolved in root_candidates:
        candidate_base = pathlib.Path(expanded_raw) if os.path.isabs(expanded_raw) else (root_resolved / expanded_raw)

        try:
            common_candidate_base = os.path.commonpath((str(root_resolved), str(candidate_base)))
        except ValueError:
            common_candidate_base = None
        if common_candidate_base == str(root_resolved):
            within_allowed_root = True

        try:
            candidate_resolved = candidate_base.resolve(strict=require_file)
        except FileNotFoundError:
            continue

        try:
            common_path = os.path.commonpath((str(root_resolved), str(candidate_resolved)))
        except ValueError:
            continue

        if common_path != str(root_resolved):
            continue

        if require_file and not candidate_resolved.is_file():
            fail(f"{error_label} file not found: {candidate_resolved}")

        return candidate_resolved

    if require_file and within_allowed_root:
        fail(f"{error_label} file not found: {path_value}")

    allowed_roots = ", ".join(str(root) for root in root_candidates)
    fail(f"{error_label} path must be within one of: {allowed_roots}: {path_value}")


def resolve_path_within_root(path_value: str, root: pathlib.Path, *, require_file: bool, error_label: str) -> pathlib.Path:
    return resolve_path_within_roots(
        path_value,
        (root,),
        require_file=require_file,
        error_label=error_label,
        allow_absolute=False,
    )


def load_pr_body(path_value: str | None) -> str:
    if not path_value:
        return os.environ.get("MIGRATION_CHECK_PR_BODY", "")

    body_path = resolve_path_within_roots(
        path_value,
        (REPO_ROOT, pathlib.Path(tempfile.gettempdir())),
        require_file=True,
        error_label="PR body",
        allow_absolute=True,
    )
    return body_path.read_text(encoding="utf-8")


def is_schema_impact_path(path_value: str) -> bool:
    if path_value.startswith(MIGRATION_PATH_PREFIX):
        return True
    if path_value in SCHEMA_IMPACT_FILES:
        return True
    if any(path_value.startswith(candidate) for candidate in SCHEMA_IMPACT_PATH_PREFIXES):
        return True
    return path_value.startswith("app/server/src/infra/v2/") and path_value.endswith(".repository.js")


def sanitize_migration_path(path_value: str) -> str:
    normalized_input = path_value.replace("\\", "/")
    if not normalized_input.startswith(MIGRATION_PATH_PREFIX):
        fail(f"Changed migration path must be under {MIGRATION_PATH_PREFIX}: {path_value}")
    if normalized_input.startswith("/") or normalized_input.startswith("\\"):
        fail(f"Migration path must be repository-relative: {path_value}")
    if any(part in ("", "..") for part in normalized_input.split("/")):
        fail(f"Changed migration path contains invalid traversal segments: {path_value}")

    candidate = pathlib.Path(normalized_input)
    if candidate.is_absolute():
        fail(f"Migration path must be repository-relative: {path_value}")

    resolved = resolve_path_within_root(
        normalized_input,
        MIGRATIONS_DIR,
        require_file=False,
        error_label="Changed migration",
    )

    return resolved.relative_to(REPO_ROOT.resolve()).as_posix()


def is_destructive_line(line: str) -> bool:
    if any(pattern.search(line) for pattern in SAFE_DESTRUCTIVE_ALLOWLIST):
        return False
    return any(pattern.search(line) for pattern in DESTRUCTIVE_PATTERNS)


def destructive_findings(migration_paths: Iterable[str]) -> list[str]:
    findings: list[str] = []
    for relative_path in migration_paths:
        full_path = resolve_path_within_root(
            relative_path,
            REPO_ROOT,
            require_file=True,
            error_label="Changed migration",
        )
        lines = full_path.read_text(encoding="utf-8").splitlines()
        for line_number, line in enumerate(lines, start=1):
            if is_destructive_line(line):
                findings.append(f"{relative_path}:{line_number}: {line.strip()}")
    return findings


def require_no_migration_exception(pr_body: str) -> None:
    if not NO_MIGRATION_CHECKBOX.search(pr_body):
        fail(
            "Schema-impacting files changed without a migration file. "
            "Add a migration or check 'Migration impact reviewed: no schema migration required' in the PR template."
        )
    if not NO_MIGRATION_REASON.search(pr_body):
        fail(
            "Schema-impacting files changed without a migration file. "
            "Provide a non-empty 'Migration rationale:' entry in the PR template."
        )


def require_destructive_exception(pr_body: str, findings: list[str]) -> None:
    if not EXCEPTION_CHECKBOX.search(pr_body):
        fail(
            "Potentially destructive migration operations detected. "
            "Remove the destructive change or check 'Destructive migration exception approved' in the PR template.\n"
            + "\n".join(findings)
        )
    if not EXCEPTION_TICKET.search(pr_body):
        fail(
            "Destructive migration exception requires 'Migration exception ticket:' in the PR template.\n"
            + "\n".join(findings)
        )
    if not EXCEPTION_RATIONALE.search(pr_body):
        fail(
            "Destructive migration exception requires 'Migration exception rationale:' in the PR template.\n"
            + "\n".join(findings)
        )


def main() -> None:
    args = parse_args()
    changed_files = args.changed_file or git_changed_files(args.base, args.head)
    pr_body = load_pr_body(args.pr_body_file)

    schema_paths = sorted(path for path in changed_files if is_schema_impact_path(path))
    migration_paths = sorted(
        sanitize_migration_path(path)
        for path in changed_files
        if path.startswith(MIGRATION_PATH_PREFIX)
    )

    print(f"[migration-safety] changed_files={len(changed_files)} schema_paths={len(schema_paths)} migration_paths={len(migration_paths)}")

    if not schema_paths:
        print("[migration-safety] no schema-impacting changes detected")
        return

    if not migration_paths:
        require_no_migration_exception(pr_body)
        print("[migration-safety] schema-impacting changes allowed without migration via explicit PR rationale")
        return

    findings = destructive_findings(migration_paths)
    if findings:
        require_destructive_exception(pr_body, findings)
        print("[migration-safety] destructive migration exception metadata present")
        return

    print("[migration-safety] migration validation passed")


if __name__ == "__main__":
    main()
