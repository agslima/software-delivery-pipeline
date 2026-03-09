
.PHONY: trivy-report
trivy-report:
	./scripts/trivy-report.sh

.PHONY: snyk-report
snyk-report:
	./scripts/run-snyk-aggregate.sh
