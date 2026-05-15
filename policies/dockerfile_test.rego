package main

import rego.v1

# ============================================================
# TEST HELPERS
# ============================================================

mk_from(image) := {
	"Cmd": "from",
	"Value": [image],
}

mk_from_stage(image, stage) := {
	"Cmd": "from",
	"Value": [image, "AS", stage],
}

# ============================================================
# ALLOW TESTS
# ============================================================

test_allow_node_tag if {
	input := [mk_from("node:22-alpine")]
	count(deny) with input as input == 0
}

test_allow_node_digest if {
	input := [mk_from("node@sha256:6235dcab9abcdef")]
	count(deny) with input as input == 0
}

test_allow_chainguard_node_digest if {
	input := [mk_from("chainguard/node@sha256:6235dcab9abcdef")]
	count(deny) with input as input == 0
}

test_allow_cgr_node_digest if {
	input := [mk_from("cgr.dev/chainguard/node@sha256:6235dcab9abcdef")]
	count(deny) with input as input == 0
}

test_allow_nginx_unprivileged if {
	input := [mk_from("nginxinc/nginx-unprivileged:1.27-alpine")]
	count(deny) with input as input == 0
}

test_allow_chainguard_nginx_digest if {
	input := [mk_from("chainguard/nginx@sha256:ca38b123456")]
	count(deny) with input as input == 0
}

# ============================================================
# DENY TESTS
# ============================================================

test_deny_unapproved_image if {
	input := [mk_from("ubuntu:22.04")]
	count(deny) with input as input > 0
}

test_deny_latest_tag if {
	input := [mk_from("node:latest")]
	some msg in deny with input as input
	contains(msg, ":latest")
}

test_deny_release_mode_requires_digest if {
	input := [mk_from("node:22-alpine")]

	some msg in deny
		with input as input
		with data.params.release as true

	contains(msg, "must be digest-pinned")
}

test_deny_chainguard_without_digest if {
	input := [mk_from("chainguard/node:latest")]

	some msg in deny with input as input
	contains(msg, "Chainguard image")
}

# ============================================================
# WARN TESTS
# ============================================================

test_warn_node_non_alpine if {
	input := [mk_from("node:22")]

	some msg in warn with input as input
	contains(msg, "Prefer Alpine-based Node")
}

test_no_warn_for_alpine if {
	input := [mk_from("node:22-alpine")]
	count(warn with input as input) == 0
}

test_no_warn_for_chainguard_node if {
	input := [mk_from("chainguard/node@sha256:abc123")]
	count(warn with input as input) == 0
}

test_warn_runtime_node_stage if {
	input := [mk_from_stage("node:22-alpine", "runtime")]

	some msg in warn with input as input
	contains(msg, "Runtime stage uses Node")
}

# ============================================================
# STAGE TESTS
# ============================================================

test_detect_runtime_stage if {
	x := mk_from_stage("node:22-alpine", "runtime")
	is_runtime_stage(x)
}

test_detect_builder_stage if {
	x := mk_from_stage("node:22-alpine", "builder")
	is_builder_stage(x)
}
