import { describe, it, expect } from 'vitest';
import { generateInvoicePdf, InvoicePdfData } from '../../src/utils/pdf.js';

describe('PDF Generation Utility', () => {
  it('generates a valid binary PDF buffer with %PDF- header', async () => {
    const mockData: InvoicePdfData = {
      invoiceNumber: 'INV-2026-0001',
      status: 'ISSUED',
      issueDate: '2026-10-19',
      dueDate: '2026-11-01',
      currencyType: 'NATIVE_XLM',
      assetCode: 'XLM',
      subtotalMinor: 50_000_000n,
      taxRateBps: 500,
      taxMinor: 2_500_000n,
      discountMinor: 0n,
      totalMinor: 52_500_000n,
      amountStroops: 52_500_000n,
      memoText: 'INV-2026-0001',
      contentHash: '0x3389e9f1680a379f3d15c48111ec8b4576978160b41fa1433065a636304b295a',
      merchant: {
        businessName: 'Stellar Tech Labs',
        stellarAddress: 'GB7B2W5M3SVJ4XFPOZ7M24TKG4N3VR4J3T7PZ3K8G2M3B5V6X7Y8Z9AB',
        email: 'billing@stellartech.io',
      },
      client: {
        name: 'Acme International',
        email: 'finance@acme.org',
        address: '123 Market St, San Francisco, CA',
        taxId: 'US-987654321',
      },
      items: [
        {
          description: 'Smart Contract Audit Services',
          quantityScale4: 10_000n,
          unitPriceMinor: 50_000_000n,
          totalMinor: 50_000_000n,
        },
      ],
    };

    const buffer = await generateInvoicePdf(mockData);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);

    // Verify PDF header magic bytes "%PDF-"
    const header = buffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });
});
