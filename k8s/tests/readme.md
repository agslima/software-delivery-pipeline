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
| kyverno-test.yaml | The "Test Suite" definition. It maps specific policies to specific resources and defines the expected outcome (pass or fail). |
| resources/ | Contains the Fixtures (Mock manifests). |
| ↳ valid-deployment.yaml | A perfect deployment (Signed, Labels present, Non-root) that should pass. |
| ↳ invalid-root.yaml | A deployment running as Root that should fail. |
| ↳ invalid-unsigned.yaml | A deployment with an untrusted image that should fail. |
| ↳ break-glass.yaml | A privileged pod that should pass ONLY if it has specific exemption labels. |

## 🚀 How to Run Tests
These tests run automatically in the CI pipeline (infra-lint job), but can be run locally:
* Install Kyverno CLI (if not installed)
* brew install kyverno

* Run the test suite
kyverno test k8s/tests/

Understanding the Output
 * Pass: The policy behaved as expected (e.g., it blocked a bad resource, or allowed a good one).
 * Fail: The policy failed to catch a bad resource, or accidentally blocked a good one (Regression).
