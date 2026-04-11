# Database Migration Strategy

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

## Purpose

This document defines the required operating model for database schema evolution in this repository.
The project uses PostgreSQL with Knex migrations, but the governance rules in this document apply to any persisted schema change introduced through the application delivery path.

The required strategy is:

- expand-and-contract
- backward-compatible changes first
- destructive changes only after a cleanup release has removed live dependencies

This is a governance requirement, not a suggestion.

Related operational documents:

- [`schema-change-deployment-procedure.md`](schema-change-deployment-procedure.md)
- [`database-migration-demo-prescription-status.md`](database-migration-demo-prescription-status.md)

## Required Migration Model

All schema changes must be introduced in phases that allow the old application version and the new application version to operate safely during rollout, rollback, and mixed-version windows.

### Phase 1: Expand

Introduce additive, backward-compatible schema changes first.

Allowed examples:

- add a nullable column
- add a new table
- add a new index
- add a trigger, view, or backfill path that preserves current behavior
- start writing to both old and new columns when needed

### Phase 2: Cutover

Move application reads and writes to the new schema shape only after the expanded schema is available everywhere the release may run.

Expected controls:

- application code remains compatible with both pre-cutover and post-cutover data during rollout
- backfills are completed or explicitly staged before code depends on the new shape
- rollback to the prior application version remains possible without requiring emergency schema repair

### Phase 3: Contract

Destructive changes are allowed only in a later cleanup release after the repository has evidence that the old path is no longer used.

Destructive changes include:

- dropping a column, table, index, enum value, trigger, or constraint relied on by an earlier application version
- renaming a column or table without a compatibility bridge
- changing type, nullability, or uniqueness in a way that can reject previously valid writes or reads

## Release Rules for Schema Changes

Any PR that changes schema, migrations, seeds, or persisted data behavior must follow these release rules:

1. The first release introducing a schema evolution must be backward-compatible.
2. Application code merged with that release must tolerate both old and new schema states relevant to the rollout path.
3. Data backfills or dual-write transitions must be explicit in the migration plan when the new schema depends on migrated data.
4. A destructive cleanup migration must not ship in the same release that introduces the replacement path.
5. Cleanup migrations require evidence that all readers, writers, jobs, and rollback paths no longer depend on the retired schema.
6. If safe rollback cannot be preserved, the PR must be treated as exceptional and explicitly escalated for review before merge.

## Pre-deploy and Post-deploy Timing Rules

Schema timing is part of release governance.

- pre-deploy migration jobs may run additive expand steps and required backfills
- application release jobs may run only after the required expanded schema is present
- post-deploy cleanup jobs may remove compatibility paths only in a later release

Do not combine expand, app cutover, and destructive cleanup into a single release step.

## Reviewer Decision Rules

Reviewers should treat a PR as compliant only when the answer to all relevant questions is yes:

- Is the schema change additive or otherwise backward-compatible for the first release?
- Can the previous application version still run safely after the migration is applied?
- Can the new application version run safely before cleanup has happened?
- If data must move, is the backfill or transition plan explicit?
- If a destructive change is proposed, is it clearly separated into a later cleanup release?
- Do tests, migrations, and documentation reflect the new rollout sequence?

If any answer is no, the PR violates migration policy unless the PR is explicitly framed and approved as an exceptional governance decision.

## Safe Patterns

The following patterns are expected and generally acceptable when validated with the surrounding application change:

- add a nullable column, deploy code that writes it, backfill data, then make reads prefer it
- add a new table, dual-write or backfill into it, then switch reads in a later release
- add an index before a query path depends on it
- introduce a new non-nullable field as nullable first, populate it, then enforce `NOT NULL` in a later cleanup release
- keep old and new column names temporarily while the application transitions between them
- create compatibility views or translation logic during table reshaping

## Forbidden Unsafe Patterns

The following patterns are explicitly forbidden in normal delivery:

