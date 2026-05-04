# Backend Reproducibility Pilot

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-30)

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
   - `VCS_REF=<release sha>`
   - `VERSION=<release tag>`
   - `SOURCE=https://github.com/<repo>`
4. disables provenance and SBOM emission for the pilot build itself so the comparison focuses on the image output
5. generates `report.json` and `summary.md` using `scripts/report-reproducibility-pilot.py --allow-mismatch`
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
- do not relax existing signing, provenance, scanning, or admission controls as part of rollback

## Evidence Path

Expected artifact:

- `reproducibility-pilot-backend/report.json`
- `reproducibility-pilot-backend/summary.md`

Interpretation:

- `pass` means the backend image was reproducible for the normalized pilot inputs used in that run
- `mismatch` means the backend image is not yet reproducible under the pilot conditions and requires investigation before it can be used as stronger SLSA evidence
