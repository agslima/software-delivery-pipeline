# Architecture Decision Record (ADR)

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

[Back](007-supply-chain-incident-response-revocation.md) // [Home](../README.md)

## ADR 008: Database Migration Strategy

_Expand-and-contract with backward-compatible releases_

- Status: Accepted
- Date: 2026-04-11
- Context: Software Delivery Pipeline, application and database evolution governance

## Context

This repository now includes a real coordination problem between application releases and database schema evolution.
The application uses PostgreSQL with Knex migrations, and the delivery model emphasizes:

- safe rollout and rollback
- auditable change sequencing
- governance that reviewers can enforce from a pull request

Database changes are uniquely risky because schema migrations often outlive the application version that introduced them.
If a migration removes or reshapes state too early, the repository can produce a release that is:

- impossible to roll back safely
- unsafe during mixed-version rollout
- hard to review because compatibility assumptions are implicit

In a governance-first delivery model, schema evolution must follow explicit, reviewable rules rather than relying on deployment timing luck.

## Decision

The project adopts an expand-and-contract migration strategy.

Required operating rules:

- the first release introducing a schema change must be backward-compatible
- additive schema changes happen before application cutover
- destructive cleanup happens only in a later release after old dependencies are removed
- pull requests must make the migration phase and rollback expectations explicit

The strategy is documented normatively in `docs/database-migration-strategy.md`.

## Rationale

### 1. Preserves rollback safety

Expand-and-contract keeps the old schema path available while the new code is rolling out.
This reduces the risk that a deployment or emergency rollback will fail because the database changed irreversibly too soon.

### 2. Makes review enforceable

The repository needs a migration policy that reviewers can apply by inspection.
Backward-compatible-first sequencing gives reviewers a simple test:

- is the first release additive and safe for old and new code?
- is destructive cleanup deferred?

That is easier to govern than ad hoc migration judgments.

### 3. Matches the repository's delivery model

This project already treats CI/CD as a governed control plane with explicit evidence, approvals, and trust boundaries.
Schema evolution should follow the same discipline:

- explicit phases
- explicit exceptions
- auditable rationale

### 4. Minimizes operational surprise

Unsafe schema migrations often depend on perfect rollout ordering, downtime, or human coordination.
Expand-and-contract reduces dependence on those assumptions and produces safer, smaller, more reviewable releases.

## Consequences

### Positive

- safer rollouts and rollbacks
- clearer pull request review criteria
- better alignment between application evolution and governance evidence
- smaller and more intentional cleanup releases

### Negative and trade-offs

- some features require multiple releases instead of one
- temporary duplication such as dual-writes or compatibility reads may be necessary
- cleanup work must be tracked and completed rather than hidden in the initial change

These trade-offs are acceptable because the repository prioritizes correctness, governance, and release integrity over one-step schema changes.

## Alternatives Considered

### 1. Direct in-place schema replacement

Rejected because it makes mixed-version deployment and rollback unsafe.
Examples include one-step renames, immediate destructive drops, and immediate hardening of constraints against live dirty data.

### 2. Big-bang maintenance-window migrations

Rejected as the default because it depends on coordinated downtime and weakens normal delivery safety.
Such changes may occasionally be necessary as explicit exceptions, but they are not the project standard.

### 3. Tool-specific rules only

Rejected because Knex usage alone does not define safe rollout behavior.
The repository needs a strategy that governs release sequencing, not just migration file syntax.
