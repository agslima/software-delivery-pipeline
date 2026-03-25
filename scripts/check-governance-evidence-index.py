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
    section_lines = extract_section_lines(text, 'TL;DR')
    claims = [normalize_text(line[2:]) for line in section_lines if line.startswith('- ')]
    if not claims:
        raise SystemExit(
            "README.md TL;DR section does not contain top-level governance claims. "
            "Expected one or more '- ' bullet items under '## TL;DR'."
        )
    return claims


def parse_markdown_table_row(line: str) -> list[str]:
    parts = [part.strip() for part in line.strip().strip('|').split('|')]
    return parts


def extract_evidence_rows(text: str) -> list[EvidenceRow]:
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
    evidence_claims = {row.claim for row in evidence_rows}
    return [claim for claim in readme_claims if claim not in evidence_claims]


def validate_workflow_references(evidence_rows: list[EvidenceRow]) -> list[str]:
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
    args = parse_args()
    run_check(readme_path=args.readme, evidence_index_path=args.evidence_index)


if __name__ == '__main__':
    main()
