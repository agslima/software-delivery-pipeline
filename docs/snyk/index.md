# Snyk Scans

This directory contains the raw and rendered outputs for the current repository security posture.

## Aggregate Summary

| Severity | Count |
| :--- | ---: |
| Critical | 0 |
| High | 1 |
| Medium | 2 |
| Low | 2 |

## Scan Artifacts

### SCA (Dependencies)

| Target | JSON | HTML |
| :--- | :--- | :--- |
| repository dependency scan | [snyk-sca.json](raw/snyk-sca.json) | [snyk-sca.html](html/snyk-sca.html) |

### SAST

| Target | JSON | HTML |
| :--- | :--- | :--- |
| repository code scan | [snyk-code.json](raw/snyk-code.json) | [snyk-code.html](html/snyk-code.html) |

### Containers

| Target | JSON | HTML |
| :--- | :--- | :--- |
| file-server-client:snyk | [snyk-container-client.json](raw/snyk-container-client.json) | [snyk-container-client.html](html/snyk-container-client.html) |
| file-server-server:snyk | [snyk-container-server.json](raw/snyk-container-server.json) | [snyk-container-server.html](html/snyk-container-server.html) |

### IaC

| Target | JSON | HTML |
| :--- | :--- | :--- |
| k8s/ | [snyk-iac.json](raw/snyk-iac.json) | [snyk-iac.html](html/snyk-iac.html) |

## Notes

- Counts are aggregated across SCA, SAST, container, and IaC scans.
- Container findings come from real built local images, not Dockerfile-only analysis.
- Generated at: 2026-03-09 16:34 UTC
