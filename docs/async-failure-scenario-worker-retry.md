# Async Failure Scenario: Worker Crash Before Completion

[//]: # (owner: Project Maintainers)
[//]: # (review_cadence: Quarterly)
[//]: # (last_reviewed: 2026-04-11)

This document describes one concrete partial-failure story for the asynchronous prescription export flow.

It demonstrates the intended behavior when:

- the API successfully enqueues export work
- the worker claims the job
- the worker fails before completion
- the retry path later succeeds without creating duplicate jobs

## Why This Scenario Matters

This is the first async operational story the repository should support without manual database repair.

It proves that:

- API success does not depend on worker success in the same request
- temporary worker failure does not lose queued work
- lease-based retry allows recovery after process loss
- duplicate replay is controlled through idempotent job handling

## Scenario Summary

Named scenario:

- `export-job-worker-crash-then-retry-success`

Failure model:

- the worker crashes after claiming a queued export job but before marking it `completed`

Expected result:

- the export job remains visible
- the lease expires
- a restarted worker claims the same job again
- `attempt_count` increases
- the retry succeeds and the job finishes as `completed`

## Preconditions

- the API, database, and worker are running
- a valid prescription exists
- the worker uses the normal lease and retry settings
- no operator edits are made directly to `v2.export_jobs`

## Timeline

### T0: Request accepted

The caller submits:

- `POST /api/v2/prescriptions/{id}/exports`

Expected API response:

- HTTP `202 Accepted`
- export job id
- status `queued`
- `pollUrl` for the job

Expected queue state:

- one row exists in `v2.export_jobs`
- `status = queued`
- `attempt_count = 0`

### T1: Worker claims the job

The worker polls the queue and claims the job.

Expected queue state:

- `status = processing`
- `attempt_count = 1`
- `lease_owner` is set
- `lease_expires_at` is set in the future
- `started_at` is populated

Expected signal:

- worker log entry with `outcome=completed`, `retry`, or `failed` does not exist yet
- worker `/ready` is healthy

### T2: Worker crashes before completion

The worker process exits after claim and before `markCompleted`.

Expected queue state immediately after the crash:

- the same job row still exists
- `status` remains `processing`
- `attempt_count` remains `1`
- `lease_owner` and `lease_expires_at` still reflect the interrupted claim
- `completed_at` is still `null`

Expected signals:

- worker process is gone or unready
- job polling endpoint still returns the job instead of losing it
- `last_error` may still be `null` because the process died before the application-level retry handler ran

This is expected for abrupt process loss.

### T3: Lease expires

No manual intervention is required yet.

Once `lease_expires_at` is in the past, the job is eligible to be claimed again.

Expected queue state:

- `status` may still show `processing`
- the lease is now stale because `lease_expires_at <= now()`

This is the key debugging clue that the job is recoverable instead of orphaned forever.

### T4: Worker restarts and retries

After the worker comes back, it reclaims the stale job.

Expected queue state:

- `status = processing`
- `attempt_count = 2`
- `lease_owner` changes to the new worker instance
- `lease_expires_at` moves forward

Expected signals:

- worker `/ready` returns success again
- worker logs show the job being processed after restart

### T5: Retry succeeds

The restarted worker completes the export successfully.

Expected queue state:

- `status = completed`
- `attempt_count = 2`
- `completed_at` is populated
- `lease_owner` is cleared
- `lease_expires_at` is cleared
- `result_payload` contains the export artifact

Expected API result:

- `GET /api/v2/exports/{jobId}` returns `completed`
- artifact metadata is present

## Expected Signals

### API

- initial enqueue request returns `202 Accepted`
- job status endpoint remains queryable throughout the incident
- no duplicate job row is created for the same prescription version

### Worker health

During failure:

- `/ready` fails or the worker pod/container is absent

After restart:

- `/ready` returns success
- `/health` shows the worker loop is running again

### Queue state

The main fields to inspect are:

- `status`
- `attempt_count`
- `lease_owner`
- `lease_expires_at`
- `started_at`
- `completed_at`
- `last_error`

### Logs

Useful expected patterns:

- worker shutdown or crash event
- worker startup event after recovery
- later successful processing log for the same job id

## Operator Response

Recommended response:

1. Confirm the enqueue request succeeded.
2. Inspect the job through `GET /api/v2/exports/{jobId}` or `v2.export_jobs`.
3. If the job is `processing`, check whether `lease_expires_at` is stale.
4. Restore the worker process or wait for orchestrator restart.
5. Allow the retry path to reclaim the stale job.
6. Verify the job moves to `completed`.

Do not:

- insert a duplicate export job row manually
- reset `attempt_count` by hand while the worker is recovering
- mark the job complete without an artifact payload

## Debugging Queries

Example SQL for triage:

```sql
select
  id,
  status,
  attempt_count,
  max_attempts,
  lease_owner,
  lease_expires_at,
  started_at,
  completed_at,
  last_error,
  updated_at
from v2.export_jobs
where id = '<job-id>';
```

Interpretation:

- `processing` plus future `lease_expires_at`: worker still owns the job
- `processing` plus expired `lease_expires_at`: stale lease, retry should reclaim
- `completed`: recovery succeeded
- `failed`: retry budget exhausted or non-retryable failure path was taken

## Why Recovery Is Safe

This scenario is safe because the implementation assumes at-least-once delivery and keeps job state in the database.

The safety properties are:

- the job row survives worker loss
- stale leases can be reclaimed
- repeated submissions for the same prescription version reuse the same logical job
- completion writes back onto the same job row rather than creating divergent artifacts

That means partial failure is visible, debuggable, and recoverable without silent loss.
