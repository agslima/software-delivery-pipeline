#!/usr/bin/env python3
from __future__ import annotations

import argparse
import pathlib
import re
import sys
from dataclasses import dataclass


ROOT = pathlib.Path(__file__).resolve().parents[1]
README_PATH = ROOT / 'README.md'
EVIDENCE_INDEX_PATH = ROOT / 'docs' / 'governance-evidence-index.md'


@dataclass(frozen=True)
class EvidenceRow:
    claim: str
    workflow_cell: str
    line_number: int


@dataclass(frozen=True)
class WorkflowReference:
    workflow_path: str
    jobs: tuple[str, ...]


def normalize_text(text: str) -> str:
    """
    Normalize markdown text by removing formatting and normalizing whitespace and quotes.
    
    Returns:
        The input string with markdown links replaced by their label, `**`/`__`/backticks removed, curly quotes converted to straight quotes, consecutive whitespace collapsed to single spaces, and leading/trailing whitespace trimmed.
    """
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    text = (
        text.replace('**', '')
        .replace('__', '')
        .replace('`', '')
        .replace('’', "'")
        .replace('‘', "'")
        .replace('“', '"')
        .replace('”', '"')
    )
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_section_lines(text: str, heading: str) -> list[str]:
    """
    Extract the lines within the first Markdown section matching the given heading.
    
    Searches for the first line that is exactly either "## {heading}" or "### {heading}" (ignoring surrounding whitespace) and returns all subsequent lines up to, but not including, the next top-level or subheading starting with "## " or "### ".
    
    Parameters:
        text (str): The full Markdown document text to scan.
        heading (str): The heading text to find (without the leading '#' characters).
    
    Returns:
        list[str]: The raw lines belonging to the matched section, in original order.
    
    Raises:
        SystemExit: If the specified heading is not found.
    """
    lines = text.splitlines()
    start_index: int | None = None
    heading_prefix = f"## {heading}"
    subheading_prefix = f"### {heading}"

    for index, line in enumerate(lines):
        if line.strip() in {heading_prefix, subheading_prefix}:
            start_index = index + 1
            break

    if start_index is None:
        raise SystemExit(f"Missing required heading '{heading}'.")

    section_lines: list[str] = []
    for line in lines[start_index:]:
        if line.startswith('## ') or line.startswith('### '):
            break
        section_lines.append(line)

    return section_lines


def extract_readme_claims(text: str) -> list[str]:
    """
    Extracts normalized top-level bullet claims from the README `## TL;DR` section.
    
    Parameters:
        text (str): Full README markdown text.
    
    Returns:
        list[str]: Normalized claim strings extracted from top-level '- ' bullets in the TL;DR section.
    
    Raises:
        SystemExit: If the TL;DR section contains no top-level '- ' bullet items.
    """
    section_lines = extract_section_lines(text, 'TL;DR')
    claims = [normalize_text(line[2:]) for line in section_lines if line.startswith('- ')]
    if not claims:
        raise SystemExit(
            "README.md TL;DR section does not contain top-level governance claims. "
            "Expected one or more '- ' bullet items under '## TL;DR'."
        )
    return claims


def parse_markdown_table_row(line: str) -> list[str]:
    """
    Split a Markdown table row into its cell values.
    
    Parameters:
        line (str): A single markdown table row (e.g. "| a | b | c |").
    
    Returns:
        list[str]: List of cell strings with surrounding whitespace removed and outer pipe characters ignored.
    """
    parts = [part.strip() for part in line.strip().strip('|').split('|')]
    return parts


def extract_evidence_rows(text: str) -> list[EvidenceRow]:
    """
    Extract evidence rows from the 'README Claim Traceability' table in the provided markdown text.
    
    Parameters:
        text (str): Full contents of the evidence-index markdown file.
    
    Returns:
        list[EvidenceRow]: A list of EvidenceRow objects in the order found. Each entry contains:
            - claim: the normalized README claim text
            - workflow_cell: the raw workflow/job cell text from the table
            - line_number: the 1-based source line number in the input text where the row was found
    
    Raises:
        SystemExit: If the traceability table has no data rows or if a table row has fewer than two cells
                    (reporting the evidence index path and offending line number).
    """
    lines = text.splitlines()
    in_table = False
    rows: list[EvidenceRow] = []

    for line_number, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped == '### README Claim Traceability':
            in_table = True
            continue

        if not in_table:
            continue

        if stripped.startswith('### ') and stripped != '### README Claim Traceability':
            break

        if not stripped.startswith('|'):
            continue

        cells = parse_markdown_table_row(stripped)
        if not cells or cells[0] in {'README claim', ':---'}:
            continue
        if len(cells) < 2:
            raise SystemExit(
                f"Malformed row in {EVIDENCE_INDEX_PATH.relative_to(ROOT)}:{line_number}. "
                "Expected a markdown table row with at least README claim and workflow columns."
            )
        rows.append(
            EvidenceRow(
                claim=normalize_text(cells[0]),
                workflow_cell=cells[1],
                line_number=line_number,
            )
        )

    if not rows:
        raise SystemExit(
            "docs/governance-evidence-index.md is missing the 'README Claim Traceability' table rows."
        )

    return rows


