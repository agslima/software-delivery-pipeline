package main

import rego.v1

# 1. DENY: Enforce 'node' base image
deny contains msg if {
  # 'some i' explicitly declares the iterator variable (Best Practice in v1)
  some i
  input[i].Cmd == "from"
  val := input[i].Value
  
  image := val[0]
  
  # Check if image starts with node: or docker.io/node:
  not startswith(image, "node:")
  not startswith(image, "docker.io/node:")
  
  msg := sprintf("Drift detected! Base image '%v' is not allowed. Must use 'node:*'", [image])
}

# 2. WARN: Prefer 'alpine'
warn contains msg if {
  some i
  input[i].Cmd == "from"
  val := input[i].Value
  
  image := val[0]
  
  # Check if image contains 'alpine'
  not contains(image, "alpine")
  
  msg := sprintf("Policy warning: Base image '%v' does not appear to be Alpine-based. Alpine is preferred.", [image])
}
