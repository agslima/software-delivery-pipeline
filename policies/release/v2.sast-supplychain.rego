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

# V2 is conservative for release: unknown reachability still contributes risk,
# while CodeQL-proven non-reachability and VEX non-exploitability reduce it.
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

# Additional guardrails
deny contains msg if {
  v := input.vulnerabilities[_]
  v.severity == "CRITICAL"
  reachable(v)
  exploitable(v)
  not v.vex_suppressed == true
  msg := sprintf("Blocking: exploitable CRITICAL vuln %v", [v.id])
}

deny contains msg if {
  input.context.environment_tier == "production"
  input.context.release_channel == "stable"
  risk_score >= input.policy.threshold
  msg := sprintf("Blocking: production stable release risk %v exceeds threshold %v", [risk_score, input.policy.threshold])
}

allow if {
  count(deny) == 0
  risk_score < input.policy.threshold
}