- dropping a column or table in the same release that introduces its replacement
- renaming a column or table when existing application code still references the old name
- changing a nullable column to `NOT NULL` before all existing rows are repaired and all writers provide the value
- changing data type or semantics in place when older code may still read or write the prior format
- replacing a single-write path with a new destination without dual-write, backfill, or compatibility handling
- shipping a migration that requires a full application stop-the-world deployment unless the task is explicitly approved as exceptional maintenance
- assuming rollback is unnecessary because the deployment is expected to be fast

These patterns are governance violations because they make rollout, rollback, or mixed-version execution unsafe.

## Safe and Unsafe Examples

### Safe: replace `full_name` with `first_name` and `last_name`

Release 1:

- add nullable `first_name` and `last_name`
- keep `full_name`
- backfill split values
- write both representations
- continue reading `full_name` or derive from either shape safely

Release 2:

- switch reads to `first_name` and `last_name`
- keep writing compatibility logic if rollback is still required

Release 3:

- drop `full_name` only after confirming old code paths are retired

### Unsafe: rename `full_name` to `display_name` in one migration

Single release behavior:

- migration renames the column
- old application version still queries `full_name`
- rollback also expects `full_name`

Result:

- rollout can fail during mixed-version execution
- rollback can fail immediately

### Safe: enforce a new required foreign key

Release 1:

- add nullable foreign key column
- populate it for existing rows
- update writers to send the new value

Release 2:

- verify no nulls remain
- add the `NOT NULL` and foreign key enforcement

### Unsafe: add `NOT NULL` and foreign key constraint to existing dirty data

Single release behavior:

- migration adds the required column or strict constraint immediately
- historical rows or lagging writers violate the rule

Result:

- migration may fail
- deployment may succeed partially and leave the release unrecoverable

## PR Expectations

Schema-changing PRs should make the rollout plan obvious. At minimum they should identify:

- whether the change is expand, cutover, or cleanup
- whether the application remains backward-compatible
- whether a backfill is required
- whether rollback remains supported after the migration runs

When a PR includes a cleanup migration, it should also identify the prior release or change that established compatibility and explain why cleanup is now safe.

## Repeatable Reviewer Checklist

Use this checklist during review of schema-impacting PRs:

1. Confirm whether the PR changes schema-affecting code, persistence logic, or migration files.
2. If schema-affecting code changed, confirm the PR either includes a migration file or explicitly states why no migration is required.
3. If a migration is included, confirm the PR identifies the migration phase as expand, cutover, or cleanup.
4. Confirm rollback safety is described for the application version immediately before this PR.
5. Reject destructive operations in normal delivery unless the PR carries an explicit exception ticket and rationale.
6. Confirm validation covers the migration path that is actually changing, not only unit tests unrelated to persistence.

The PR template is the canonical review surface for this checklist.

## CI-Enforced Policy Rules

Pull requests are expected to pass the migration safety validation job when they touch schema-impacting paths.

The validation enforces these rules:

- schema-impacting changes must include a migration file, unless the PR explicitly marks that no migration is required and explains why
- potentially destructive migration operations such as `dropColumn`, `dropTable`, `renameColumn`, or immediate constraint hardening are treated as exceptions
- destructive patterns require explicit exception metadata in the PR, including a ticket and rationale

CI validation makes risky migration behavior visible before merge, but it does not replace reviewer judgment.

## Relationship to Existing Application Tooling

For this repository:

- schema changes are implemented through Knex migrations under `app/server/src/infra/db/migrations/`
- validation should use the existing application commands, including `npm run db:migrate` and the most relevant test scope
- documentation must be updated when a change affects schema rollout behavior, operational sequencing, or recovery assumptions

## Exceptions

Exceptions to this strategy are high-risk and require explicit review because they reduce rollback safety and release integrity.

Normal urgency is not a sufficient reason to bypass this model.
If an exceptional migration is ever required, the PR must explain:

- why expand-and-contract is not feasible
- what outage or maintenance assumptions are being made
- what rollback and recovery plan exists
- who approved the exception
