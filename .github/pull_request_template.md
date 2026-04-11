## Summary

<!-- Describe the change and why it is needed. -->

## Risk Classification

- [ ] Standard patch or low-risk change
- [ ] Schema-changing release behavior
- [ ] Worker introduction or worker-behavior risk
- [ ] Phased rollout or canary release behavior

Risky release evidence link:

<!-- Link the completed docs/templates/risky-release-evidence.md record when any high-risk box above is checked. -->

Expected blast radius:

<!-- Describe user, data, queue, or runtime scope if the change degrades. -->

Approval points:

<!-- Record any required manual approvals, production reviewers, or promotion checkpoints. -->

Release note / compatibility impact:

<!-- Required for schema-changing releases. Summarize compatibility expectations for rollout, rollback, or mixed-version operation. -->

Rollback compatibility note:

<!-- Required for schema-changing releases and recommended for worker/phased rollout changes. State what remains safe to roll back and what does not. -->

## Validation

- [ ] Relevant automated checks were run
- [ ] Relevant docs were updated
- [ ] Risk-specific evidence was prepared when this change affects schema, worker behavior, or phased rollout

## Migration Review

- [ ] No database or persisted-schema impact
- [ ] Migration impact reviewed: no schema migration required
- [ ] Schema migration included in this PR
- [ ] Destructive migration exception approved
- [ ] Schema compatibility impact documented above
- [ ] Rollback compatibility documented above

Migration rationale:

<!-- Required when schema-impacting code changes do not include a migration. Explain why no migration is needed. -->

Migration phase:

<!-- If a migration is included, state expand, cutover, or cleanup. -->

Rollback impact:

<!-- Describe whether the previous application version remains safe after migration. -->

Migration exception ticket:

<!-- Required for destructive migration exceptions, for example CHG-1234 or INC-1234. -->

Migration exception rationale:

<!-- Required for destructive migration exceptions. Explain why expand-and-contract is not feasible and how recovery is handled. -->
