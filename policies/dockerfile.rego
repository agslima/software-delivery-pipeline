package main

# 1. DENY: Enforce 'node' base image
deny[msg] {
  input[i].Cmd == "from"
  val := input[i].Value
  
  image := val[0]
  
  not startswith(image, "node:")
  not startswith(image, "docker.io/node:")
  msg = sprintf("Drift detected! Base image '%v' is not allowed. Must use 'node:*'", [image])
}

# 2. WARN: Prefer 'alpine'
warn[msg] {
  input[i].Cmd == "from"
  val := input[i].Value
  
  image := val[0]
  
  not contains(image, "alpine")
  msg = sprintf("Policy warning: Base image '%v' does not appear to be Alpine-based. Alpine is preferred.", [image])
}
