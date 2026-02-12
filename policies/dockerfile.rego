package main

import rego.v1

# ----------------------------
# Helpers
# ----------------------------

from_instructions := [x |
  some i
  x := input[i]
  lower(x.Cmd) == "from"
]

base_image(x) := img if {
  img := x.Value[0]
}

is_latest(img) if { endswith(img, ":latest") }
has_digest(img) if { contains(img, "@sha256:") }
is_alpine(img) if { contains(img, "alpine") }

# Allowed stage aliases (optional governance)
builder_stage_names := {"builder", "build", "deps"}
runtime_stage_names := {"runtime", "final", "prod"}

# Determine stage name if present: FROM <img> AS <name>
stage_name(x) := name if {
  v := x.Value
  count(v) >= 3
  lower(v[1]) == "as"
  name := lower(v[2])
}

is_builder_stage(x) if {
  n := stage_name(x)
  builder_stage_names[n]
}

is_runtime_stage(x) if {
  n := stage_name(x)
  runtime_stage_names[n]
}

# ---- Base image allowlist

is_node(img) if { startswith(img, "node:") }
is_node(img) if { startswith(img, "docker.io/node:") }
is_node(img) if { startswith(img, "library/node:") }
is_node(img) if { startswith(img, "docker.io/library/node:") }

is_nginx_unprivileged(img) if { startswith(img, "nginxinc/nginx-unprivileged:") }
is_nginx_unprivileged(img) if { startswith(img, "docker.io/nginxinc/nginx-unprivileged:") }

allowed_base_for_any_stage(img) if { is_node(img) }
allowed_base_for_any_stage(img) if { is_nginx_unprivileged(img) }

# Release mode toggle:
# IMPORTANT: you cannot set input.release because input is the Dockerfile AST.
# Use data params instead (see notes below).
release_mode_enabled if {
  data.params.release == true
}

# ----------------------------
# DENY rules (hard failures)
# ----------------------------

# 1) Only approved base images (node or nginx-unprivileged)
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

# 3) Require digest pinning in release mode (optional)
deny contains msg if {
  release_mode_enabled
  x := from_instructions[_]
  img := base_image(x)
  not has_digest(img)

  msg := sprintf("Release mode: base image '%v' must be digest-pinned (@sha256:...).", [img])
}

# ----------------------------
# WARN rules (advisory)
# ----------------------------

# Prefer alpine for node images
warn contains msg if {
  x := from_instructions[_]
  img := base_image(x)
  is_node(img)
  not is_alpine(img)

  msg := sprintf("Prefer Alpine-based Node images for smaller surface area: '%v'.", [img])
}

# Runtime stage hint (if runtime stage uses node)
warn contains msg if {
  x := from_instructions[_]
  img := base_image(x)
  is_runtime_stage(x)
  is_node(img)

  msg := sprintf("Runtime stage base is Node ('%v'). For frontend serving, consider nginxinc/nginx-unprivileged:*.", [img])
}
