
# Tryvi local scan
.PHONY: trivy-scan
trivy-report:
	./scripts/trivy-report.sh

# Snyk weekly report scan
.PHONY: snyk-report
snyk-report:
	./scripts/run-snyk-aggregate.sh

# Governance Drift Check (docs/workflow refs)
.PHONY: governance-drift-check
governance-drift-check:
	./scripts/check-governance-drift.sh

# Governance Metadata Freshness Check
.PHONY: governance-metadata-check
governance-metadata-check:
	./scripts/check-governance-metadata-freshness.sh

# Weekly DAST orchestration
.PHONY: dast-weekly
dast-weekly:
	KEEP_DAST_ENV=1 DAST_ENV_FILE=app/.env ./scripts/run-local-zap-full-scan.sh

.PHONY: dast-weekly-local
dast-weekly-local:
	./scripts/run-local-zap-full-scan.sh
