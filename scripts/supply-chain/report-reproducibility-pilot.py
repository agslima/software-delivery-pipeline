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

MAX_SUMMARY_FIELD_DIFFS = 20


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


def blob_path(digest: str) -> str:
    """Convert a sha256 digest into its OCI archive blob path."""
    if not digest.startswith("sha256:"):
        fail(f"Unsupported OCI blob digest: {digest}")
    return f"blobs/sha256/{digest.removeprefix('sha256:')}"


def read_json_member(
    archive: tarfile.TarFile, member_name: str, archive_path: Path
) -> dict[str, Any]:
    """Read a tar member as a JSON object."""
    try:
        member = archive.getmember(member_name)
    except KeyError as exc:
        fail(f"{archive_path} is missing {member_name}: {exc}")

    member_file = archive.extractfile(member)
    if member_file is None:
        fail(f"{archive_path} {member_name} could not be read")

    try:
        data = json.load(member_file)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        fail(f"{archive_path} {member_name} is not valid JSON: {exc}")
    if not isinstance(data, dict):
        fail(f"{archive_path} {member_name} must be a JSON object")
    return data


def read_optional_json_blob(
    archive: tarfile.TarFile,
    digest: str,
    archive_path: Path,
) -> dict[str, Any] | None:
    """Read an OCI JSON blob when present; return None for missing optional blobs."""
    member_name = blob_path(digest)
    try:
        archive.getmember(member_name)
    except KeyError:
        return None
    return read_json_member(archive, member_name, archive_path)


def flatten_json(value: Any, prefix: str = "") -> dict[str, Any]:
    """Flatten JSON into dot-and-index paths for field-level comparison."""
    if isinstance(value, dict):
        flattened: dict[str, Any] = {}
        for key in sorted(value):
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            flattened.update(flatten_json(value[key], child_prefix))
        return flattened
    if isinstance(value, list):
        flattened = {}
        for index, item in enumerate(value):
            flattened.update(flatten_json(item, f"{prefix}[{index}]"))
        if not value:
            flattened[prefix] = []
        return flattened
    return {prefix: value}


