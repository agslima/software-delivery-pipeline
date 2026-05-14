package main

import rego.v1

# ============================================================
# INPUT HELPERS
# ============================================================

from_instructions := [x |
	some i
	x := input[i]
	lower(x.Cmd) == "from"
]

base_image(x) := x.Value[0]

# ============================================================
# IMAGE PARSING
# ============================================================

# Returns repo portion only:
# node:20-alpine                   -> node
# node@sha256:abcd                 -> node
# chainguard/node@sha256:abcd      -> chainguard/node
# cgr.dev/chainguard/node:latest   -> cgr.dev/chainguard/node
repo_name(img) := repo if {
	no_digest := split(img, "@")[0]
	repo := split(no_digest, ":")[0]
}

has_digest(img) if {
	contains(img, "@sha256:")
}

is_latest(img) if {
	endswith(img, ":latest")
}

is_alpine(img) if {
	contains(lower(img), "alpine")
}

# ============================================================
# STAGE GOVERNANCE
# ============================================================

builder_stage_names := {"builder", "build", "deps"}
runtime_stage_names := {"runtime", "final", "prod"}

stage_name(x) := name if {
	count(x.Value) >= 3
	lower(x.Value[1]) == "as"
	name := lower(x.Value[2])
}

is_builder_stage(x) if {
	builder_stage_names[stage_name(x)]
}

is_runtime_stage(x) if {
	runtime_stage_names[stage_name(x)]
}

# ============================================================
# APPROVED BASE REPOSITORIES
# ============================================================

approved_repos := {
	# Node official
	"node",
	"docker.io/node",
	"library/node",
	"docker.io/library/node",

	# Nginx unprivileged
	"nginxinc/nginx-unprivileged",
	"docker.io/nginxinc/nginx-unprivileged",

	# Chainguard
	"chainguard/node",
	"cgr.dev/chainguard/node",
	"chainguard/nginx",
	"cgr.dev/chainguard/nginx",
}

allowed_base(img) if {
	approved_repos[repo_name(img)]
}

# ============================================================
# IMAGE CLASSIFICATION
# ============================================================

is_node(img) if {
	repo := repo_name(img)
	repo == "node"
}
is_node(img) if {
	repo := repo_name(img)
	repo == "docker.io/node"
}
is_node(img) if {
	repo := repo_name(img)
	repo == "library/node"
}
is_node(img) if {
	repo := repo_name(img)
	repo == "docker.io/library/node"
}
is_node(img) if {
	repo := repo_name(img)
	repo == "chainguard/node"
}
is_node(img) if {
	repo := repo_name(img)
	repo == "cgr.dev/chainguard/node"
}

is_nginx(img) if {
	repo := repo_name(img)
	repo == "nginxinc/nginx-unprivileged"
}
is_nginx(img) if {
	repo := repo_name(img)
	repo == "docker.io/nginxinc/nginx-unprivileged"
}
is_nginx(img) if {
	repo := repo_name(img)
	repo == "chainguard/nginx"
}
is_nginx(img) if {
	repo := repo_name(img)
	repo == "cgr.dev/chainguard/nginx"
}

is_chainguard(img) if {
	startswith(repo_name(img), "chainguard/")
}
is_chainguard(img) if {
	startswith(repo_name(img), "cgr.dev/chainguard/")
}

# ============================================================
# POLICY FLAGS
# ============================================================

release_mode_enabled if {
	data.params.release == true
}

# ============================================================
# DENY RULES
# ============================================================

# Only approved base repos
deny contains msg if {
	x := from_instructions[_]
	img := base_image(x)

	not allowed_base(img)

	msg := sprintf(
		"Base image '%v' is not allowed. Allowed repos: node, nginxinc/nginx-unprivileged, chainguard/node, chainguard/nginx.",
		[img],
	)
}

# Ban mutable latest
deny contains msg if {
	x := from_instructions[_]
	img := base_image(x)

	is_latest(img)

	msg := sprintf(
		"Mutable tag ':latest' is not allowed for base image '%v'. Pin to version or digest.",
		[img],
	)
}

# Require digest in release mode
deny contains msg if {
	release_mode_enabled
	x := from_instructions[_]
	img := base_image(x)

	not has_digest(img)

	msg := sprintf(
		"Release mode: base image '%v' must be digest-pinned (@sha256:...).",
		[img],
	)
}

# Chainguard must always use digest
deny contains msg if {
	x := from_instructions[_]
	img := base_image(x)

	is_chainguard(img)
	not has_digest(img)

	msg := sprintf(
		"Chainguard image '%v' must always be pinned by digest.",
		[img],
	)
}

# ============================================================
# WARN RULES
# ============================================================

# Prefer alpine for standard node images (not Chainguard)
warn contains msg if {
	x := from_instructions[_]
	img := base_image(x)

	is_node(img)
	not is_alpine(img)
	not is_chainguard(img)

	msg := sprintf(
		"Prefer Alpine-based Node images for reduced attack surface: '%v'.",
		[img],
	)
}

# Frontend runtime hint
warn contains msg if {
	x := from_instructions[_]
	img := base_image(x)

	is_runtime_stage(x)
	is_node(img)

	msg := sprintf(
		"Runtime stage uses Node ('%v'). For static frontend delivery, consider nginxinc/nginx-unprivileged or Chainguard nginx.",
		[img],
	)
}
