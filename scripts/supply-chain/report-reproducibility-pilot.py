#!/usr/bin/env python3
"""Generate a report for a two-run OCI reproducibility pilot."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import tarfile
from pathlib import Path
from typing import Any

MAX_SUMMARY_FIELD_DIFFS = 20
MAX_SUMMARY_LAYER_FILE_DIFFS = 30


def fail(message: str) -> None:
    """
    Terminate execution after reporting an error to standard error.

    Prints the provided message to stderr prefixed with "::error::" and exits the process with status code 1.

    Parameters:
        message (str): The error text to report (will be prefixed with "::error::" when printed).

    Raises:
        SystemExit: Exits with status code 1.
    """
    print(f"::error::{message}", file=sys.stderr)
    raise SystemExit(1)


def file_sha256(path: Path) -> str:
    """
    Compute the SHA-256 hex digest of a file.

    Parameters:
        path (Path): Path to the file to hash.

    Returns:
        hex_digest (str): Lowercase hexadecimal SHA-256 digest of the file contents.
    """
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def blob_path(digest: str) -> str:
    """
    Produce the OCI tar member path corresponding to a `sha256:` blob digest.

    Parameters:
        digest (str): OCI blob digest in the form `sha256:<hex>`.

    Returns:
        str: The tar member path `blobs/sha256/<hex>` for the given digest.

    Raises:
        SystemExit: If `digest` does not start with `sha256:`.
    """
    if not digest.startswith("sha256:"):
        fail(f"Unsupported OCI blob digest: {digest}")
    return f"blobs/sha256/{digest.removeprefix('sha256:')}"


def read_json_member(
    archive: tarfile.TarFile, member_name: str, archive_path: Path
) -> dict[str, Any]:
    """
    Load a specific member from a tar archive and parse it as a JSON object.

    Parameters:
        archive (tarfile.TarFile): Open tar archive to read the member from.
        member_name (str): Member path inside the tar to extract (e.g. "index.json" or a blob path).
        archive_path (Path): Filesystem path used in diagnostic messages.

    Returns:
        dict[str, Any]: The parsed JSON object.

    Raises:
        SystemExit: The helper `fail(...)` is called (exiting with status 1) if the member is missing, cannot be read, contains invalid JSON, or the parsed value is not a JSON object.
    """
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
    """
    Locate and parse the OCI JSON blob identified by `digest` in the given tar archive if it exists.

    Parameters:
        archive (tarfile.TarFile): Open tar archive to read from.
        digest (str): OCI digest string identifying the blob (e.g. "sha256:<hex>").
        archive_path (Path): Path to the archive (used for diagnostic messages).

    Returns:
        dict[str, Any] | None: Parsed JSON object as a dictionary if the blob member exists and contains valid JSON, otherwise `None`.
    """
    member_name = blob_path(digest)
    try:
        archive.getmember(member_name)
    except KeyError:
        return None
    return read_json_member(archive, member_name, archive_path)


def read_optional_blob_bytes(
    archive: tarfile.TarFile,
    digest: str,
) -> bytes | None:
    """
    Return the raw bytes of an OCI blob contained in the given tar archive, or `None` if the blob member is absent.

    Parameters:
        archive (tarfile.TarFile): Open tar archive to read from.
        digest (str): OCI blob digest string (e.g. starting with `sha256:`).

    Returns:
        bytes | None: The blob contents as bytes when present, otherwise `None`.
    """
    member_name = blob_path(digest)
    try:
        member = archive.getmember(member_name)
    except KeyError:
        return None

    member_file = archive.extractfile(member)
    if member_file is None:
        return None
    return member_file.read()


def format_mode(mode: int) -> str:
    """
     Format a filesystem mode into a stable four-digit octal string.

    Parameters:
        mode (int): Filesystem permission bits to format.

     Returns:
        octal_mode (str): Four-character octal representation of the mode (e.g., "0755").
    """
    return f"{mode & 0o7777:04o}"


def file_sha256_from_handle(handle: Any) -> str:
    """
    Compute the SHA-256 hex digest of data remaining in a readable file-like object.

    Parameters:
        handle (Any): A readable file-like object (binary mode) whose remaining bytes will be read; the object's read position is advanced to EOF.

    Returns:
        sha256_hex (str): Lowercase hexadecimal SHA-256 digest of the data read from the handle.
    """
    digest = hashlib.sha256()
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
        digest.update(chunk)
    return digest.hexdigest()


def tar_member_type(member: tarfile.TarInfo) -> str:
    """
    Produce a compact, stable type label for a tar member.

    @returns One of: 'file', 'directory', 'symlink', 'hardlink', 'char', 'block', 'fifo', or 'other'.
    """
    if member.isfile():
        return "file"
    if member.isdir():
        return "directory"
    if member.issym():
        return "symlink"
    if member.islnk():
        return "hardlink"
    if member.ischr():
        return "char"
    if member.isblk():
        return "block"
    if member.isfifo():
        return "fifo"
    return "other"


def extract_layer_entries(layer_bytes: bytes, digest: str) -> dict[str, dict[str, Any]]:
    """
    Produce a mapping of tar member paths to comparable metadata extracted from an OCI layer blob.

    The blob may be compressed or uncompressed; tarfile auto-detects compression. Regular file members include a content SHA-256 digest; non-regular members record metadata only. If the blob cannot be read as a tar archive, returns a single-entry dict with key "__layer_error__" containing an error record (which includes the provided `digest` for context).

    Parameters:
        layer_bytes (bytes): Raw bytes of the layer blob.
        digest (str): Layer digest (used only for error reporting).

    Returns:
        dict[str, dict[str, Any]]: Mapping from tar member path to a metadata dictionary with keys:
            - "type": compact member type label (e.g., "file", "directory", "symlink", ...).
            - "mode": four-digit octal mode string.
            - "size": member size in bytes.
            - "mtime": modification time.
            - "uid": owner user id.
            - "gid": owner group id.
            - "linkname": link target for symlinks/hardlinks (empty string when not applicable).
            - "sha256": for regular files, hex SHA-256 of file content; empty string if the file could not be extracted; `None` for non-regular members.
        If tar reading fails, returns a dict with a single "__layer_error__" entry describing the failure.
    """
    entries: dict[str, dict[str, Any]] = {}
    try:
        with tarfile.open(fileobj=io.BytesIO(layer_bytes), mode="r:*") as layer:
            for member in layer:
                entry: dict[str, Any] = {
                    "type": tar_member_type(member),
                    "mode": format_mode(member.mode),
                    "size": member.size,
                    "mtime": member.mtime,
                    "uid": member.uid,
                    "gid": member.gid,
                    "linkname": member.linkname,
                    "sha256": None,
                }
                if member.isfile():
                    member_file = layer.extractfile(member)
                    if member_file is None:
                        entry["sha256"] = ""
                    else:
                        entry["sha256"] = file_sha256_from_handle(member_file)
                entries[member.name] = entry
    except tarfile.TarError as exc:
        return {
            "__layer_error__": {
                "type": "error",
                "mode": None,
                "size": None,
                "mtime": None,
                "uid": None,
                "gid": None,
                "linkname": "",
                "sha256": None,
                "error": f"Could not read layer {digest} as tar: {exc}",
            }
        }
    return entries


def flatten_json(value: Any, prefix: str = "") -> dict[str, Any]:
    """
    Flatten a JSON-like value into a mapping from leaf paths to their values.

    Paths use dot notation for object keys (e.g., `foo.bar`) and index notation for list elements (e.g., `items[0]`). Empty lists are recorded as the list value at their path. Object keys are processed in sorted order to produce a stable output.

    Parameters:
        value: The JSON value to flatten (dict, list, or scalar).
        prefix: Optional starting path prefix that will be prepended to produced paths.

    Returns:
        dict[str, Any]: A mapping from path strings to leaf values.
    """
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
    """
    Compare two OCI image config JSON objects and produce per-field differences.

    Parameters:
        first_config (dict[str, Any] | None): First config JSON object, or None if absent.
        second_config (dict[str, Any] | None): Second config JSON object, or None if absent.

    Returns:
        diffs (list[dict[str, Any]]): List of difference records sorted by field path. Each record contains:
                - "path": dot-and-index path to the differing field
                - "first": value from the first config (or None if missing)
                - "second": value from the second config (or None if missing)
    """
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
    """
    Extract `sha256:` digest strings from an OCI descriptor list.

    Parameters:
        items (Any): A value expected to be a list of descriptor objects; non-list inputs are treated as absent.

    Returns:
        list[str]: Digest strings (e.g. `"sha256:<hex>"`) found in the input list, in iteration order. Non-dictionary elements and descriptors without a `sha256:` `digest` field are ignored.
    """
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
    Extract metadata from the first manifest entry in an OCI image archive's index.json.

    Reads the archive at archive_path, loads the first manifest listed in index.json, and (when available) loads the referenced manifest and config JSON blobs to collect manifest/config digests, layer digests, platform, reference name, and the parsed config JSON.

    Notes:
    - Calls fail(...) (which exits the program) if the archive cannot be opened, if index.json is missing or unreadable, if `manifests` is not a non-empty list, or if the first manifest's digest is missing or not a `sha256:` string.

    Returns:
        info (dict[str, Any]): Dictionary containing:
            - manifest_digest (str): The first manifest's `sha256:` digest.
            - platform (str): Formatted as `os/architecture` when available, otherwise `"unknown"`.
            - ref_name (str): The `org.opencontainers.image.ref.name` annotation value, or `""` if absent.
            - config_digest (str): The config blob `sha256:` digest when present, otherwise `""`.
            - layer_count (int): Number of layer digests found in the manifest blob.
            - layer_digests (list[str]): Ordered list of layer `sha256:` digests (may be empty).
            - config_json (dict[str, Any] | None): Parsed config JSON blob if present, otherwise `None`.
    """
    manifest_blob: dict[str, Any] | None = None
    config_blob: dict[str, Any] | None = None
    layer_entries: dict[str, dict[str, dict[str, Any]]] = {}
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
                for layer_digest in extract_digest_list(manifest_blob.get("layers")):
                    layer_bytes = read_optional_blob_bytes(archive, layer_digest)
                    if layer_bytes is not None:
                        layer_entries[layer_digest] = extract_layer_entries(
                            layer_bytes, layer_digest
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
        "layer_entries": layer_entries,
        "config_json": config_blob,
    }


