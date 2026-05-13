# Backend Reproducibility Pilot

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-05-13)

This document defines the first reproducibility pilot for the release path.

The pilot is intentionally narrow: it rebuilds the backend release image twice with normalized build metadata and compares the resulting OCI manifest digests.

## Objective

Generate real reproducibility evidence for one release image without blocking production releases while the team learns whether the backend image is currently reproducible under normalized inputs.

## Scope

- Workflow: `.github/workflows/ci-release-gate.yml`
- Job: `reproducibility-pilot-backend`
- Image target: `app-stayhealthy-backend`
- Dockerfile: `app/docker/Dockerfile.server`
- Comparison basis: OCI manifest digest extracted from two locally generated OCI archives

## Pilot Design

The workflow job:

1. checks out the release commit
2. builds the backend image twice with `docker buildx build`
3. normalizes metadata-oriented build args:
   - `BUILD_DATE=1970-01-01T00:00:00Z`
   - `SOURCE_DATE_EPOCH=0`
   - `VCS_REF=<release sha>`
   - `VERSION=<release tag>`
   - `SOURCE=https://github.com/<repo>`
4. disables provenance and SBOM emission for the pilot build itself so the comparison focuses on the image output
5. generates `report.json` and `summary.md` using `scripts/supply-chain/report-reproducibility-pilot.py --allow-mismatch`
6. uploads artifact `reproducibility-pilot-backend`

## Success, Failure, and Rollback Criteria

Success criteria:

- both pilot builds complete successfully
- the two OCI manifest digests match
- the artifact is uploaded with `report.json` and `summary.md`

Failure criteria:

- either build fails
- the OCI manifest digests differ
- the artifact is missing or incomplete

Mismatch handling:

- digest mismatches are recorded as `status: mismatch` in the uploaded report and summary
- mismatch evidence does not fail the release workflow while the job remains a non-blocking pilot
- build failures and missing or malformed OCI archives still fail the pilot job

Rollback path:

- remove the `reproducibility-pilot-backend` job and the reporting script if the pilot creates unacceptable release noise or runner cost

## Evidence Path

Expected artifact:

- `reproducibility-pilot-backend/report.json`
- `reproducibility-pilot-backend/summary.md`

`report.json` includes the top-level OCI manifest comparison plus deeper diagnostics for:

- config digest match or mismatch
- layer count match or mismatch
- per-layer digest differences
- per-file metadata and content differences for changed layer blobs when available
- config JSON field differences

Interpretation:

- `pass` means the backend image was reproducible for the normalized pilot inputs used in that run
- `mismatch` means the backend image is not yet reproducible under the pilot conditions and requires investigation before it can be used as stronger SLSA evidence

## Pilot Evidence Record

### 2026-05-08 release run report

Outcome:

- Status: `mismatch`
- Comparison basis: `oci_manifest_digest`
- Image: `app-stayhealthy-backend`
- Platform: `linux/amd64`
- First manifest digest: `sha256:b85abec6437d4eda4758b7591ba7e98c53955d42850f862a65fa1267aa7455f1`
- Second manifest digest: `sha256:5270e945461e862b7cba30753a485f67333d916b58b67061e664c8288f535683`
- First archive SHA-256: `f55afe6d96d4104a79bde039c143e7b6fcb63d808e68fba54ff0592057ad3798`
- Second archive SHA-256: `2fa751c8d2a6f1dfe88378a24e69c4f42340cf9f3d71fd067794bfc81cbe2061`

Initial investigation focus:

- identify whether the manifest mismatch is caused by image config differences, layer digest differences, or both
- inspect mutable build-time package sources in `app/docker/Dockerfile.server`, especially `apk update`, `apk upgrade`, unpinned `apk add`, and live `npm ci` resolution
- preserve existing release signing, attestation, admission, and policy gates while investigating

Follow-up remediation started:

- `app/docker/Dockerfile.server` no longer runs broad `apk upgrade` during dependency or runtime image builds.
- Runtime installation of `tini` no longer uses `apk add`; it downloads upstream `tini-static-amd64` for `v0.19.0`, verifies SHA-256 `c5b0666b4cb676901f90dfcb37106783c5fe2077b04590973b885950611b30ee`, and normalizes the binary mtime.
- Runtime NPM removal no longer invokes `npm uninstall`; the image removes known global NPM paths directly to avoid logs, update-notifier state, and Node compile-cache churn.
- OS patch uptake should be handled through reviewed updates to the digest-pinned `node:25.9.0-alpine` base image, with scanner evidence and PR review, rather than implicit package upgrades during each application build.
