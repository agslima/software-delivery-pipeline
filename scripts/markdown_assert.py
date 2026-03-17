#!/usr/bin/env python3
"""Markdown-aware assertions for governance drift checks."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


HEADING_RE = re.compile(r"^\s*#{1,6}\s+(?P<text>.+?)\s*#*\s*$", re.MULTILINE)
INLINE_LINK_RE = re.compile(r"\[[^][]+\]\(([^)]+)\)")
REFERENCE_DEF_RE = re.compile(
    r'^\s*\[([^\]]+)\]:\s*<?([^>\s]+)>?(?:\s+(?:"[^"]*"|\'[^\']*\'|\([^)]+\)))?\s*$',
    re.MULTILINE,
)
REFERENCE_LINK_RE = re.compile(r"\[[^][]+\]\[([^\]]+)\]")
COLLAPSED_REFERENCE_LINK_RE = re.compile(r"\[([^\]]+)\]\[\]")
SHORTCUT_REFERENCE_LINK_RE = re.compile(r"(?<![!\[])\\?\[([^\]]+)\](?!\(|\[|:)")
BARE_TARGET_RE = re.compile(r"(https?://[^\s)>]+|docs/[A-Za-z0-9._/#-]+)")


def fail(message: str) -> None:
    """Emit a GitHub Actions error annotation and exit."""
    print(f"::error::{message}", file=sys.stderr)
    raise SystemExit(1)


def read_text(path_str: str) -> str:
    """Return UTF-8 text for the provided repository-relative file path."""
    path = Path(path_str)
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        fail(f"Unable to read {path}: {exc}")


def normalize_label(label: str) -> str:
    """Normalize a markdown reference label using GitHub/CommonMark-style rules."""
    return " ".join(label.strip().lower().split())


def github_anchor_for_heading(heading: str) -> str:
    """Return the GitHub-style fragment slug for a heading."""
    slug = heading.lower()
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"[^a-z0-9_-]", "", slug)
    return slug.strip("-")


def extract_headings(text: str) -> set[str]:
    """Extract markdown heading text from a document."""
    return {match.group("text") for match in HEADING_RE.finditer(text)}


def extract_link_targets(text: str) -> set[str]:
    """Extract inline, reference-style, and bare link targets from markdown text."""
    targets: set[str] = set()
    reference_targets: dict[str, str] = {}

    for match in INLINE_LINK_RE.finditer(text):
        targets.add(match.group(1))

    for match in REFERENCE_DEF_RE.finditer(text):
        label, target = match.groups()
        reference_targets[normalize_label(label)] = target
        targets.add(target)

    for match in REFERENCE_LINK_RE.finditer(text):
        target = reference_targets.get(normalize_label(match.group(1)))
        if target:
            targets.add(target)

    for match in COLLAPSED_REFERENCE_LINK_RE.finditer(text):
        target = reference_targets.get(normalize_label(match.group(1)))
        if target:
            targets.add(target)

    for match in SHORTCUT_REFERENCE_LINK_RE.finditer(text):
        target = reference_targets.get(normalize_label(match.group(1)))
        if target:
            targets.add(target)

    for match in BARE_TARGET_RE.finditer(text):
        targets.add(match.group(1))

    return targets


def command_heading_any(args: argparse.Namespace) -> int:
    """Check whether a file contains at least one of the specified headings."""
    headings = extract_headings(read_text(args.file))
    if any(expected in headings for expected in args.expected):
        return 0
    fail(f"Missing expected markdown heading variants in {args.file}: {', '.join(args.expected)}")


def command_link_any(args: argparse.Namespace) -> int:
    """Check whether a file contains at least one of the specified link targets."""
    targets = extract_link_targets(read_text(args.file))
    if any(expected in targets for expected in args.expected):
        return 0
    fail(f"Missing expected markdown link targets in {args.file}: {', '.join(args.expected)}")


def command_anchor(args: argparse.Namespace) -> int:
    """Print the GitHub-style anchor for a heading."""
    print(github_anchor_for_heading(args.heading))
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Build the CLI parser."""
    parser = argparse.ArgumentParser(description="Markdown-aware assertions for governance scripts.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    heading_parser = subparsers.add_parser("heading-any", help="Assert that a file contains at least one heading.")
    heading_parser.add_argument("file", help="Markdown file to inspect.")
    heading_parser.add_argument("expected", nargs="+", help="Accepted heading text variants.")
    heading_parser.set_defaults(func=command_heading_any)

    link_parser = subparsers.add_parser("link-any", help="Assert that a file contains at least one link target.")
    link_parser.add_argument("file", help="Markdown file to inspect.")
    link_parser.add_argument("expected", nargs="+", help="Accepted link target variants.")
    link_parser.set_defaults(func=command_link_any)

    anchor_parser = subparsers.add_parser("anchor", help="Print the GitHub-style anchor slug for a heading.")
    anchor_parser.add_argument("heading", help="Heading text to convert.")
    anchor_parser.set_defaults(func=command_anchor)

    return parser


def main() -> int:
    """Entry point."""
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