def compare_layer_entries(
    first_entries: dict[str, dict[str, Any]] | None,
    second_entries: dict[str, dict[str, Any]] | None,
) -> dict[str, Any]:
    """
    Compute per-path differences between two layer entry maps.

    If either input is None, the function reports the layer as unavailable.

    Parameters:
        first_entries (dict[str, dict[str, Any]] | None): Mapping of member path -> metadata for the first layer, or None if the layer blob is missing.
        second_entries (dict[str, dict[str, Any]] | None): Mapping of member path -> metadata for the second layer, or None if the layer blob is missing.

    Returns:
        result (dict[str, Any]): Comparison result with the following keys:
            - available (bool): `False` when a layer blob is missing on one or both sides, otherwise `True`.
            - reason (str): Present only when `available` is `False`; explains why comparison could not be performed.
            - diff_count (int): Number of differing paths (present only when `available` is `True`).
            - diffs (list[dict[str, Any]]): List of per-path diff records. Each record contains:
                - path (str): The member path within the layer.
                - status (str): One of `"added"`, `"removed"`, or `"changed"`.
                - first (dict[str, Any] | None): Entry metadata from the first layer or `None` if absent.
                - second (dict[str, Any] | None): Entry metadata from the second layer or `None` if absent.
    """
    if first_entries is None or second_entries is None:
        return {
            "available": False,
            "diffs": [],
            "reason": "layer blob missing from one or both OCI archives",
        }

    diffs: list[dict[str, Any]] = []
    for path in sorted(set(first_entries) | set(second_entries)):
        first_entry = first_entries.get(path)
        second_entry = second_entries.get(path)
        if first_entry is None:
            diffs.append(
                {"path": path, "status": "added", "first": None, "second": second_entry}
            )
        elif second_entry is None:
            diffs.append(
                {
                    "path": path,
                    "status": "removed",
                    "first": first_entry,
                    "second": None,
                }
            )
        elif first_entry != second_entry:
            diffs.append(
                {
                    "path": path,
                    "status": "changed",
                    "first": first_entry,
                    "second": second_entry,
                }
            )

    return {
        "available": True,
        "diff_count": len(diffs),
        "diffs": diffs,
    }


