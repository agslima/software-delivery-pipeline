package security.dast

default allow = false

high := input.summary.high
medium := input.summary.medium

# Environment-aware (future-proof)
env := input.env

# ---- Rules ----

# Dev is permissive
allow {
  env == "dev"
}

# Prod strict rule
allow {
  env == "prod"
  high == 0
}

# Optional: tolerate medium issues in prod
warn[msg] {
  medium > 5
  msg := sprintf("High number of medium issues: %d", [medium])
}

deny[msg] {
  high > 0
  msg := sprintf("High vulnerabilities found: %d", [high])
}
