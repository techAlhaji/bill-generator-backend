import { InvoiceStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../logger/index.js';

export interface ReconciliationStats {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  totalOverdueReconciled: number;
  isRunning: boolean;
}

export class ReconciliationService {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private stats: ReconciliationStats = {
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    totalOverdueReconciled: 0,
    isRunning: false,
  };

  /**
   * Scans for ISSUED invoices whose due date has passed, and transitions them to OVERDUE.
   * Emits audit log entries for full traceability.
   */
  async reconcileOverdueInvoices(asOfDate: Date = new Date()): Promise<number> {
    const todayStr = asOfDate.toISOString().split('T')[0];
    const today = new Date(todayStr);

    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.ISSUED,
        dueDate: {
          lt: today,
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        merchantId: true,
        dueDate: true,
      },
    });

    if (overdueInvoices.length === 0) {
      return 0;
    }

    let transitionedCount = 0;

    for (const inv of overdueInvoices) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.invoice.update({
            where: { id: inv.id },
            data: { status: InvoiceStatus.OVERDUE },
          });

          await tx.auditLog.create({
            data: {
              invoiceId: inv.id,
              action: 'STATUS_CHANGED',
              fromStatus: 'ISSUED',
              toStatus: 'OVERDUE',
              actorType: 'SYSTEM',
              actorId: 'reconciliation-worker',
              metadata: {
                reason: 'Invoice due date elapsed',
                dueDate: inv.dueDate.toISOString().split('T')[0],
                reconciledAt: asOfDate.toISOString(),
              },
            },
          });
        });

        transitionedCount++;
        logger.info(
          { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber },
          'Invoice automatically transitioned to OVERDUE by reconciliation worker'
        );
      } catch (err) {
        logger.error(
          { err, invoiceId: inv.id },
          'Failed to transition individual invoice to OVERDUE; continuing batch'
        );
      }
    }

    return transitionedCount;
  }

  /**
   * Executes a full reconciliation cycle.
   * Fully fault-tolerant: Catches any database or network exception, records diagnostic telemetry,
   * and preserves application stability.
   */
  async runCycle(asOfDate: Date = new Date()): Promise<{ success: boolean; transitioned: number; error?: string }> {
    if (this.isRunning) {
      logger.debug('Reconciliation cycle already in progress; skipping duplicate trigger.');
      return { success: false, transitioned: 0, error: 'Reconciliation already in progress' };
    }

    this.isRunning = true;
    this.stats.isRunning = true;
    this.stats.lastRunAt = new Date().toISOString();

    try {
      const transitioned = await this.reconcileOverdueInvoices(asOfDate);

      // Successfully finished cycle: reset error state
      this.stats.lastSuccessAt = new Date().toISOString();
      this.stats.lastError = null;
      this.stats.consecutiveFailures = 0;
      this.stats.totalOverdueReconciled += transitioned;

      return { success: true, transitioned };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.stats.lastError = errorMessage;
      this.stats.consecutiveFailures += 1;

      logger.warn(
        {
          err,
          consecutiveFailures: this.stats.consecutiveFailures,
        },
        'Reconciliation cycle encountered a transient error and recovered'
      );

      return { success: false, transitioned: 0, error: errorMessage };
    } finally {
      this.isRunning = false;
      this.stats.isRunning = false;
    }
  }

  /**
   * Returns runtime metrics and health status of the reconciliation service.
   */
  getStats(): ReconciliationStats {
    return { ...this.stats };
  }

  /**
   * Resets statistics (useful for automated testing)
   */
  resetStats(): void {
    this.stats = {
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      consecutiveFailures: 0,
      totalOverdueReconciled: 0,
      isRunning: false,
    };
  }

  /**
   * Starts periodic reconciliation background timer.
   */
  start(intervalMs = 60000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runCycle().catch((err) => {
        logger.error({ err }, 'Unhandled error in reconciliation timer');
      });
    }, intervalMs);
    logger.info({ intervalMs }, 'Background reconciliation service scheduled');
  }

  /**
   * Stops periodic reconciliation background timer.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Background reconciliation service stopped');
    }
  }
}

export const reconciliationService = new ReconciliationService();
