import { describe, it, expect } from 'vitest';
import {
  deriveOnchainInvoiceId,
  computeInvoiceContentHash,
  CanonicalInvoicePayload,
} from '../../src/utils/canonical.js';

describe('Canonical Hashing & Identifier Derivation', () => {
  it('derives deterministic on-chain invoice ID prefixed with 0x', () => {
    const merchantId = 'b6e12e3e-4b2a-4a5f-8c3b-123456789abc';
    const invoiceNumber = 'INV-2026-0001';

    const id1 = deriveOnchainInvoiceId(merchantId, invoiceNumber);
    const id2 = deriveOnchainInvoiceId(merchantId, invoiceNumber);

    expect(id1).toBe(id2);
    expect(id1.startsWith('0x')).toBe(true);
    expect(id1.length).toBe(66); // 0x + 64 hex characters (32 bytes)
  });

  it('computes deterministic RFC 8785 canonical hash regardless of key ordering', () => {
    const payload1: CanonicalInvoicePayload = {
      client: { name: 'Acme Corp', taxId: 'US-12345' },
      currency: 'XLM',
      dueDate: '2026-11-01',
      invoiceNumber: 'INV-2026-0001',
      issueDate: '2026-10-19',
      items: [
        { description: 'Dev Services', quantityScale4: '10000', unitPriceMinor: '500000000' },
      ],
      merchant: { businessName: 'DevStudio', stellarAddress: 'GB7BXYZ' },
      totalMinor: '500000000',
    };

    // Construct same payload with different key insertion order
    const payload2 = {
      totalMinor: '500000000',
      merchant: { stellarAddress: 'GB7BXYZ', businessName: 'DevStudio' },
      items: [
        { unitPriceMinor: '500000000', description: 'Dev Services', quantityScale4: '10000' },
      ],
      issueDate: '2026-10-19',
      invoiceNumber: 'INV-2026-0001',
      dueDate: '2026-11-01',
      currency: 'XLM',
      client: { taxId: 'US-12345', name: 'Acme Corp' },
    } as CanonicalInvoicePayload;

    const hash1 = computeInvoiceContentHash(payload1);
    const hash2 = computeInvoiceContentHash(payload2);

    expect(hash1).toBe(hash2);
    expect(hash1.startsWith('0x')).toBe(true);
    expect(hash1.length).toBe(66);
  });
});