def build_comparison(
    first_info: dict[str, Any], second_info: dict[str, Any]
) -> dict[str, Any]:
    """
    Compare two extracted OCI image info dictionaries and produce a structured summary of manifest, config, and layer differences.

    Parameters:
        first_info (dict): Extraction result for the first archive. Expected keys include
            `manifest_digest`, `config_digest`, `layer_count`, `layer_digests` (ordered list of digests),
            `layer_entries` (mapping of layer digest to per-member metadata), and `config_json`.
        second_info (dict): Extraction result for the second archive (same expected keys as `first_info`).

    Returns:
        dict: Comparison object with the following keys:
            - `manifest_digest_match` (bool): `true` if the two manifest digests are equal, `false` otherwise.
            - `config_digest_match` (bool): `true` if the two config digests are equal, `false` otherwise.
            - `layer_count_match` (bool): `true` if reported layer counts are equal, `false` otherwise.
            - `layer_digests_match` (bool): `true` if the full ordered lists of layer digests are equal, `false` otherwise.
            - `layer_diffs` (list): Per-index digest mismatch records with keys `index`, `first`, and `second`.
            - `layer_file_diffs` (list): Per-index results from comparing per-layer tar-entry metadata/content; each entry
               includes `index`, `first`, `second`, and the comparison result produced by `compare_layer_entries`.
            - "layer_file_diffs" (list): Per-mismatched-layer file-level diff records with keys
              "index", "first", "second", and the fields produced by `compare_layer_entries`
              ("available", and either "diff_count"/"diffs" or "reason").
            - `config_field_diffs` (list): Field-level differences between flattened config JSON objects.
    """
    first_layers = first_info.get("layer_digests", [])
    second_layers = second_info.get("layer_digests", [])
    first_layer_entries = first_info.get("layer_entries", {})
    second_layer_entries = second_info.get("layer_entries", {})
    layer_diffs = []
    layer_file_diffs = []

    for index in range(max(len(first_layers), len(second_layers))):
        first_digest = first_layers[index] if index < len(first_layers) else None
        second_digest = second_layers[index] if index < len(second_layers) else None
        if first_digest != second_digest:
            layer_diffs.append(
                {"index": index, "first": first_digest, "second": second_digest}
            )
            first_entries = (
                first_layer_entries.get(first_digest)
                if isinstance(first_digest, str)
                else None
            )
            second_entries = (
                second_layer_entries.get(second_digest)
                if isinstance(second_digest, str)
                else None
            )
            layer_file_diffs.append(
                {
                    "index": index,
                    "first": first_digest,
                    "second": second_digest,
                    **compare_layer_entries(first_entries, second_entries),
                }
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
        "layer_file_diffs": layer_file_diffs,
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
        "schema_version": "1.2",
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
        f"- Layer file diff sections: `{len(comparison['layer_file_diffs'])}`",
        f"- Config JSON field differences: `{len(comparison['config_field_diffs'])}`",
    ]
    if comparison["layer_diffs"]:
        summary_lines.extend(["", "Layer digest differences:"])
        for diff in comparison["layer_diffs"]:
            summary_lines.append(
                f"- Layer `{diff['index']}`: first `{diff['first']}`, second `{diff['second']}`"
            )
    if comparison["layer_file_diffs"]:
        summary_lines.extend(["", "Layer file differences:"])
        emitted = 0
        for layer_diff in comparison["layer_file_diffs"]:
            if not layer_diff.get("available"):
                summary_lines.append(
                    f"- Layer `{layer_diff['index']}`: file diff unavailable ({layer_diff.get('reason', 'unknown reason')})"
                )
                continue

            diff_count = layer_diff.get("diff_count", len(layer_diff.get("diffs", [])))
            summary_lines.append(
                f"- Layer `{layer_diff['index']}` file differences: `{diff_count}`"
            )
            for file_diff in layer_diff.get("diffs", []):
                if emitted >= MAX_SUMMARY_LAYER_FILE_DIFFS:
                    break
                summary_lines.append(
                    f"  - `{file_diff['path']}`: `{file_diff['status']}`"
                )
                emitted += 1
            if emitted >= MAX_SUMMARY_LAYER_FILE_DIFFS:
                break
        total_file_diffs = sum(
            layer_diff.get("diff_count", 0)
            for layer_diff in comparison["layer_file_diffs"]
            if layer_diff.get("available")
        )
        remaining = total_file_diffs - emitted
        if remaining > 0:
            summary_lines.append(
                f"- ...and `{remaining}` more layer file differences in `report.json`"
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
