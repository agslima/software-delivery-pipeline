SHELL := /usr/bin/env bash

.DEFAULT_GOAL := help

SNYK_SCRIPT := scripts/security/run-snyk.sh
SNYK_BASELINE := docs/snyk/baseline.json

.PHONY: snyk
snyk: ## Run full Snyk aggregation flow
	@bash $(SNYK_SCRIPT)

.PHONY: snyk-fast
snyk-fast: ## Run SCA + SAST + IaC only
	@RUN_CONTAINER=0 bash $(SNYK_SCRIPT)

.PHONY: snyk-ci
snyk-ci: ## CI-friendly run without README mutation
	@UPDATE_README=0 bash $(SNYK_SCRIPT)

.PHONY: snyk-no-readme
snyk-no-readme: ## Run full scan without rewriting README (Alias for snyk-ci)
	@UPDATE_README=0 bash $(SNYK_SCRIPT)

.PHONY: snyk-html
snyk-html: ## Run full scan and render HTML reports
	@WRITE_HTML=1 bash $(SNYK_SCRIPT)

.PHONY: snyk-baseline-check
snyk-baseline-check: ## Validate docs/snyk/baseline.json
	@python3 - <<'PY'
from pathlib import Path
import json
path = Path("$(SNYK_BASELINE)")
if not path.exists():
    raise SystemExit(f"Missing baseline file: {path}")
json.loads(path.read_text(encoding="utf-8"))
print(f"Baseline OK: {path}")
PY

# Trivy local scan
.PHONY: trivy-scan
trivy-scan: ## Generate local Trivy security report
	./scripts/trivy-scan.sh

# Governance Drift Check (docs/workflow refs)
.PHONY: governance-drift-check
governance-drift-check: ## Check for governance documentation drift
	./scripts/check-governance-drift.sh

# Governance Metadata Freshness Check
.PHONY: governance-metadata-check
governance-metadata-check: ## Verify freshness of governance metadata
	./scripts/check-governance-metadata-freshness.sh

# Weekly DAST orchestration
.PHONY: dast-weekly
dast-weekly: ## Run weekly DAST orchestration scan
	KEEP_DAST_ENV=1 DAST_ENV_FILE=app/.env ./scripts/run-local-zap-full-scan.sh

.PHONY: dast-weekly-local
dast-weekly-local: ## Run local DAST ZAP scan
	./scripts/run-local-zap-full-scan.sh

.PHONY: help
help: ## Show available targets
	@awk 'BEGIN {FS = ":.*## "}; /^[a-zA-Z0-9_.-]+:.*## / {printf "\033[36m%-26s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
