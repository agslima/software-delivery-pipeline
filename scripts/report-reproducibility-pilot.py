#!/usr/bin/env python3
"""Generate a report for a two-run OCI reproducibility pilot."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tarfile
from pathlib import Path
from typing import Any


def fail(message: str) -> None:
    """
    Print an error to stderr prefixed with "::error::" and exit the program with status code 1.
    
    Parameters:
        message (str): Text of the error message to print (will be prefixed with "::error::").
    
    Raises:
        SystemExit: Exits with status code 1.
    """
    print(f"::error::{message}", file=sys.stderr)
    raise SystemExit(1)


def file_sha256(path: Path) -> str:
    """
    Compute the SHA-256 hexadecimal digest of a file.
    
    Returns:
        hex_digest (str): Hexadecimal SHA-256 digest of the file contents.
    """
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_manifest_info(archive_path: Path) -> dict[str, Any]:
    """
    Extract manifest digest, platform, and reference name from an OCI image archive's index.json.
    
    Parameters:
        archive_path (Path): Path to the OCI image archive tar file to inspect.
    
    Returns:
        info (dict[str, Any]): A dictionary with:
            - manifest_digest (str): The manifest `sha256:` digest from the first manifest entry.
            - platform (str): A string formatted as `os/architecture` when available, otherwise `"unknown"`.
            - ref_name (str): The `org.opencontainers.image.ref.name` annotation value, or an empty string if absent.
    
    Notes:
        This function calls `fail(...)` (which exits the program) if the archive cannot be opened, if `index.json` is missing or unreadable, if `manifests` is not a non-empty list, or if the first manifest's digest is missing or not a `sha256:` string.
    """
    try:
        with tarfile.open(archive_path, "r") as archive:
            try:
                index_member = archive.getmember("index.json")
            except KeyError as exc:
                fail(f"{archive_path} is missing index.json: {exc}")

            index_file = archive.extractfile(index_member)
            if index_file is None:
                fail(f"{archive_path} index.json could not be read")

            try:
                index_data = json.load(index_file)
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                fail(f"{archive_path} index.json is not valid JSON: {exc}")
            if not isinstance(index_data, dict):
                fail(f"{archive_path} index.json must be a JSON object")
    except (tarfile.TarError, OSError) as exc:
        fail(f"Failed to open OCI archive {archive_path}: {exc}")

    manifests = index_data.get("manifests")
    if not isinstance(manifests, list) or not manifests:
        fail(f"{archive_path} index.json must contain at least one manifest entry")

    manifest = manifests[0]
    if not isinstance(manifest, dict):
        fail(f"{archive_path} first manifest entry must be an object")
    digest = manifest.get("digest")
    if not isinstance(digest, str) or not digest.startswith("sha256:"):
        fail(f"{archive_path} manifest digest is missing or invalid")

    platform = manifest.get("platform", {})
    if not isinstance(platform, dict):
        platform = {}
    os_name = platform.get("os")
    architecture = platform.get("architecture")
    platform_name = (
        f"{os_name}/{architecture}"
        if isinstance(os_name, str) and isinstance(architecture, str)
        else "unknown"
    )

    annotations = manifest.get("annotations", {})
    if not isinstance(annotations, dict):
        annotations = {}
    ref_name_raw = annotations.get("org.opencontainers.image.ref.name", "")
    ref_name = ref_name_raw if isinstance(ref_name_raw, str) else ""

    return {
        "manifest_digest": digest,
        "platform": platform_name,
        "ref_name": ref_name,
    }


def write_report(
    output_dir: Path,
    image_name: str,
    first_path: Path,
    second_path: Path,
    first_info: dict[str, Any],
    second_info: dict[str, Any],
) -> tuple[Path, Path, str]:
    """
    Create a reproducibility report and human-readable summary comparing two OCI archive manifests.
    
    Parameters:
        output_dir (Path): Directory where `report.json` and `summary.md` will be written; created if missing.
        image_name (str): Image identifier included in the report and summary.
        first_path (Path): Filesystem path to the first OCI archive.
        second_path (Path): Filesystem path to the second OCI archive.
        first_info (dict): Manifest metadata for the first archive. Expected keys: `manifest_digest` (str, starts with "sha256:"), `platform` (str, e.g., "linux/amd64" or "unknown"), and `ref_name` (str).
        second_info (dict): Manifest metadata for the second archive with the same expected keys as `first_info`.
    
    Returns:
        tuple[Path, Path, str]: A tuple containing the path to `report.json`, the path to `summary.md`, and the comparison `status` which is `"pass"` when the two `manifest_digest` values match or `"mismatch"` otherwise.
    """
    status = "pass" if first_info["manifest_digest"] == second_info["manifest_digest"] else "mismatch"
    output_dir.mkdir(parents=True, exist_ok=True)

    report = {
        "schema_version": "1.0",
        "image_name": image_name,
        "status": status,
        "comparison_basis": "oci_manifest_digest",
        "runs": [
            {
                "name": "first",
                "archive": str(first_path),
                "archive_sha256": file_sha256(first_path),
                "manifest_digest": first_info["manifest_digest"],
                "platform": first_info["platform"],
                "ref_name": first_info["ref_name"],
            },
            {
                "name": "second",
                "archive": str(second_path),
                "archive_sha256": file_sha256(second_path),
                "manifest_digest": second_info["manifest_digest"],
                "platform": second_info["platform"],
                "ref_name": second_info["ref_name"],
            },
        ],
    }

    report_path = output_dir / "report.json"
    summary_path = output_dir / "summary.md"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    summary_lines = [
        "# Reproducibility Pilot Summary",
        "",
        f"- Image: `{image_name}`",
        f"- Status: `{status}`",
        "- Comparison basis: `oci_manifest_digest`",
        f"- First manifest digest: `{first_info['manifest_digest']}`",
        f"- Second manifest digest: `{second_info['manifest_digest']}`",
        f"- First platform: `{first_info['platform']}`",
        f"- Second platform: `{second_info['platform']}`",
        "",
        "Interpretation:",
        (
            "- The two normalized OCI builds produced the same manifest digest."
            if status == "pass"
            else "- The two normalized OCI builds produced different manifest digests. Treat this as a reproducibility pilot failure that needs investigation before using the result as evidence."
        ),
        "",
        "Artifacts:",
        f"- `{report_path.name}`",
        f"- `{summary_path.name}`",
    ]
    summary_path.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    return report_path, summary_path, status


def parse_args() -> argparse.Namespace:
    """
    Parse and validate command-line arguments for the reproducibility report tool.
    
    Defines and requires the following CLI options:
        --image-name (str): Logical name of the image being compared.
        --first-archive (Path): Path to the first OCI image archive (tar file).
        --second-archive (Path): Path to the second OCI image archive (tar file).
        --output-dir (Path): Directory where `report.json` and `summary.md` will be written.
    
    Returns:
        args (argparse.Namespace): Parsed arguments with attributes `image_name` (str),
        `first_archive` (Path), `second_archive` (Path), and `output_dir` (Path).
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image-name", required=True)
    parser.add_argument("--first-archive", required=True, type=Path)
    parser.add_argument("--second-archive", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument(
        "--allow-mismatch",
        action="store_true",
        help="Write mismatch evidence but exit successfully for non-blocking pilot runs.",
    )
    return parser.parse_args()


def main() -> int:
    """
    Execute the CLI workflow that compares two OCI image archives and writes reproducibility artifacts.
    
    Validates that both archive paths exist, extracts manifest information from each archive, writes a machine-readable report and a human-readable summary to the specified output directory, prints the generated artifact paths, and returns an exit code indicating comparison result.
    
    Returns:
        0 if the two archives' manifest digests match, 1 if they differ.
    
    Raises:
        SystemExit: If an archive is missing, cannot be opened as a tar archive, or required OCI manifest fields are invalid (these conditions cause immediate program termination via fail()).
    """
    args = parse_args()
    first_path = args.first_archive.resolve()
    second_path = args.second_archive.resolve()

    if not first_path.is_file():
        fail(f"First OCI archive does not exist: {first_path}")
    if not second_path.is_file():
        fail(f"Second OCI archive does not exist: {second_path}")

    first_info = extract_manifest_info(first_path)
    second_info = extract_manifest_info(second_path)
    report_path, summary_path, status = write_report(
        args.output_dir.resolve(),
        args.image_name,
        first_path,
        second_path,
        first_info,
        second_info,
    )

    print(f"[reproducibility-pilot] report: {report_path}")
    print(f"[reproducibility-pilot] summary: {summary_path}")
    if status != "pass":
        print("[reproducibility-pilot] mismatch detected")
        if args.allow_mismatch:
            print("[reproducibility-pilot] mismatch allowed for non-blocking pilot")
            return 0
        return 1
    print("[reproducibility-pilot] pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
