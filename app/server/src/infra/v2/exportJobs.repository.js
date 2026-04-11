const { randomUUID } = require('crypto');
const db = require('../db/knex');

const withSchema = (client) => (client || db).withSchema('v2');

const mapJob = (row) => {
  if (!row) return null;

  return {
    id: row.id,
    prescriptionId: row.prescription_id,
    doctorId: row.doctor_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    format: row.format,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRunAt: row.next_run_at,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    lastError: row.last_error,
    result: row.result_payload
      ? {
          contentType: row.result_content_type,
          fileName: row.result_file_name,
          payload: row.result_payload,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

class ExportJobsRepository {
  async enqueueOrReuse({ prescriptionId, doctorId, format = 'json', maxAttempts, idempotencyKey }) {
    const existing = await this.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.status === 'failed') {
        return this.requeueFailed(existing.id);
      }
      return existing;
    }

    const id = randomUUID();
    const now = new Date();

    try {
      await withSchema()('export_jobs').insert({
        id,
        prescription_id: prescriptionId,
        doctor_id: doctorId,
        idempotency_key: idempotencyKey,
        status: 'queued',
        format,
        max_attempts: maxAttempts,
        next_run_at: now,
        created_at: now,
        updated_at: now,
      });

      return this.findById(id);
    } catch (error) {
      if (error.code === '23505') {
        return this.findByIdempotencyKey(idempotencyKey);
      }
      throw error;
    }
  }

  async findByIdempotencyKey(idempotencyKey, { trx } = {}) {
    const row = await withSchema(trx)('export_jobs').where({ idempotency_key: idempotencyKey }).first();
    return mapJob(row);
  }

  async findById(id, { doctorId, trx } = {}) {
    const query = withSchema(trx)('export_jobs').where({ id }).first();
    if (doctorId) {
      query.andWhere('doctor_id', doctorId);
    }

    const row = await query;
    return mapJob(row);
  }

  async claimNextRunnable({ workerId, leaseSeconds, now = new Date(), trx } = {}) {
    const executor = trx || db;

    return executor.transaction(async (transaction) => {
      const jobs = withSchema(transaction);
      const leaseExpiresAt = new Date(now.getTime() + (leaseSeconds * 1000));
      const row = await jobs('export_jobs')
        .whereIn('status', ['queued', 'processing'])
        .andWhere('next_run_at', '<=', now)
        .whereRaw('attempt_count < max_attempts')
        .andWhere((builder) => {
          builder.whereNull('lease_expires_at').orWhere('lease_expires_at', '<=', now);
        })
        .orderBy('next_run_at', 'asc')
        .orderBy('created_at', 'asc')
        .forUpdate()
        .skipLocked()
        .first();

      if (!row) return null;

      await jobs('export_jobs')
        .where({ id: row.id })
        .update({
          status: 'processing',
          attempt_count: row.attempt_count + 1,
          lease_owner: workerId,
          lease_expires_at: leaseExpiresAt,
          started_at: row.started_at || now,
          failed_at: null,
          last_error: null,
          updated_at: now,
        });

      return this.findById(row.id, { trx: transaction });
    });
  }

  async markCompleted(id, { workerId, resultPayload, contentType, fileName, now = new Date() }) {
    await withSchema()('export_jobs')
      .where({ id, lease_owner: workerId })
      .update({
        status: 'completed',
        completed_at: now,
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        result_payload: resultPayload,
        result_content_type: contentType,
        result_file_name: fileName,
        updated_at: now,
      });

    return this.findById(id);
  }

  async markRetry(id, { workerId, retryAt, errorMessage, now = new Date() }) {
    await withSchema()('export_jobs')
      .where({ id, lease_owner: workerId })
      .update({
        status: 'queued',
        next_run_at: retryAt,
        lease_owner: null,
        lease_expires_at: null,
        last_error: errorMessage,
        updated_at: now,
      });

    return this.findById(id);
  }

  async markFailed(id, { workerId, errorMessage, now = new Date() }) {
    await withSchema()('export_jobs')
      .where({ id, lease_owner: workerId })
      .update({
        status: 'failed',
        failed_at: now,
        lease_owner: null,
        lease_expires_at: null,
        last_error: errorMessage,
        updated_at: now,
      });

    return this.findById(id);
  }

  async requeueFailed(id, { now = new Date() } = {}) {
    await withSchema()('export_jobs')
      .where({ id, status: 'failed' })
      .update({
        status: 'queued',
        attempt_count: 0,
        next_run_at: now,
        lease_owner: null,
        lease_expires_at: null,
        started_at: null,
        completed_at: null,
        failed_at: null,
        last_error: null,
        result_payload: null,
        result_content_type: null,
        result_file_name: null,
        updated_at: now,
      });

    return this.findById(id);
  }
}

module.exports = { ExportJobsRepository, mapJob };
