
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

