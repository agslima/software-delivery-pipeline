from __future__ import annotations

import importlib.util
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import tarfile

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "scripts" / "supply-chain"


def load_module(name: str, path: pathlib.Path):
    """
    Load a Python module from a filesystem path and register it in sys.modules.

    Parameters:
        name (str): Import name to assign to the loaded module in sys.modules.
        path (pathlib.Path): Filesystem path to the source file to load.

    Returns:
        module: The loaded module object.

    Raises:
        AssertionError: If a module spec or loader cannot be created for the given path.
    """
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


reproducibility_pilot = load_module(
    "report_reproducibility_pilot",
    SCRIPTS_DIR / "report-reproducibility-pilot.py",
)


def digest_json(data: dict) -> str:
    """
    Compute a deterministic SHA-256 digest for a JSON-serializable dictionary.

    The dictionary is serialized to canonical JSON with keys sorted and compact separators, encoded as UTF-8, and hashed.

    Parameters:
        data (dict): JSON-serializable mapping to be hashed.

    Returns:
        str: Digest string in the form "sha256:<hexdigest>".
    """
    encoded = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def add_bytes(archive: tarfile.TarFile, name: str, data: bytes) -> None:
    """
    Add an in-memory file entry to a tar archive from the given bytes.

    Parameters:
        archive (tarfile.TarFile): Tar archive to write into.
        name (str): Path of the file inside the archive.
        data (bytes): File contents to store.
    """
    info = tarfile.TarInfo(name)
    info.size = len(data)
    archive.addfile(info, io.BytesIO(data))


def make_layer(entries: list[dict]) -> tuple[str, bytes]:
    """
    Create an in-memory tar "layer" from a list of filesystem entry definitions and return its digest and raw bytes.

    Each entry in `entries` is a dict that must include:
    - `path` (str): path inside the tar.
    - `type` (optional, str): `"symlink"`, `"directory"`, or omitted/other for a regular file.
    Optional keys:
    - `data` (bytes): file contents for regular files (default: b"").
    - `mode` (int): permission bits (default: 0o644).
    - `mtime` (int): modification time (default: 0).
    - `uid` (int), `gid` (int): owner ids (default: 0).
    - `linkname` (str): symlink target (default: "").

    @returns
    A tuple (digest, bytes) where `digest` is the SHA-256 of the produced tar prefixed with `"sha256:"`, and `bytes` is the raw tar archive data.
    """
    layer_io = io.BytesIO()
    with tarfile.open(fileobj=layer_io, mode="w") as layer:
        for entry in entries:
            info = tarfile.TarInfo(entry["path"])
            info.mode = entry.get("mode", 0o644)
            info.mtime = entry.get("mtime", 0)
            info.uid = entry.get("uid", 0)
            info.gid = entry.get("gid", 0)
            info.linkname = entry.get("linkname", "")
            if entry.get("type") == "symlink":
                info.type = tarfile.SYMTYPE
                info.size = 0
                layer.addfile(info)
            elif entry.get("type") == "directory":
                info.type = tarfile.DIRTYPE
                info.size = 0
                layer.addfile(info)
            else:
                data = entry.get("data", b"")
                info.size = len(data)
                layer.addfile(info, io.BytesIO(data))
    layer_bytes = layer_io.getvalue()
    return "sha256:" + hashlib.sha256(layer_bytes).hexdigest(), layer_bytes


