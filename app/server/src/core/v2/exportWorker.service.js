class ExportWorkerService {
  constructor({ exportJobsRepository, prescriptionsRepository }) {
    this.exportJobsRepository = exportJobsRepository;
    this.prescriptionsRepository = prescriptionsRepository;
  }

  async processNext({ workerId, leaseSeconds, maxAttempts, now = new Date() }) {
    const job = await this.exportJobsRepository.claimNextRunnable({
      workerId,
      leaseSeconds,
      now,
    });

    if (!job) {
      return null;
    }

    try {
      const prescription = await this.prescriptionsRepository.findById(job.prescriptionId, {
        doctorId: job.doctorId,
      });

      if (!prescription) {
        const error = new Error('Prescription not found during export processing');
        error.retryable = false;
        throw error;
      }

      const payload = {
        generatedAt: now.toISOString(),
        format: job.format,
        prescription,
      };

      const completedJob = await this.exportJobsRepository.markCompleted(job.id, {
        workerId,
        resultPayload: payload,
        contentType: 'application/json',
        fileName: `prescription-${prescription.id}-export.json`,
        now,
      });

      return { outcome: 'completed', job: completedJob };
    } catch (error) {
      const terminalAttempt = error.retryable === false || job.attemptCount >= maxAttempts;

      if (terminalAttempt) {
        const failedJob = await this.exportJobsRepository.markFailed(job.id, {
          workerId,
          errorMessage: error.message,
          now,
        });
        return { outcome: 'failed', job: failedJob, error };
      }

      const retryDelayMs = Math.min(60000, 5000 * (2 ** Math.max(job.attemptCount - 1, 0)));
      const retryAt = new Date(now.getTime() + retryDelayMs);
      const retriedJob = await this.exportJobsRepository.markRetry(job.id, {
        workerId,
        retryAt,
        errorMessage: error.message,
        now,
      });

      return { outcome: 'retry', job: retriedJob, error };
    }
  }
}

module.exports = { ExportWorkerService };
