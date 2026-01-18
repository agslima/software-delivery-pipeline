package main
import rego.v1

default deny := []
default warn := []

# ----------------------------
# Helpers
# ----------------------------

from_instructions := [x | some i; x := input[i]; lower(x.Cmd) == "from"]

# Extract the base image reference ("node:25-alpine", "nginxinc/nginx-unprivileged:1.27", etc.)
base_image(x) := img {
  v := x.Value
  img := v[0]
}

is_latest(img) { endswith(img, ":latest") }

has_digest(img) { contains(img, "@sha256:") }

is_node(img) {
  startswith(img, "node:")
} or {
  startswith(img, "docker.io/node:")
} or {
  startswith(img, "library/node:")
} or {
  startswith(img, "docker.io/library/node:")
}

is_alpine(img) { contains(img, "alpine") }

# Frontend runtime (recommended)
is_nginx_unprivileged(img) {
  startswith(img, "nginxinc/nginx-unprivileged:")
} or {
  startswith(img, "docker.io/nginxinc/nginx-unprivileged:")
}

# Determine stage name if present: FROM <img> AS <name>
stage_name(x) := name {
  v := x.Value
  count(v) >= 3
  lower(v[1]) == "as"
  name := lower(v[2])
}

# Treat some stages as "builder-like"
is_builder_stage(x) {
  n := stage_name(x)
  n == "builder" or n == "build" or n == "deps"
}

# Treat some stages as "runtime-like"
is_runtime_stage(x) {
  n := stage_name(x)
  n == "runtime" or n == "final" or n == "prod"
}

# If no AS name, consider it builder unless it's the last stage (hard to know reliably).
# We'll apply base rules to all stages; runtime-specific hardening is separate.
allowed_base_for_any_stage(img) {
  is_node(img)
} or {
  is_nginx_unprivileged(img)
}

# ----------------------------
# DENY rules (hard failures)
# ----------------------------

# 1) Only approved base images (node, nginx-unprivileged)
deny contains msg if {
  x := from_instructions[_]
  img := base_image(x)
  not allowed_base_for_any_stage(img)
  msg := sprintf("Base image '%v' is not allowed. Use node:* (builder/backend runtime) or nginxinc/nginx-unprivileged:* (frontend runtime).", [img])
}

# 2) Ban :latest
deny contains msg if {
  x := from_instructions[_]
  img := base_image(x)
  is_latest(img)
  msg := sprintf("Mutable tag ':latest' is not allowed for base images (%v). Pin to a version or digest.", [img])
}

# 3) Optional: require digest pinning in release mode
# Enable by passing: conftest test --input release=true
deny contains msg if {
  release_mode_enabled
  x := from_instructions[_]
  img := base_image(x)
  not has_digest(img)
  msg := sprintf("Release mode: base image '%v' must be digest-pinned (@sha256:...).", [img])
}

release_mode_enabled if {
  # default false if not provided
  input.release == true
}

# ----------------------------
# WARN rules (advisory)
# ----------------------------

# Prefer alpine for node images (size and CVE footprint)
warn contains msg if {
  x := from_instructions[_]
  img := base_image(x)
  is_node(img)
  not is_alpine(img)
  msg := sprintf("Prefer Alpine-based Node images for smaller surface area: '%v'.", [img])
}

# Strong recommendation: use nginx-unprivileged for frontend runtime stage
warn contains msg if {
  x := from_instructions[_]
  img := base_image(x)
  is_runtime_stage(x)
  is_node(img)
  msg := sprintf("Runtime stage '%v' uses Node base. Consider nginxinc/nginx-unprivileged:* for frontend serving.", [img])
}
