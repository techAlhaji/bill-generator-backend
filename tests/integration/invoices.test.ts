import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Keypair } from '@stellar/stellar-sdk';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';

describe('Invoice Management & Lifecycle Rules', () => {
  let app: FastifyInstance;
  let merchantToken = '';
  let clientId = '';
  let draftInvoiceId = '';
  let issuedInvoiceId = '';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register test merchant
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `invoice_merchant_${Date.now()}@example.com`,
        password: 'Password123!',
        businessName: 'Decentralized Invoicing Inc.',
        stellarAddress: Keypair.random().publicKey(),
      },
    });
    merchantToken = JSON.parse(regRes.payload).data.token;

    // Create a client for the merchant
    const clientRes = await app.inject({
      method: 'POST',
      url: '/api/v1/clients',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        name: 'Web3 Client Corp',
        email: 'billing@web3client.com',
      },
    });
    clientId = JSON.parse(clientRes.payload).data.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { invoice: { merchant: { email: { contains: 'example.com' } } } } });
    await prisma.payment.deleteMany({ where: { invoice: { merchant: { email: { contains: 'example.com' } } } } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { merchant: { email: { contains: 'example.com' } } } } });
    await prisma.invoice.deleteMany({ where: { merchant: { email: { contains: 'example.com' } } } });
    await prisma.client.deleteMany({ where: { merchant: { email: { contains: 'example.com' } } } });
    await prisma.merchant.deleteMany({ where: { email: { contains: 'example.com' } } });
    await app.close();
    await prisma.$disconnect();
  });

  describe('Invoice Creation & Validation', () => {
    it('creates an invoice with integer minor unit math and sequential numbering', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/invoices',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          clientId,
          currencyType: 'NATIVE_XLM',
          assetCode: 'XLM',
          taxRateBps: 500, // 5%
          discountMinor: '1000000', // 0.1 XLM discount
          issueDate: '2026-10-20',
          dueDate: '2026-11-20',
          items: [
            {
              description: 'Frontend Architecture Review',
              quantityScale4: '20000', // 2 units
              unitPriceMinor: '10000000', // 1 XLM each = 2 XLM subtotal (20,000,000 stroops)
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBeDefined();
      expect(body.data.status).toBe('DRAFT');
      expect(body.data.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
      expect(body.data.publicToken).toMatch(/^pub_/);
      expect(body.data.contentHash).toMatch(/^0x[0-9a-f]{64}$/);

      // Calculations check:
      // Subtotal = 20,000,000
      // Tax (5%) = 1,000,000
      // Discount = 1,000,000
      // Total = 20,000,000
      expect(body.data.subtotalMinor).toBe('20000000');
      expect(body.data.taxMinor).toBe('1000000');
      expect(body.data.discountMinor).toBe('1000000');
      expect(body.data.totalMinor).toBe('20000000');
      expect(body.data.amountStroops).toBe('20000000');

      draftInvoiceId = body.data.id;
    });

    it('rejects invoice when due date precedes issue date with 400 ProblemDetails', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/invoices',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          clientId,
          issueDate: '2026-10-20',
          dueDate: '2026-10-15', // Past due date!
          items: [
            {
              description: 'Consulting',
              quantityScale4: '10000',
              unitPriceMinor: '5000000',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invoice with empty line items', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/invoices',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          clientId,
          issueDate: '2026-10-20',
          dueDate: '2026-11-20',
          items: [],
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Invoice Editing & Lifecycle State Transitions', () => {
    it('allows updating a DRAFT invoice and recomputes totals', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/invoices/${draftInvoiceId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          items: [
            {
              description: 'Updated Scope Services',
              quantityScale4: '30000', // 3 units
              unitPriceMinor: '10000000', // 1 XLM = 30,000,000 stroops
            },
          ],
          discountMinor: '0',
          taxRateBps: 0,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.subtotalMinor).toBe('30000000');
      expect(body.data.totalMinor).toBe('30000000');
    });

    it('transitions DRAFT to ISSUED via POST /invoices/:id/issue', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/invoices/${draftInvoiceId}/issue`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('ISSUED');
      expect(body.data.contentHash).toBeDefined();

      issuedInvoiceId = draftInvoiceId;
    });

    it('prohibits editing an invoice once ISSUED with 409 Conflict', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/invoices/${issuedInvoiceId}`,
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          notes: 'Attempting to change after issuance',
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('INVOICE_NOT_EDITABLE');
    });

    it('cancels an issued invoice via POST /invoices/:id/cancel', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/invoices/${issuedInvoiceId}/cancel`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('CANCELLED');
    });

    it('GET /invoices/:id/pdf streams valid PDF binary', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/invoices/${issuedInvoiceId}/pdf`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.rawPayload.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('GET /invoices/:id/audit-logs returns full lifecycle history', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/invoices/${issuedInvoiceId}/audit-logs`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(3);
      const actions = body.data.map((l: any) => l.action);
      expect(actions).toContain('CREATED');
      expect(actions).toContain('ISSUED');
      expect(actions).toContain('CANCELLED');
    });
  });
});