def write_oci_archive(
    path: pathlib.Path,
    manifest_digest: str,
    ref_name: str = "test",
    config_json: dict | None = None,
    layer_digests: list[str] | None = None,
    layer_blobs: dict[str, bytes] | None = None,
) -> None:
    """
    Create a tar archive at `path` containing a minimal OCI image layout with a single `index.json` and corresponding blobs.

    Parameters:
        path (pathlib.Path): Filesystem path where the tar archive will be written.
        manifest_digest (str): Digest to record for the manifest entry (e.g. "sha256:<hexdigest>").
        ref_name (str): Value for the `org.opencontainers.image.ref.name` annotation in the manifest.
        config_json (dict | None): JSON object to use as the image config blob; when None a default config is used.
        layer_digests (list[str] | None): List of layer digest strings to include in the manifest's `layers`; when None a single dummy digest is used.
        layer_blobs (dict[str, bytes] | None): Optional mapping of layer digest -> raw blob bytes to include under `blobs/sha256/<digest>` in the archive.
    """
    config_json = config_json or {
        "architecture": "amd64",
        "os": "linux",
        "created": "1970-01-01T00:00:00Z",
        "config": {
            "Env": ["NODE_ENV=production"],
            "Labels": {"org.opencontainers.image.version": "v1.0.0"},
        },
        "rootfs": {"type": "layers", "diff_ids": []},
    }
    layer_digests = layer_digests or ["sha256:" + "1" * 64]
    layer_blobs = layer_blobs or {}
    config_digest = digest_json(config_json)
    config_encoded = json.dumps(
        config_json, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    config_digest = "sha256:" + hashlib.sha256(config_encoded).hexdigest()
    manifest_blob = {
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.manifest.v1+json",
        "config": {
            "mediaType": "application/vnd.oci.image.config.v1+json",
            "digest": config_digest,
            "size": len(config_encoded),
        },
        "layers": [
            {
                "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
                "digest": digest,
                "size": 0,
            }
            for digest in layer_digests
        ],
    }
    index = {
        "schemaVersion": 2,
        "manifests": [
            {
                "mediaType": "application/vnd.oci.image.manifest.v1+json",
                "digest": manifest_digest,
                "size": 123,
                "platform": {"os": "linux", "architecture": "amd64"},
                "annotations": {"org.opencontainers.image.ref.name": ref_name},
            }
        ],
    }
    index_encoded = json.dumps(index).encode("utf-8")
    manifest_encoded = json.dumps(
        manifest_blob, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    config_encoded = json.dumps(
        config_json, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    with tarfile.open(path, "w") as archive:
        add_bytes(archive, "index.json", index_encoded)
        add_bytes(
            archive,
            f"blobs/sha256/{manifest_digest.removeprefix('sha256:')}",
            manifest_encoded,
        )
        add_bytes(
            archive,
            f"blobs/sha256/{config_digest.removeprefix('sha256:')}",
            config_encoded,
        )
        for digest, blob in layer_blobs.items():
            add_bytes(archive, f"blobs/sha256/{digest.removeprefix('sha256:')}", blob)


def test_extract_manifest_info_reads_digest_and_platform(tmp_path: pathlib.Path):
    archive = tmp_path / "image.tar"
    write_oci_archive(archive, "sha256:" + "a" * 64, ref_name="backend")

    info = reproducibility_pilot.extract_manifest_info(archive)

    assert info["manifest_digest"] == "sha256:" + "a" * 64
    assert info["platform"] == "linux/amd64"
    assert info["ref_name"] == "backend"
    assert info["config_digest"].startswith("sha256:")
    assert info["layer_count"] == 1
    assert info["layer_digests"] == ["sha256:" + "1" * 64]
    assert info["config_json"]["config"]["Env"] == ["NODE_ENV=production"]


def test_write_report_marks_matching_digests_as_pass(tmp_path: pathlib.Path):
    first = tmp_path / "first.tar"
    second = tmp_path / "second.tar"
    write_oci_archive(first, "sha256:" + "b" * 64)
    write_oci_archive(second, "sha256:" + "b" * 64)

    report_path, summary_path, status = reproducibility_pilot.write_report(
        tmp_path / "out",
        "backend",
        first,
        second,
        reproducibility_pilot.extract_manifest_info(first),
        reproducibility_pilot.extract_manifest_info(second),
    )

    report = json.loads(report_path.read_text(encoding="utf-8"))
    summary = summary_path.read_text(encoding="utf-8")
    assert status == "pass"
    assert report["schema_version"] == "1.2"
    assert report["status"] == "pass"
    assert report["comparison"]["config_digest_match"] is True
    assert report["comparison"]["layer_digests_match"] is True
    assert "same manifest digest" in summary


def test_write_report_marks_different_digests_as_mismatch_with_deep_diff(
    tmp_path: pathlib.Path,
):
    first = tmp_path / "first.tar"
    second = tmp_path / "second.tar"
    write_oci_archive(
        first,
        "sha256:" + "c" * 64,
        config_json={
            "architecture": "amd64",
            "os": "linux",
            "created": "1970-01-01T00:00:00Z",
            "config": {"Labels": {"org.opencontainers.image.version": "v1.0.0"}},
        },
        layer_digests=["sha256:" + "1" * 64, "sha256:" + "2" * 64],
    )
    write_oci_archive(
        second,
        "sha256:" + "d" * 64,
        config_json={
            "architecture": "amd64",
            "os": "linux",
            "created": "1970-01-01T00:00:01Z",
            "config": {"Labels": {"org.opencontainers.image.version": "v1.0.1"}},
        },
        layer_digests=["sha256:" + "1" * 64, "sha256:" + "3" * 64],
    )

    report_path, summary_path, status = reproducibility_pilot.write_report(
        tmp_path / "out",
        "backend",
        first,
        second,
        reproducibility_pilot.extract_manifest_info(first),
        reproducibility_pilot.extract_manifest_info(second),
    )

    report = json.loads(report_path.read_text(encoding="utf-8"))
    comparison = report["comparison"]
    assert status == "mismatch"
    assert comparison["config_digest_match"] is False
    assert comparison["layer_count_match"] is True
    assert comparison["layer_digests_match"] is False
    assert comparison["layer_diffs"] == [
        {"index": 1, "first": "sha256:" + "2" * 64, "second": "sha256:" + "3" * 64}
    ]
    assert comparison["layer_file_diffs"] == [
        {
            "index": 1,
            "first": "sha256:" + "2" * 64,
            "second": "sha256:" + "3" * 64,
            "available": False,
            "diffs": [],
            "reason": "layer blob missing from one or both OCI archives",
        }
    ]
    assert {
        "path": "config.Labels.org.opencontainers.image.version",
        "first": "v1.0.0",
        "second": "v1.0.1",
    } in comparison["config_field_diffs"]
    summary = summary_path.read_text(encoding="utf-8")
    assert "different manifest digests" in summary
    assert "Layer digest differences" in summary
    assert "Config JSON field differences" in summary


def test_write_report_includes_file_level_diffs_for_changed_layer_blobs(
    tmp_path: pathlib.Path,
):
    first_layer_digest, first_layer = make_layer(
        [
            {
                "path": "app/file.txt",
                "data": b"first",
                "mode": 0o644,
                "mtime": 1,
                "uid": 1000,
                "gid": 1000,
            },
            {
                "path": "app/link",
                "type": "symlink",
                "linkname": "file.txt",
                "mode": 0o777,
                "mtime": 1,
                "uid": 1000,
                "gid": 1000,
            },
            {"path": "app/removed.txt", "data": b"removed"},
        ]
    )
    second_layer_digest, second_layer = make_layer(
        [
            {
                "path": "app/file.txt",
                "data": b"second",
                "mode": 0o600,
                "mtime": 2,
                "uid": 1001,
                "gid": 1002,
            },
            {
                "path": "app/link",
                "type": "symlink",
                "linkname": "other.txt",
                "mode": 0o777,
                "mtime": 2,
                "uid": 1000,
                "gid": 1000,
            },
            {"path": "app/added.txt", "data": b"added"},
        ]
    )
    first = tmp_path / "first.tar"
    second = tmp_path / "second.tar"
    write_oci_archive(
        first,
        "sha256:" + "e" * 64,
        layer_digests=[first_layer_digest],
        layer_blobs={first_layer_digest: first_layer},
    )
    write_oci_archive(
        second,
        "sha256:" + "f" * 64,
        layer_digests=[second_layer_digest],
        layer_blobs={second_layer_digest: second_layer},
    )

    report_path, summary_path, status = reproducibility_pilot.write_report(
        tmp_path / "out",
        "backend",
        first,
        second,
        reproducibility_pilot.extract_manifest_info(first),
        reproducibility_pilot.extract_manifest_info(second),
    )

    report = json.loads(report_path.read_text(encoding="utf-8"))
    layer_file_diff = report["comparison"]["layer_file_diffs"][0]
    diffs_by_path = {diff["path"]: diff for diff in layer_file_diff["diffs"]}

    assert status == "mismatch"
    assert layer_file_diff["available"] is True
    assert layer_file_diff["diff_count"] == 4
    assert diffs_by_path["app/added.txt"]["status"] == "added"
    assert diffs_by_path["app/removed.txt"]["status"] == "removed"
    changed_file = diffs_by_path["app/file.txt"]
    assert changed_file["status"] == "changed"
    assert changed_file["first"]["mode"] == "0644"
    assert changed_file["second"]["mode"] == "0600"
    assert changed_file["first"]["size"] == 5
    assert changed_file["second"]["size"] == 6
    assert changed_file["first"]["mtime"] == 1
    assert changed_file["second"]["mtime"] == 2
    assert changed_file["first"]["uid"] == 1000
    assert changed_file["second"]["uid"] == 1001
    assert changed_file["first"]["gid"] == 1000
    assert changed_file["second"]["gid"] == 1002
    assert changed_file["first"]["sha256"] == hashlib.sha256(b"first").hexdigest()
    assert changed_file["second"]["sha256"] == hashlib.sha256(b"second").hexdigest()
    changed_link = diffs_by_path["app/link"]
    assert changed_link["first"]["linkname"] == "file.txt"
    assert changed_link["second"]["linkname"] == "other.txt"
    assert "Layer file differences" in summary_path.read_text(encoding="utf-8")


def test_cli_exits_nonzero_for_mismatch_by_default(tmp_path: pathlib.Path):
    first = tmp_path / "first.tar"
    second = tmp_path / "second.tar"
    write_oci_archive(first, "sha256:" + "c" * 64)
    write_oci_archive(second, "sha256:" + "d" * 64)

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "report-reproducibility-pilot.py"),
            "--image-name",
            "backend",
            "--first-archive",
            str(first),
            "--second-archive",
            str(second),
            "--output-dir",
            str(tmp_path / "out"),
        ],
        check=False,
        text=True,
        capture_output=True,
    )

    assert result.returncode == 1
    assert "[reproducibility-pilot] mismatch detected" in result.stdout


def test_cli_allows_mismatch_for_non_blocking_pilot(tmp_path: pathlib.Path):
    first = tmp_path / "first.tar"
    second = tmp_path / "second.tar"
    output_dir = tmp_path / "out"
    write_oci_archive(first, "sha256:" + "c" * 64)
    write_oci_archive(second, "sha256:" + "d" * 64)

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "report-reproducibility-pilot.py"),
            "--image-name",
            "backend",
            "--first-archive",
            str(first),
            "--second-archive",
            str(second),
            "--output-dir",
            str(output_dir),
            "--allow-mismatch",
        ],
        check=False,
        text=True,
        capture_output=True,
    )

    report = json.loads((output_dir / "report.json").read_text(encoding="utf-8"))
    assert result.returncode == 0
    assert report["status"] == "mismatch"
    assert (
        "[reproducibility-pilot] mismatch allowed for non-blocking pilot"
        in result.stdout
    )


def test_extract_manifest_info_rejects_missing_index_json(tmp_path: pathlib.Path):
    archive = tmp_path / "broken.tar"
    with tarfile.open(archive, "w"):
        pass

    with pytest.raises(SystemExit):
        reproducibility_pilot.extract_manifest_info(archive)