WORKFLOW_ENTRY_RE = re.compile(
    r"`(?P<path>\.github/workflows/[^`]+\.ya?ml)`(?P<tail>[^;]*)"
)


def parse_workflow_references(cell: str, *, row: EvidenceRow) -> list[WorkflowReference]:
    """
    Extract workflow file references and their job tokens from a markdown table cell used in the evidence index.
    
    Parameters:
    	cell (str): The raw text of the "Workflow job enforcement" table cell containing backticked workflow paths and job identifiers.
    	row (EvidenceRow): The evidence row (provides .line_number) for error context.
    
    Returns:
    	list[WorkflowReference]: A list of WorkflowReference objects, each containing the referenced workflow path and a tuple of job tokens.
    
    Raises:
    	SystemExit: If the cell contains no backticked workflow path, if a referenced workflow path is not followed by an arrow (`→` or `->`), or if an arrow is present but no job identifiers are provided; error messages include the evidence index file path and the row's line number.
    """
    matches = list(WORKFLOW_ENTRY_RE.finditer(cell))
    if not matches:
        raise SystemExit(
            f"{EVIDENCE_INDEX_PATH.relative_to(ROOT)}:{row.line_number} does not contain a valid "
            "workflow file reference in the 'Workflow job enforcement' column. "
            "Use the format `.github/workflows/<file>.yml` → `job-id`."
        )

    references: list[WorkflowReference] = []
    for match in matches:
        workflow_path = match.group('path')
        tail = match.group('tail')
        job_tokens = tuple(token.strip() for token in re.findall(r'`([^`]+)`', tail))
        if '→' in tail or '->' in tail:
            if not job_tokens:
                raise SystemExit(
                    f"{EVIDENCE_INDEX_PATH.relative_to(ROOT)}:{row.line_number} references {workflow_path} "
                    "without any job identifiers. Add one or more job ids after the arrow, for example "
                    f"`{workflow_path}` → `job-id`."
                )
        else:
            raise SystemExit(
                f"{EVIDENCE_INDEX_PATH.relative_to(ROOT)}:{row.line_number} references {workflow_path} "
                "without a job mapping. Use the format `.github/workflows/<file>.yml` → `job-id`."
            )
        references.append(WorkflowReference(workflow_path=workflow_path, jobs=job_tokens))

    return references


def load_workflow_jobs(workflow_path: pathlib.Path) -> dict[str, str]:
    """
    Extract top-level job IDs and their display names from a GitHub Actions workflow file.
    
    Parses the workflow file at the given path and returns a mapping of each top-level job ID to its display name (empty string if the job has no `name:`). The function expects a standard workflow `jobs:` mapping and will capture job identifiers and the first `name:` value encountered for each job.
    
    Parameters:
        workflow_path (pathlib.Path): Path to the workflow YAML file.
    
    Returns:
        dict[str, str]: Mapping from job ID to display name (empty string if unnamed).
    
    Raises:
        SystemExit: If no parseable top-level jobs are found in the workflow file.
    """
    job_lookup: dict[str, str] = {}
    current_job_id: str | None = None
    in_jobs = False

    for line in workflow_path.read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue

        if line.startswith('jobs:'):
            in_jobs = True
            current_job_id = None
            continue

        if not in_jobs:
            continue

        if re.match(r'^\S', line):
            break

        job_match = re.match(r'^  ([A-Za-z0-9_-]+):\s*(?:#.*)?$', line)
        if job_match:
            current_job_id = job_match.group(1)
            job_lookup[current_job_id] = ''
            continue

        if current_job_id is None:
            continue

        name_match = re.match(r'^    name:\s*(.+?)\s*$', line)
        if name_match and not job_lookup[current_job_id]:
            job_lookup[current_job_id] = name_match.group(1).strip("'\"")

    if not job_lookup:
        raise SystemExit(f"Workflow {workflow_path.relative_to(ROOT)} has no parseable top-level jobs map.")

    return job_lookup

def validate_claim_coverage(readme_claims: list[str], evidence_rows: list[EvidenceRow]) -> list[str]:
    """
    Find README TL;DR claims that are not covered by any evidence row.
    
    Parameters:
        readme_claims (list[str]): Normalized claim strings extracted from the README TL;DR section.
        evidence_rows (list[EvidenceRow]): Parsed evidence-index rows; each row's `claim` field is used for comparison.
    
    Returns:
        list[str]: The subset of `readme_claims` that do not appear among the `claim` values of `evidence_rows`.
    """
    evidence_claims = {row.claim for row in evidence_rows}
    return [claim for claim in readme_claims if claim not in evidence_claims]


