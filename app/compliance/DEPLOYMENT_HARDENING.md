# Deployment Hardening (Phase 3)

## Environment Separation

- Dev, Staging, Production must use separate databases and secrets.
- Use distinct Compose env files or orchestration config per environment.
- Do not reuse refresh tokens or admin credentials across environments.

## Immutable Builds

- Build images with pinned digests and deploy via `docker-compose.release.yml`.
- Use `app/scripts/build-release-images.sh` to add OCI labels (created, revision, version, source).

## SBOM & Signing

- Generate SBOMs during build (requires `syft`).
- Sign images (requires `cosign`) when publishing to registry.

## Deployment Checklist

- Images are digest-pinned in production.
- SBOM artifacts stored in `app/artifacts/sbom` or external registry.
- Release notes include build metadata and Git revision.
- Rollback plan verified.

