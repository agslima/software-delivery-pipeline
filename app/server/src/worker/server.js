const http = require('http');
const { randomUUID } = require('crypto');

const env = require('../config/env');
const db = require('../infra/db/knex');
const logger = require('../observability/logger');
const createWorkerApp = require('./createWorkerApp');
const { ExportJobsRepository } = require('../infra/v2/exportJobs.repository');
const { PrescriptionsRepository } = require('../infra/v2/prescriptions.repository');
const { ExportWorkerService } = require('../core/v2/exportWorker.service');

const state = {
  ready: false,
  processedJobs: 0,
  lastJobId: null,
  lastPollAt: null,
  lastError: null,
};

const workerId = `worker-${randomUUID()}`;
const app = createWorkerApp(state);
const server = http.createServer(app);
const exportWorker = new ExportWorkerService({
  exportJobsRepository: new ExportJobsRepository(),
  prescriptionsRepository: new PrescriptionsRepository(),
});

let shuttingDown = false;
let timer = null;

const schedulePoll = (delayMs) => {
  if (shuttingDown) return;
  timer = setTimeout(() => {
    timer = null;
    void poll();
  }, delayMs);
};

const poll = async () => {
  if (shuttingDown) return;

  state.lastPollAt = new Date().toISOString();

  try {
    const result = await exportWorker.processNext({
      workerId,
      leaseSeconds: env.EXPORT_JOB_LEASE_SECONDS,
      maxAttempts: env.EXPORT_JOB_MAX_ATTEMPTS,
    });

    state.ready = true;
    state.lastError = null;

    if (result?.job?.id) {
      state.lastJobId = result.job.id;
      state.processedJobs += 1;
      logger.info(
        {
          workerId,
          jobId: result.job.id,
          outcome: result.outcome,
        },
        'Worker processed export job'
      );
      schedulePoll(100);
      return;
    }
  } catch (error) {
    state.ready = false;
    state.lastError = error.message;
    logger.error({ err: error, workerId }, 'Worker poll failed');
  }

  schedulePoll(env.EXPORT_JOB_POLL_MS);
};

const start = async () => {
  await db.raw('select 1');
  state.ready = true;

  server.listen(env.WORKER_PORT, '0.0.0.0', () => {
    logger.info({ workerId, port: env.WORKER_PORT }, 'Worker started');
  });

  schedulePoll(0);
};

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal, workerId }, 'Worker shutdown initiated');
  if (timer) clearTimeout(timer);

  server.close(async () => {
    try {
      await db.destroy();
      logger.info({ workerId }, 'Worker DB pool closed');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error, workerId }, 'Worker failed to close DB pool');
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error({ workerId }, 'Worker forced shutdown');
    process.exit(1);
  }, 15000).unref();
};

start().catch((error) => {
  logger.error({ err: error, workerId }, 'Worker failed to start');
  process.exit(1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
