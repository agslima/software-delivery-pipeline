#!/usr/bin/env python3
"""Markdown-aware assertions for governance drift checks."""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
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
    """
    Read and return the UTF-8 contents of a repository-relative file path.
    
    Parameters:
        path_str (str): Repository-relative path to the file.
    
    Returns:
        str: File contents decoded as UTF-8.
    
    Notes:
        If the file cannot be read, emits a GitHub Actions error annotation and exits the process.
    """
    path = Path(path_str)
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        fail(f"Unable to read {path}: {exc}")


def normalize_label(label: str) -> str:
    """
    Normalize a Markdown reference label to its canonical form used for matching.
    
    Parameters:
        label (str): The original reference label.
    
    Returns:
        str: The label lowercased, with leading/trailing whitespace removed and any internal whitespace collapsed to single spaces.
    """
    return " ".join(label.strip().lower().split())


def github_anchor_for_heading(heading: str) -> str:
    """Generate a GitHub-style anchor slug from a heading string."""
    slug = unicodedata.normalize("NFKC", heading).casefold()
    slug = "".join(
        char for char in slug if char in {" ", "-", "_"} or not unicodedata.category(char).startswith("P")
    )
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    return slug.strip("-")


def extract_headings(text: str) -> set[str]:
    """
    Extracts heading texts from a Markdown document.
    
    Parameters:
        text (str): Markdown document content to scan for headings.
    
    Returns:
        set[str]: Set of heading texts found in the document (the inner text of Markdown headings).
    """
    return {match.group("text") for match in HEADING_RE.finditer(text)}


def extract_link_targets(text: str) -> set[str]:
    """
    Extract all link targets referenced in the given Markdown text.
    
    Searches for inline links, reference-style links (resolved using reference definitions present in the text), collapsed and shortcut reference links, and bare URL/target forms, and returns the set of all discovered target strings.
    
    Returns:
        set[str]: A set of link target strings found in the input text.
    """
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
    """
    Check whether a file contains at least one of the specified heading variants.
    
    Parameters:
        args (argparse.Namespace): Expected to have:
            - file (str): Path to the markdown file to read.
            - expected (Sequence[str]): One or more heading variants to look for.
    
    Returns:
        int: `0` if at least one expected heading is present; otherwise emits a failure annotation and exits with a non-zero status via `fail`.
    """
    headings = extract_headings(read_text(args.file))
    if any(expected in headings for expected in args.expected):
        return 0
    fail(f"Missing expected markdown heading variants in {args.file}: {', '.join(args.expected)}")


def command_link_any(args: argparse.Namespace) -> int:
    """
    Check whether a file contains at least one of the specified link targets.
    
    Parameters:
        args (argparse.Namespace): Command-line arguments with attributes:
            file (str): Repository-relative path to the markdown file to read.
            expected (Iterable[str]): One or more link target variants to look for.
    
    Returns:
        int: 0 if any expected target is found; exits with a non-zero status if none are found.
    """
    targets = extract_link_targets(read_text(args.file))
    if any(expected in targets for expected in args.expected):
        return 0
    fail(f"Missing expected markdown link targets in {args.file}: {', '.join(args.expected)}")


def command_anchor(args: argparse.Namespace) -> int:
    """
    Print the GitHub-style anchor slug for the provided heading.
    
    Parameters:
        args (argparse.Namespace): Namespace with a `heading` attribute containing the heading text to convert.
    
    Returns:
        int: Exit code 0.
    """
    print(github_anchor_for_heading(args.heading))
    return 0


def build_parser() -> argparse.ArgumentParser:
    """
    Create and configure the top-level CLI parser with subcommands for heading-any, link-any, and anchor.
    
    The parser includes:
    - heading-any: checks a markdown file for one of the provided heading variants and dispatches to command_heading_any.
    - link-any: checks a markdown file for one of the provided link target variants and dispatches to command_link_any.
    - anchor: converts a heading string to a GitHub-style anchor and dispatches to command_anchor.
    
    Returns:
        argparse.ArgumentParser: A parser wired with the three subcommands and their handler functions.
    """
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