def compare_config_fields(
    first_config: dict[str, Any] | None,
    second_config: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """Return field-level differences between two OCI config JSON objects."""
    first_fields = flatten_json(first_config) if first_config is not None else {}
    second_fields = flatten_json(second_config) if second_config is not None else {}
    diffs: list[dict[str, Any]] = []

    for field in sorted(set(first_fields) | set(second_fields)):
        first_value = first_fields.get(field)
        second_value = second_fields.get(field)
        if first_value != second_value:
            diffs.append({"path": field, "first": first_value, "second": second_value})
    return diffs


def extract_digest_list(items: Any) -> list[str]:
    """Extract sha256 digest strings from an OCI descriptor list."""
    if not isinstance(items, list):
        return []
    digests: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        digest = item.get("digest")
        if isinstance(digest, str) and digest.startswith("sha256:"):
            digests.append(digest)
    return digests


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
    manifest_blob: dict[str, Any] | None = None
    config_blob: dict[str, Any] | None = None
    try:
        with tarfile.open(archive_path, "r") as archive:
            index_data = read_json_member(archive, "index.json", archive_path)

            manifests = index_data.get("manifests")
            if not isinstance(manifests, list) or not manifests:
                fail(
                    f"{archive_path} index.json must contain at least one manifest entry"
                )

            manifest = manifests[0]
            if not isinstance(manifest, dict):
                fail(f"{archive_path} first manifest entry must be an object")
            digest = manifest.get("digest")
            if not isinstance(digest, str) or not digest.startswith("sha256:"):
                fail(f"{archive_path} manifest digest is missing or invalid")

            manifest_blob = read_optional_json_blob(archive, digest, archive_path)
            if manifest_blob is not None:
                config_descriptor = manifest_blob.get("config", {})
                if isinstance(config_descriptor, dict):
                    config_digest_raw = config_descriptor.get("digest")
                    if isinstance(
                        config_digest_raw, str
                    ) and config_digest_raw.startswith("sha256:"):
                        config_blob = read_optional_json_blob(
                            archive, config_digest_raw, archive_path
                        )
    except (tarfile.TarError, OSError) as exc:
        fail(f"Failed to open OCI archive {archive_path}: {exc}")

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
    config_descriptor: dict[str, Any] = {}
    if manifest_blob is not None and isinstance(manifest_blob.get("config"), dict):
        config_descriptor = manifest_blob["config"]
    config_digest_raw = config_descriptor.get("digest", "")
    config_digest = (
        config_digest_raw
        if isinstance(config_digest_raw, str)
        and config_digest_raw.startswith("sha256:")
        else ""
    )
    layer_digests = extract_digest_list(
        manifest_blob.get("layers") if manifest_blob else []
    )

    return {
        "manifest_digest": digest,
        "platform": platform_name,
        "ref_name": ref_name,
        "config_digest": config_digest,
        "layer_count": len(layer_digests),
        "layer_digests": layer_digests,
        "config_json": config_blob,
    }


def build_comparison(
    first_info: dict[str, Any], second_info: dict[str, Any]
) -> dict[str, Any]:
    """Build a structured comparison for two extracted OCI image descriptions."""
    first_layers = first_info.get("layer_digests", [])
    second_layers = second_info.get("layer_digests", [])
    layer_diffs = []

    for index in range(max(len(first_layers), len(second_layers))):
        first_digest = first_layers[index] if index < len(first_layers) else None
        second_digest = second_layers[index] if index < len(second_layers) else None
        if first_digest != second_digest:
            layer_diffs.append(
                {"index": index, "first": first_digest, "second": second_digest}
            )

    return {
        "manifest_digest_match": first_info["manifest_digest"]
        == second_info["manifest_digest"],
        "config_digest_match": first_info.get("config_digest")
        == second_info.get("config_digest"),
        "layer_count_match": first_info.get("layer_count")
        == second_info.get("layer_count"),
        "layer_digests_match": first_layers == second_layers,
        "layer_diffs": layer_diffs,
        "config_field_diffs": compare_config_fields(
            first_info.get("config_json"),
            second_info.get("config_json"),
        ),
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
    status = (
        "pass"
        if first_info["manifest_digest"] == second_info["manifest_digest"]
        else "mismatch"
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    comparison = build_comparison(first_info, second_info)

    report = {
        "schema_version": "1.1",
        "image_name": image_name,
        "status": status,
        "comparison_basis": "oci_manifest_digest",
        "comparison": comparison,
        "runs": [
            {
                "name": "first",
                "archive": str(first_path),
                "archive_sha256": file_sha256(first_path),
                "manifest_digest": first_info["manifest_digest"],
                "config_digest": first_info.get("config_digest", ""),
                "layer_count": first_info.get("layer_count", 0),
                "layer_digests": first_info.get("layer_digests", []),
                "platform": first_info["platform"],
                "ref_name": first_info["ref_name"],
            },
            {
                "name": "second",
                "archive": str(second_path),
                "archive_sha256": file_sha256(second_path),
                "manifest_digest": second_info["manifest_digest"],
                "config_digest": second_info.get("config_digest", ""),
                "layer_count": second_info.get("layer_count", 0),
                "layer_digests": second_info.get("layer_digests", []),
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
        f"- First config digest: `{first_info.get('config_digest') or 'unavailable'}`",
        f"- Second config digest: `{second_info.get('config_digest') or 'unavailable'}`",
        f"- First layer count: `{first_info.get('layer_count', 0)}`",
        f"- Second layer count: `{second_info.get('layer_count', 0)}`",
        f"- First platform: `{first_info['platform']}`",
        f"- Second platform: `{second_info['platform']}`",
        "",
        "Detailed comparison:",
        f"- Config digest match: `{comparison['config_digest_match']}`",
        f"- Layer count match: `{comparison['layer_count_match']}`",
        f"- Layer digests match: `{comparison['layer_digests_match']}`",
        f"- Layer digest differences: `{len(comparison['layer_diffs'])}`",
        f"- Config JSON field differences: `{len(comparison['config_field_diffs'])}`",
    ]
    if comparison["layer_diffs"]:
        summary_lines.extend(["", "Layer digest differences:"])
        for diff in comparison["layer_diffs"]:
            summary_lines.append(
                f"- Layer `{diff['index']}`: first `{diff['first']}`, second `{diff['second']}`"
            )
    if comparison["config_field_diffs"]:
        summary_lines.extend(["", "Config JSON field differences:"])
        for diff in comparison["config_field_diffs"][:MAX_SUMMARY_FIELD_DIFFS]:
            summary_lines.append(
                f"- `{diff['path']}`: first `{diff['first']}`, second `{diff['second']}`"
            )
        remaining = len(comparison["config_field_diffs"]) - MAX_SUMMARY_FIELD_DIFFS
        if remaining > 0:
            summary_lines.append(
                f"- ...and `{remaining}` more field differences in `report.json`"
            )

    summary_lines.extend(
        [
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
    )
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
