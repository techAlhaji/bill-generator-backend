import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReconciliationService } from '../../src/modules/reconciliation/reconciliation.service.js';
import { prisma } from '../../src/db/prisma.js';

describe('Reconciliation & Background Recovery Engine', () => {
  let service: ReconciliationService;

  beforeEach(() => {
    service = new ReconciliationService();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    service.stop();
  });

  it('initializes with default clean stats', () => {
    const stats = service.getStats();
    expect(stats.isRunning).toBe(false);
    expect(stats.lastError).toBeNull();
    expect(stats.consecutiveFailures).toBe(0);
    expect(stats.totalOverdueReconciled).toBe(0);
  });

  it('successfully transitions overdue invoices and updates metrics', async () => {
    const mockOverdueInvoices = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        invoiceNumber: 'INV-2026-0001',
        merchantId: '22222222-2222-2222-2222-222222222222',
        dueDate: new Date('2026-10-01'),
      },
    ];

    vi.spyOn(prisma.invoice, 'findMany').mockResolvedValue(mockOverdueInvoices as any);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx = {
        invoice: { update: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(mockTx);
    });

    const result = await service.runCycle(new Date('2026-10-21'));
    expect(result.success).toBe(true);
    expect(result.transitioned).toBe(1);

    const stats = service.getStats();
    expect(stats.lastSuccessAt).toBeDefined();
    expect(stats.lastError).toBeNull();
    expect(stats.consecutiveFailures).toBe(0);
    expect(stats.totalOverdueReconciled).toBe(1);
  });

  it('recovers gracefully from database/network failure without crashing', async () => {
    // Simulate database network timeout / connection loss
    vi.spyOn(prisma.invoice, 'findMany').mockRejectedValue(
      new Error('Connection terminated unexpectedly: P1001')
    );

    const result = await service.runCycle();
    expect(result.success).toBe(false);
    expect(result.transitioned).toBe(0);
    expect(result.error).toContain('Connection terminated unexpectedly');

    const stats = service.getStats();
    expect(stats.lastError).toContain('Connection terminated unexpectedly');
    expect(stats.consecutiveFailures).toBe(1);
    expect(stats.isRunning).toBe(false);
  });

  it('resets consecutive failures and error state once service recovers', async () => {
    // 1. First run fails
    vi.spyOn(prisma.invoice, 'findMany').mockRejectedValueOnce(
      new Error('Temporary 503 Service Unavailable')
    );
    await service.runCycle();
    expect(service.getStats().consecutiveFailures).toBe(1);
    expect(service.getStats().lastError).toBe('Temporary 503 Service Unavailable');

    // 2. Second run succeeds after network recovery
    vi.spyOn(prisma.invoice, 'findMany').mockResolvedValueOnce([]);
    const recoveryResult = await service.runCycle();

    expect(recoveryResult.success).toBe(true);
    const recoveredStats = service.getStats();
    expect(recoveredStats.consecutiveFailures).toBe(0);
    expect(recoveredStats.lastError).toBeNull();
    expect(recoveredStats.lastSuccessAt).toBeDefined();
  });
});
