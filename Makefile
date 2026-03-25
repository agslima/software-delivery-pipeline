SHELL := /bin/bash
.ONESHELL:
.DEFAULT_GOAL := help

ROOT_DIR := $(shell git rev-parse --show-toplevel 2>/dev/null || pwd)

TRIVY_SCRIPT := $(ROOT_DIR)/scripts/security/trivy-scan.sh
SNYK_SCRIPT := $(ROOT_DIR)/scripts/security/run-snyk.sh
DAST_SCRIPT := $(ROOT_DIR)/scripts/security/run-local-zap-full-scan.sh
GOV_DRIFT_SCRIPT := $(ROOT_DIR)/scripts/check-governance-drift.sh
GOV_EVIDENCE_INDEX_SCRIPT := $(ROOT_DIR)/scripts/check-governance-evidence-index.py
GOV_METADATA_SCRIPT := $(ROOT_DIR)/scripts/check-governance-metadata-freshness.sh
GOV_MARKDOWN_ASSERT := $(ROOT_DIR)/scripts/markdown_assert.py
DOCS_METADATA_ASSERT := $(ROOT_DIR)/scripts/check-docs-metadata.py

export RUN_SCA ?= 1
export RUN_SAST ?= 1
export RUN_CONTAINER ?= 1
export RUN_IAC ?= 1
export WRITE_HTML ?= 1
export UPDATE_README ?= 1

export SNYK_ORG ?= a.agnaldosilva
export CLIENT_IMAGE_TAG ?= file-server-client:snyk
export SERVER_IMAGE_TAG ?= file-server-server:snyk

.PHONY: help
help: ## Show available targets
	@awk 'BEGIN {FS = ":.*## "; print "Available targets:\n"} /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-28s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: guard-snyk
guard-snyk:
	@test -f "$(ROOT_DIR)/docs/snyk/baseline.json" || { echo "Missing docs/snyk/baseline.json"; exit 1; }
	@test -f "$(SNYK_SCRIPT)" || { echo "Missing $(SNYK_SCRIPT)"; exit 1; }
	@test -x "$(SNYK_SCRIPT)" || chmod +x "$(SNYK_SCRIPT)"

.PHONY: guard-trivy
guard-trivy:
	@test -f "$(TRIVY_SCRIPT)" || { echo "Missing $(TRIVY_SCRIPT)"; exit 1; }
	@test -x "$(TRIVY_SCRIPT)" || chmod +x "$(TRIVY_SCRIPT)"

.PHONY: guard-governance
guard-governance:
	@test -f "$(GOV_DRIFT_SCRIPT)" || { echo "Missing $(GOV_DRIFT_SCRIPT)"; exit 1; }
	@test -x "$(GOV_DRIFT_SCRIPT)" || chmod +x "$(GOV_DRIFT_SCRIPT)"
	@test -f "$(GOV_EVIDENCE_INDEX_SCRIPT)" || { echo "Missing $(GOV_EVIDENCE_INDEX_SCRIPT)"; exit 1; }
	@test -x "$(GOV_EVIDENCE_INDEX_SCRIPT)" || chmod +x "$(GOV_EVIDENCE_INDEX_SCRIPT)"
	@test -f "$(GOV_METADATA_SCRIPT)" || { echo "Missing $(GOV_METADATA_SCRIPT)"; exit 1; }
	@test -x "$(GOV_METADATA_SCRIPT)" || chmod +x "$(GOV_METADATA_SCRIPT)"
	@test -f "$(GOV_MARKDOWN_ASSERT)" || { echo "Missing $(GOV_MARKDOWN_ASSERT)"; exit 1; }
	@test -f "$(DOCS_METADATA_ASSERT)" || { echo "Missing $(DOCS_METADATA_ASSERT)"; exit 1; }

.PHONY: guard-dast
guard-dast:
	@test -f "$(DAST_SCRIPT)" || { echo "Missing $(DAST_SCRIPT)"; exit 1; }
	@test -x "$(DAST_SCRIPT)" || chmod +x "$(DAST_SCRIPT)"

# -----------------------------------------------------------------------------
# Security: Snyk
# -----------------------------------------------------------------------------

.PHONY: snyk
snyk: guard-snyk ## Run full Snyk aggregation and update README
	"$(SNYK_SCRIPT)"

.PHONY: snyk-no-readme
snyk-no-readme: guard-snyk ## Run full Snyk aggregation without touching README
	UPDATE_README=0 "$(SNYK_SCRIPT)"

.PHONY: snyk-no-html
snyk-no-html: guard-snyk ## Run full Snyk aggregation without HTML reports
	WRITE_HTML=0 "$(SNYK_SCRIPT)"

.PHONY: snyk-sca
snyk-sca: guard-snyk ## Run Snyk SCA only
	RUN_SCA=1 RUN_SAST=0 RUN_CONTAINER=0 RUN_IAC=0 "$(SNYK_SCRIPT)"

.PHONY: snyk-code
snyk-code: guard-snyk ## Run Snyk Code only
	RUN_SCA=0 RUN_SAST=1 RUN_CONTAINER=0 RUN_IAC=0 "$(SNYK_SCRIPT)"

.PHONY: snyk-container
snyk-container: guard-snyk ## Run Snyk container scan only
	RUN_SCA=0 RUN_SAST=0 RUN_CONTAINER=1 RUN_IAC=0 "$(SNYK_SCRIPT)"

.PHONY: snyk-iac
snyk-iac: guard-snyk ## Run Snyk IaC only
	RUN_SCA=0 RUN_SAST=0 RUN_CONTAINER=0 RUN_IAC=1 "$(SNYK_SCRIPT)"

.PHONY: snyk-clean
snyk-clean: ## Remove temporary Snyk working directory
	rm -rf "$(ROOT_DIR)/.tmp/snyk-run"

# -----------------------------------------------------------------------------
# Security: Trivy
# -----------------------------------------------------------------------------

.PHONY: trivy-scan
trivy-scan: guard-trivy ## Generate local Trivy security report
	"$(TRIVY_SCRIPT)"

# -----------------------------------------------------------------------------
# Governance
# -----------------------------------------------------------------------------

.PHONY: governance-checks
governance-checks: governance-drift-check governance-metadata-check ## Run local governance drift and metadata checks

.PHONY: docs-metadata-check
docs-metadata-check: guard-governance ## Check standardized metadata comments in maintained docs pages
	python3 "$(DOCS_METADATA_ASSERT)"

.PHONY: governance-drift-check
governance-drift-check: guard-governance ## Check for governance documentation drift
	"$(GOV_DRIFT_SCRIPT)"

.PHONY: governance-metadata-check
governance-metadata-check: guard-governance ## Verify freshness of governance metadata
	"$(GOV_METADATA_SCRIPT)"

# -----------------------------------------------------------------------------
# DAST
# -----------------------------------------------------------------------------

.PHONY: dast-weekly
dast-weekly: guard-dast ## Run weekly DAST orchestration scan
	KEEP_DAST_ENV=1 DAST_ENV_FILE=app/.env "$(DAST_SCRIPT)"

.PHONY: dast-weekly-local
dast-weekly-local: guard-dast ## Run local DAST ZAP scan
	"$(DAST_SCRIPT)"
