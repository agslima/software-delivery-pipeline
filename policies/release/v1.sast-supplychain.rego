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

reachable(v) if {
  not v.reachable == false
}

exploitable(v) if {
  not v.exploitable == false
}

severity_score(v) = score if {
  score := severity_weight[v.severity]
}

base_risk = sum([
  severity_score(v)
  |
  v := input.vulnerabilities[_]
  reachable(v)
  exploitable(v)
  not v.vex_suppressed == true
])

risk_score = base_risk *
  exposure_weight[input.context.exposure] *
  criticality_weight[input.context.criticality]

allow if {
  risk_score < input.policy.threshold
}

deny contains msg if {
  risk_score >= input.policy.threshold
  msg := sprintf("Risk too high: %v", [risk_score])
}
