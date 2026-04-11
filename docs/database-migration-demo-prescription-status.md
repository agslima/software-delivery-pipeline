# Database Migration Demo: `prescription_status`

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

## Purpose

This walkthrough provides one concrete schema evolution example that demonstrates compatibility thinking, not only migration tooling.

The example change is:

- introduce a new `prescription_status` column
- keep older application behavior working during rollout
- move the new application to the new column safely
- defer cleanup to a later release

## Starting Point

Assume the existing application derives prescription state indirectly from older fields or business rules, and does not yet persist a dedicated status column.

Goal:

- new application code should read and write an explicit `prescription_status`
- old application code must continue to work after the expand migration
- cleanup must happen only in a later release

## Release Sequence

### Release 1: Expand

Migration intent:

- add nullable `prescription_status`
- backfill existing rows using current business rules
- preserve all old fields and read paths

Application behavior:

- old application continues to work because no required field was removed
- new application version, if deployed later, can start reading `prescription_status`
- writes remain compatible because the column is additive

Representative migration shape:

```js
exports.up = async function (knex) {
  await knex.schema.withSchema('v2').alterTable('prescriptions', (table) => {
    table.text('prescription_status');
    table.index(['prescription_status']);
  });

  await knex.withSchema('v2')
    .from('prescriptions')
    .update({
      prescription_status: knex.raw(
        "case when expires_at is not null and expires_at < now() then 'expired' else 'active' end"
      ),
    });
};
```

Why this is safe:

- additive schema only
- old code still sees the same table and existing columns
- rollback of the application version does not require schema repair

### Release 2: Cutover

Application intent:

- new application reads `prescription_status`
- new writes populate `prescription_status` directly
- compatibility logic still tolerates rows where the old derivation path exists

Why this is safe:

- schema already exists everywhere before the new app depends on it
- old application can still run because legacy fields were not removed
- rollback remains possible because compatibility structures remain in place

### Release 3: Cleanup

Cleanup intent:

- remove old derivation logic or deprecated fields only after verifying all live code paths use `prescription_status`

Why this must be later:

- same-release cleanup would make rollback unsafe
- mixed-version deployment could break if any old worker, job, or app instance still depends on the earlier shape

## Compatibility Proof

### Old app still works after expand migration

Reason:

- expand migration only adds data and does not remove existing fields
- old read and write paths continue to use the prior schema safely

### New app uses new schema safely

Reason:

- the new column exists before the app release depends on it
- backfill ensures historical data is usable
- compatibility logic can tolerate rows created before full cutover

### Cleanup happens only in a later release

Reason:

- cleanup removes fallback behavior only after the rollout has stabilized
- rollback to the previous app version remains possible until cleanup is complete

## Release Note Example

### Release 1 note

```md
Release note: expand prescription status model

- Added nullable `v2.prescriptions.prescription_status`
- Backfilled existing prescriptions using current expiry rules
- No destructive schema changes
- Previous application version remains compatible
```

### Release 2 note

```md
Release note: cut over application reads to prescription_status

- API and repository logic now read explicit `prescription_status`
- Writes continue to preserve compatibility during rollout
- Cleanup of deprecated status derivation remains deferred
```

### Release 3 note

```md
Release note: cleanup deprecated prescription status fallback

- Removed legacy status derivation path after rollout verification
- Cleanup shipped separately from the original expand release
- Rollback assumptions were reviewed before merge
```

## Why This Example Matters

This example shows the core rule of governed schema delivery:

- safe rollout depends on ordering
- additive change comes first
- application cutover comes second
- destructive cleanup comes last

That is the difference between a migration tool and a migration strategy.