def validate_workflow_references(evidence_rows: list[EvidenceRow]) -> list[str]:
    """
    Validate that workflow file paths and referenced job identifiers in evidence rows exist.
    
    Checks each EvidenceRow's workflow references: for each referenced workflow path ensures the file exists in the repository, and for each referenced job token ensures it matches either a top-level job id or a non-empty job display name defined in that workflow. Collects human-readable error messages for missing workflow files or unknown jobs.
    
    Parameters:
        evidence_rows (list[EvidenceRow]): Parsed evidence-index rows containing normalized claim text, the raw workflow-cell content, and the source line number.
    
    Returns:
        list[str]: A list of error messages describing missing workflow files or invalid/missing job references. Returns an empty list when all references are valid.
    """
    errors: list[str] = []

    for row in evidence_rows:
        for reference in parse_workflow_references(row.workflow_cell, row=row):
            workflow_path = ROOT / reference.workflow_path
            if not workflow_path.is_file():
                errors.append(
                    f"- {EVIDENCE_INDEX_PATH.relative_to(ROOT)}:{row.line_number} claim '{row.claim}' references "
                    f"missing workflow file '{reference.workflow_path}'. Remediation: restore the workflow or "
                    "update the evidence index row to the active workflow path."
                )
                continue

            available_jobs = load_workflow_jobs(workflow_path)
            available_job_list = ', '.join(sorted(available_jobs))
            for job in reference.jobs:
                if job not in available_jobs:
                    display_name_matches = [
                        job_id
                        for job_id, display_name in available_jobs.items()
                        if display_name and display_name == job
                    ]
                    if display_name_matches:
                        continue
                    errors.append(
                        f"- {EVIDENCE_INDEX_PATH.relative_to(ROOT)}:{row.line_number} claim '{row.claim}' references "
                        f"workflow job '{job}' in '{reference.workflow_path}', but that job was not found. "
                        f"Available jobs: {available_job_list}. Remediation: update the evidence index to the current "
                        "workflow job id/name or restore the removed job."
                    )

    return errors


def run_check(readme_path: pathlib.Path = README_PATH, evidence_index_path: pathlib.Path = EVIDENCE_INDEX_PATH) -> None:
    """
    Run the governance evidence index validation using the specified README and evidence-index files.
    
    Reads the README TL;DR claims and the docs/governance-evidence-index.md traceability table, verifies every README claim has a corresponding evidence row, and validates that workflow file paths and referenced job IDs/names in the evidence rows exist. On any failure, prints diagnostic messages to stderr and exits with code 1; on success, prints a summary of validated counts.
    
    Parameters:
        readme_path (pathlib.Path): Path to the README.md file to scan (default: README_PATH).
        evidence_index_path (pathlib.Path): Path to the governance evidence index markdown file (default: EVIDENCE_INDEX_PATH).
    """
    readme_claims = extract_readme_claims(readme_path.read_text(encoding='utf-8'))
    evidence_rows = extract_evidence_rows(evidence_index_path.read_text(encoding='utf-8'))

    missing_claims = validate_claim_coverage(readme_claims, evidence_rows)
    workflow_errors = validate_workflow_references(evidence_rows)

    if missing_claims or workflow_errors:
        print('Governance evidence index drift detected.', file=sys.stderr)
        if missing_claims:
            print('\nMissing README claim mappings:', file=sys.stderr)
            for claim in missing_claims:
                print(
                    f"- README claim '{claim}' does not have a matching row in "
                    "docs/governance-evidence-index.md. Remediation: add a row for this claim or update the "
                    "README TL;DR claim text and evidence index row together.",
                    file=sys.stderr,
                )
        if workflow_errors:
            print('\nBroken workflow/job references:', file=sys.stderr)
            for error in workflow_errors:
                print(error, file=sys.stderr)
        raise SystemExit(1)

    print(
        f"Governance evidence index OK: {len(readme_claims)} README claims mapped and "
        f"{len(evidence_rows)} evidence rows validated against workflow files/jobs."
    )


def parse_args() -> argparse.Namespace:
    """
    Parse command-line arguments for the governance evidence index check.
    
    Parameters:
        --readme (pathlib.Path): Path to the README file to validate (defaults to the repository README).
        --evidence-index (pathlib.Path): Path to the governance evidence index markdown file (defaults to docs/governance-evidence-index.md).
    
    Returns:
        argparse.Namespace: Parsed arguments with attributes `readme` and `evidence_index`, both as pathlib.Path.
    """
    parser = argparse.ArgumentParser(
        description=(
            'Validate README governance claims are covered by docs/governance-evidence-index.md '
            'and that workflow/job references in the evidence index remain valid.'
        )
    )
    parser.add_argument('--readme', type=pathlib.Path, default=README_PATH)
    parser.add_argument('--evidence-index', type=pathlib.Path, default=EVIDENCE_INDEX_PATH)
    return parser.parse_args()


def main() -> None:
    """
    Parse command-line arguments and run the governance evidence index check using those arguments.
    """
    args = parse_args()
    run_check(readme_path=args.readme, evidence_index_path=args.evidence_index)


if __name__ == '__main__':
    main()
