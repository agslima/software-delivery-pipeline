package supplychain

default allow = false

severity_weight = {
  "CRITICAL": 10,
  "HIGH": 5,
  "MEDIUM": 2
}

exposure_weight = {
  "public": 2.0,
  "internal": 1.2,
  "private": 0.8
}

criticality_weight = {
  "high": 2.0,
  "medium": 1.2,
  "low": 0.8
}

base_risk = sum([
  severity_weight[v.severity]
  |
  v := input.vulnerabilities[_]
  v.reachable
  v.exploitable
])

risk_score = base_risk *
  exposure_weight[input.context.exposure] *
  criticality_weight[input.context.criticality]

allow {
  risk_score < input.policy.threshold
}

deny[msg] {
  risk_score >= input.policy.threshold
  msg := sprintf("Risk too high: %v", [risk_score])
}
