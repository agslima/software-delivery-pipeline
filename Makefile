
.PHONY: trivy-report
trivy-report:
	./hack/trivy-report.sh $(target_branch)
