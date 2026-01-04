# policies/dockerfile.rego
package main

# Deny images not using our approved base images
deny[msg] {
  input[i].Cmd == "from"
  val := input[i].Value
  not startswith(val, "node:")
  not startswith(val, "docker.io/node:")
  msg = sprintf("Drift detected! Base image '%v' is not allowed. Must use 'node:*'", [val])
}

# Enforce strictly defined internal registry for multi-stage builds if needed
warn[msg] {
  input[i].Cmd == "from"
  val := input[i].Value
  not contains(val, "alpine")
  msg = sprintf("Policy warning: Base image '%v' does not appear to be Alpine-based. Alpine is preferred.", [val])
}
