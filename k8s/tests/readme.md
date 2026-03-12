# Infrastructure Policy Testing 🧪

This directory contains the Unit Tests for our Kubernetes policies.
Before any policy (Governance) is applied to the cluster, it must pass these tests to ensure it correctly identifies "Good" vs. "Bad" resources without blocking legitimate traffic.

## 🎯 Objective
To apply Test-Driven Development (TDD) practices to Infrastructure-as-Code.
 * Verify that policies block insecure configurations (True Positives).
 * Ensure that policies do not block valid deployments (False Positives).
 * Validate policy syntax before applying to the cluster.
🛠️ Tools
 * Kyverno CLI: Used to run policies against manifest files locally or in CI, without needing a running Kubernetes cluster.

## 📂 Test Structure
The tests follow a Fixture-based approach:
| File/Directory | Purpose |
|---|---|
| policy-test.yaml | Structural policy test suite (`k8s/policies/ci/structural-policy.yaml`) with pass/fail fixtures. |
| kyverno-test.yaml | Break-glass `PolicyException` admission policy test suite (`k8s/policies/cluster/break-glass-policy.yaml`). |
| values.yaml | Optional values file placeholder for future tests requiring explicit context/variable injection. |
| resources/ | Contains the Fixtures (Mock manifests). |
| ↳ valid-deployment.yaml | A hardened, digest-pinned deployment that should pass structural checks. |
| ↳ invalid-unsigned.yaml | A `:latest`-tagged deployment that should fail structural checks. |
| pod.yaml | A digest-pinned Pod fixture that should pass image policy checks. |
| ↳ invalid-pod-latest.yaml | A `:latest`-tagged Pod fixture that should fail image policy checks. |
| ↳ break-glass-invalid.yaml | `PolicyException` missing required break-glass metadata; should fail admission guardrails. |
| ↳ break-glass-expired.yaml | `PolicyException` with an expired timestamp; should fail expiry validation. |
| ↳ break-glass-self-approved.yaml | `PolicyException` where requester and approver are the same; should fail controlled-approval checks. |
| ↳ break-glass-valid.yaml | Valid `PolicyException` in `policy-exceptions`; used to cover approved exception handling. |
| ↳ exception-target-deployment.yaml | Deployment targeted by the approved `PolicyException`. |
| ↳ exception-target-pod.yaml | Pod targeted by the approved `PolicyException`. |
| cluster-verify-test.yaml | Cluster verification policy suite covering `PolicyException`-based exclusions across all `verify-*` policies. |

## 🚀 How to Run Tests
These tests run automatically in the CI pipeline (infra-lint job), but can be run locally:
* Install Kyverno CLI (if not installed)
* brew install kyverno

* Run the test suites
  ```bash
  kyverno test k8s/tests/
  kyverno test k8s/tests/ -f policy-test.yaml
  kyverno test k8s/tests/ -f cluster-verify-test.yaml
  ```

Understanding the Output
 * Pass: The policy behaved as expected (e.g., it blocked a bad resource, or allowed a good one).
 * Fail: The policy failed to catch a bad resource, or accidentally blocked a good one (Regression).
