from __future__ import annotations

import importlib.util
import io
import json
import pathlib
import subprocess
import sys
import tarfile

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "scripts"


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


def write_oci_archive(path: pathlib.Path, manifest_digest: str, ref_name: str = "test") -> None:
    """
    Create a tar archive at `path` containing a minimal OCI image layout with a single `index.json` manifest.
    
    Parameters:
        path (pathlib.Path): Filesystem path where the tar archive will be written.
        manifest_digest (str): Digest string to place in the manifest's `digest` field.
        ref_name (str): Value for the `org.opencontainers.image.ref.name` annotation in the manifest (default "test").
    """
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
    encoded = json.dumps(index).encode("utf-8")
    with tarfile.open(path, "w") as archive:
        info = tarfile.TarInfo("index.json")
        info.size = len(encoded)
        archive.addfile(info, io.BytesIO(encoded))


def test_extract_manifest_info_reads_digest_and_platform(tmp_path: pathlib.Path):
    archive = tmp_path / "image.tar"
    write_oci_archive(archive, "sha256:" + "a" * 64, ref_name="backend")

    info = reproducibility_pilot.extract_manifest_info(archive)

    assert info["manifest_digest"] == "sha256:" + "a" * 64
    assert info["platform"] == "linux/amd64"
    assert info["ref_name"] == "backend"


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
    assert report["status"] == "pass"
    assert "same manifest digest" in summary


def test_write_report_marks_different_digests_as_mismatch(tmp_path: pathlib.Path):
    first = tmp_path / "first.tar"
    second = tmp_path / "second.tar"
    write_oci_archive(first, "sha256:" + "c" * 64)
    write_oci_archive(second, "sha256:" + "d" * 64)

    _, summary_path, status = reproducibility_pilot.write_report(
        tmp_path / "out",
        "backend",
        first,
        second,
        reproducibility_pilot.extract_manifest_info(first),
        reproducibility_pilot.extract_manifest_info(second),
    )

    assert status == "mismatch"
    assert "different manifest digests" in summary_path.read_text(encoding="utf-8")


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
    assert "[reproducibility-pilot] mismatch allowed for non-blocking pilot" in result.stdout


def test_extract_manifest_info_rejects_missing_index_json(tmp_path: pathlib.Path):
    archive = tmp_path / "broken.tar"
    with tarfile.open(archive, "w"):
        pass

    with pytest.raises(SystemExit):
        reproducibility_pilot.extract_manifest_info(archive)
