import { v4 as uuidv4 } from 'uuid';
import { db, localStore } from '../../config/database';
import { ENV } from '../../config/env';
import { LedgerEnvironment, withOrderedLocks } from './ledger.service';

export type OutboxJobType =
  | 'DPO_VERIFY_PAYMENT'
  | 'RECOVER_PENDING_PAYMENT'
  | 'PROCESS_CALLBACK'
  | 'EVALUATE_NO_SHOW_REFUNDS'
  | 'MONITOR_PAYOUT'
  | 'RUN_RECONCILIATION'
  | 'SEND_FINANCIAL_NOTIFICATION';

export type OutboxJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED_RETRY' | 'DEAD_LETTER';

export interface OutboxJobRecord {
  id: string;
  job_type: OutboxJobType;
  dedupe_key: string;
  payload: Record<string, any>;
  status: OutboxJobStatus;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  locked_at?: string;
  last_error?: string;
  environment: LedgerEnvironment;
  created_at: string;
  updated_at: string;
}

type JobHandler = (job: OutboxJobRecord) => Promise<void>;

export class FinancialOutboxService {
  private static handlers = new Map<OutboxJobType, JobHandler>();
  private static workerTimer: NodeJS.Timeout | null = null;

  public static registerHandler(jobType: OutboxJobType, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
  }

  /**
   * Idempotently enqueues a durable financial background job.
   */
  public static async enqueueJob(params: {
    jobType: OutboxJobType;
    dedupeKey: string;
    payload: Record<string, any>;
    maxAttempts?: number;
    delayMs?: number;
    environment?: LedgerEnvironment;
  }): Promise<OutboxJobRecord> {
    const {
      jobType,
      dedupeKey,
      payload,
      maxAttempts = 5,
      delayMs = 0,
      environment = (ENV.DPO_ENVIRONMENT || 'sandbox') as LedgerEnvironment,
    } = params;

    return withOrderedLocks([`outbox:${dedupeKey}`], async () => {
      for (const existing of localStore.financial_outbox.values()) {
        if (existing.dedupe_key === dedupeKey) {
          return existing as OutboxJobRecord;
        }
      }

      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const nextRunIso = new Date(now + Math.max(0, delayMs)).toISOString();
      const id = `job_${now}_${uuidv4().substring(0, 8)}`;

      const job: OutboxJobRecord = {
        id,
        job_type: jobType,
        dedupe_key: dedupeKey,
        payload,
        status: 'PENDING',
        attempts: 0,
        max_attempts: maxAttempts,
        next_run_at: nextRunIso,
        environment,
        created_at: nowIso,
        updated_at: nowIso,
      };

      localStore.financial_outbox.set(id, job);

      if (db.isPostgresConnected) {
        try {
          await db.query(
            `INSERT INTO financial_outbox (
               id, job_type, dedupe_key, payload, status, attempts, max_attempts, next_run_at, environment, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, 'PENDING', 0, $5, $6, $7, $8, $8)
             ON CONFLICT (dedupe_key) DO NOTHING`,
            [
              job.id,
              job.job_type,
              job.dedupe_key,
              JSON.stringify(job.payload || {}),
              job.max_attempts,
              job.next_run_at,
              job.environment,
              job.created_at,
            ]
          );
        } catch (_) {}
      }

      return job;
    });
  }

  /**
   * Recovers jobs left in PROCESSING state due to a worker crash or server restart.
   */
  public static async recoverStalledJobs(staleThresholdMs = 60_000): Promise<number> {
    let recovered = 0;
    const now = Date.now();

    for (const job of localStore.financial_outbox.values()) {
      if (job.status === 'PROCESSING') {
        const lockedTime = new Date(job.locked_at || job.updated_at).getTime();
        if (now - lockedTime >= staleThresholdMs) {
          job.status = 'FAILED_RETRY';
          job.next_run_at = new Date(now).toISOString();
          job.last_error = 'Recovered after worker crash or restart.';
          job.updated_at = new Date(now).toISOString();
          recovered++;
        }
      }
    }
    return recovered;
  }

  /**
   * Processes due outbox jobs safely without holding database transactions across external API calls.
   */
  public static async processDueJobs(limit = 50): Promise<{
    processed: number;
    succeeded: number;
    retried: number;
    deadLettered: number;
  }> {
    await this.recoverStalledJobs();

    const now = Date.now();
    const dueJobs = Array.from(localStore.financial_outbox.values())
      .filter(
        (j: OutboxJobRecord) =>
          (j.status === 'PENDING' || j.status === 'FAILED_RETRY') &&
          new Date(j.next_run_at).getTime() <= now
      )
      .slice(0, limit) as OutboxJobRecord[];

    let processed = 0;
    let succeeded = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const job of dueJobs) {
      await withOrderedLocks([`outbox:${job.dedupe_key}`], async () => {
        if (job.status === 'COMPLETED' || job.status === 'DEAD_LETTER') {
          return;
        }

        job.status = 'PROCESSING';
        job.attempts += 1;
        job.locked_at = new Date().toISOString();
        job.updated_at = job.locked_at;
        processed++;

        const handler = this.handlers.get(job.job_type);
        try {
          if (!handler) {
            throw new Error(`No registered handler for job_type ${job.job_type}`);
          }
          await handler(job);
          job.status = 'COMPLETED';
          job.updated_at = new Date().toISOString();
          succeeded++;
        } catch (err: any) {
          job.last_error = err?.message || 'Unknown worker execution error';
          job.updated_at = new Date().toISOString();
          if (job.attempts >= job.max_attempts) {
            job.status = 'DEAD_LETTER';
            deadLettered++;
          } else {
            job.status = 'FAILED_RETRY';
            const backoffMs = Math.min(300_000, 1000 * Math.pow(2, job.attempts));
            job.next_run_at = new Date(Date.now() + backoffMs).toISOString();
            retried++;
          }
        }

        if (db.isPostgresConnected) {
          try {
            await db.query(
              `UPDATE financial_outbox
               SET status = $1, attempts = $2, next_run_at = $3, last_error = $4, updated_at = CURRENT_TIMESTAMP
               WHERE id = $5`,
              [job.status, job.attempts, job.next_run_at, job.last_error || null, job.id]
            );
          } catch (_) {}
        }
      });
    }

    return { processed, succeeded, retried, deadLettered };
  }

  public static startWorker(intervalMs = 30_000): void {
    if (this.workerTimer || intervalMs <= 0) return;
    this.workerTimer = setInterval(() => {
      this.processDueJobs().catch((err) =>
        console.warn('[FinancialOutboxService] Worker tick notice:', err?.message)
      );
    }, intervalMs);
    this.workerTimer.unref?.();
  }

  public static getAllJobs(): OutboxJobRecord[] {
    return Array.from(localStore.financial_outbox.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  public static stopWorker(): void {
    if (this.workerTimer) clearInterval(this.workerTimer);
    this.workerTimer = null;
  }
}
