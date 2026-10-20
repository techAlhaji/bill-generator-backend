import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Keypair } from '@stellar/stellar-sdk';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { horizonClient } from '../../src/stellar/horizon.client.js';
import { sorobanClient } from '../../src/stellar/soroban.client.js';

describe('Public Invoice Portal & Payment Verification Engine', () => {
  let app: FastifyInstance;
  let merchantToken = '';
  let merchantStellarAddress = '';
  let clientId = '';

  let draftPublicToken = '';
  let issuedPublicToken = '';
  let issuedInvoiceId = '';
  let requiredAmountStroops = '15000000'; // 1.5 XLM
  let memoText = '';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    merchantStellarAddress = Keypair.random().publicKey();

    // Register merchant
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `pay_merchant_${Date.now()}@example.com`,
        password: 'Password123!',
        businessName: 'Decentralized Merchant LLC',
        stellarAddress: merchantStellarAddress,
      },
    });
    merchantToken = JSON.parse(regRes.payload).data.token;

    // Create client
    const clientRes = await app.inject({
      method: 'POST',
      url: '/api/v1/clients',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        name: 'Private Client',
        email: 'private@client.org',
        address: '100 Secret Vault Way',
        taxId: 'US-CONFIDENTIAL',
        notes: 'Strictly confidential internal client note',
      },
    });
    clientId = JSON.parse(clientRes.payload).data.id;

    // Create Draft Invoice
    const draftRes = await app.inject({
      method: 'POST',
      url: '/api/v1/invoices',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        clientId,
        currencyType: 'NATIVE_XLM',
        assetCode: 'XLM',
        notes: 'Secret internal merchant memo for draft',
        issueDate: '2026-10-20',
        dueDate: '2026-11-20',
        items: [
          {
            description: 'Audit Consulting',
            quantityScale4: '10000',
            unitPriceMinor: '10000000',
          },
        ],
      },
    });
    draftPublicToken = JSON.parse(draftRes.payload).data.publicToken;

    // Create Issued Invoice
    const issuedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/invoices',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        clientId,
        currencyType: 'NATIVE_XLM',
        assetCode: 'XLM',
        notes: 'Secret internal merchant memo',
        issueDate: '2026-10-20',
        dueDate: '2026-11-20',
        items: [
          {
            description: 'Engineering Services',
            quantityScale4: '15000', // 1.5 units
            unitPriceMinor: '10000000', // 1.0 XLM = 15,000,000 stroops
          },
        ],
      },
    });
    const issuedData = JSON.parse(issuedRes.payload).data;
    issuedInvoiceId = issuedData.id;
    issuedPublicToken = issuedData.publicToken;
    memoText = issuedData.memoText;

    // Transition to ISSUED
    await app.inject({
      method: 'POST',
      url: `/api/v1/invoices/${issuedInvoiceId}/issue`,
      headers: { authorization: `Bearer ${merchantToken}` },
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.auditLog.deleteMany({ where: { invoice: { merchant: { email: { contains: 'example.com' } } } } });
    await prisma.payment.deleteMany({ where: { invoice: { merchant: { email: { contains: 'example.com' } } } } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { merchant: { email: { contains: 'example.com' } } } } });
    await prisma.invoice.deleteMany({ where: { merchant: { email: { contains: 'example.com' } } } });
    await prisma.client.deleteMany({ where: { merchant: { email: { contains: 'example.com' } } } });
    await prisma.merchant.deleteMany({ where: { email: { contains: 'example.com' } } });
    await app.close();
    await prisma.$disconnect();
  });

  describe('Public Invoice Retrieval & Privacy Controls', () => {
    it('returns 404 for DRAFT invoices on public endpoint', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/public/invoices/${draftPublicToken}`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns sanitized public invoice view stripping private merchant and customer data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/public/invoices/${issuedPublicToken}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const data = body.data;

      expect(data.invoiceNumber).toBeDefined();
      expect(data.status).toBe('ISSUED');
      expect(data.merchantBusinessName).toBe('Decentralized Merchant LLC');
      expect(data.merchantStellarAddress).toBe(merchantStellarAddress);
      expect(data.clientName).toBe('Private Client');
      expect(data.totalMinor).toBe('15000000');
      expect(data.amountStroops).toBe('15000000');

      // Privacy checks: private fields MUST NOT be exposed!
      expect(data.merchantId).toBeUndefined();
      expect(data.clientId).toBeUndefined();
      expect(data.clientAddress).toBeUndefined();
      expect(data.clientTaxId).toBeUndefined();
      expect(data.notes).toBeUndefined();
      expect(data.internalNotes).toBeUndefined();
    });

    it('returns lightweight status via GET /public/invoices/:token/status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/public/invoices/${issuedPublicToken}/status`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe('ISSUED');
      expect(body.paidAt).toBeNull();
      expect(body.txHash).toBeNull();
    });

    it('downloads public invoice PDF via GET /public/invoices/:token/pdf', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/public/invoices/${issuedPublicToken}/pdf`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.rawPayload.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('Payment Verification: Stellar Classic Pathway (Horizon)', () => {
    const validTxHash = randomBytes(32).toString('hex');
    const underpaidTxHash = randomBytes(32).toString('hex');
    const wrongMemoTxHash = randomBytes(32).toString('hex');
    const wrongRecipientTxHash = randomBytes(32).toString('hex');
    const wrongAssetTxHash = randomBytes(32).toString('hex');

    it('rejects verification when transaction memo does not match invoice', async () => {
      vi.spyOn(horizonClient, 'getTransaction').mockResolvedValueOnce({
        successful: true,
        ledger_attr: 123456,
        memo: 'WRONG-MEMO-XYZ',
      } as any);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/public/invoices/${issuedPublicToken}/verify-payment`,
        payload: {
          transactionHash: wrongMemoTxHash,
          paymentMethod: 'STELLAR_CLASSIC',
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('PAYMENT_WRONG_MEMO');
    });

    it('rejects verification when payment recipient does not match merchant address', async () => {
      vi.spyOn(horizonClient, 'getTransaction').mockResolvedValueOnce({
        successful: true,
        ledger_attr: 123456,
        memo: memoText,
      } as any);

      vi.spyOn(horizonClient, 'getOperations').mockResolvedValueOnce([
        {
          type: 'payment',
          to: Keypair.random().publicKey(), // Someone else!
          asset_type: 'native',
          amount: '1.5000000',
        } as any,
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/public/invoices/${issuedPublicToken}/verify-payment`,
        payload: {
          transactionHash: wrongRecipientTxHash,
          paymentMethod: 'STELLAR_CLASSIC',
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('PAYMENT_WRONG_RECIPIENT');
    });

    it('rejects verification when asset is not native XLM for an XLM invoice', async () => {
      vi.spyOn(horizonClient, 'getTransaction').mockResolvedValueOnce({
        successful: true,
        ledger_attr: 123456,
        memo: memoText,
      } as any);

      vi.spyOn(horizonClient, 'getOperations').mockResolvedValueOnce([
        {
          type: 'payment',
          to: merchantStellarAddress,
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: Keypair.random().publicKey(),
          amount: '1.5000000',
        } as any,
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/public/invoices/${issuedPublicToken}/verify-payment`,
        payload: {
          transactionHash: wrongAssetTxHash,
          paymentMethod: 'STELLAR_CLASSIC',
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('PAYMENT_WRONG_ASSET');
    });

    it('records UNDERPAID payment attempt in database when transferred amount is insufficient', async () => {
      vi.spyOn(horizonClient, 'getTransaction').mockResolvedValueOnce({
        successful: true,
        ledger_attr: 123456,
        memo: memoText,
      } as any);

      vi.spyOn(horizonClient, 'getOperations').mockResolvedValueOnce([
        {
          type: 'payment',
          to: merchantStellarAddress,
          asset_type: 'native',
          amount: '0.5000000', // Only 0.5 XLM instead of 1.5 XLM!
          source_account: Keypair.random().publicKey(),
        } as any,
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/public/invoices/${issuedPublicToken}/verify-payment`,
        payload: {
          transactionHash: underpaidTxHash,
          paymentMethod: 'STELLAR_CLASSIC',
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('PAYMENT_UNDERPAID');

      // Verify payment record in DB has status UNDERPAID
      const recordedPayment = await prisma.payment.findUnique({
        where: { txHash: underpaidTxHash },
      });
      expect(recordedPayment).not.toBeNull();
      expect(recordedPayment?.status).toBe('UNDERPAID');

      // Invoice status must NOT be changed to PAID
      const invoice = await prisma.invoice.findUnique({
        where: { id: issuedInvoiceId },
      });
      expect(invoice?.status).toBe('ISSUED');
    });

    it('verifies valid transaction, settles invoice to PAID, and emits payment confirmation', async () => {
      const payerAddress = Keypair.random().publicKey();

      vi.spyOn(horizonClient, 'getTransaction').mockResolvedValueOnce({
        successful: true,
        ledger_attr: 987654,
        memo: memoText,
        source_account: payerAddress,
      } as any);

      vi.spyOn(horizonClient, 'getOperations').mockResolvedValueOnce([
        {
          type: 'payment',
          to: merchantStellarAddress,
          asset_type: 'native',
          amount: '1.5000000', // Exactly 15,000,000 stroops
          source_account: payerAddress,
        } as any,
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/public/invoices/${issuedPublicToken}/verify-payment`,
        payload: {
          transactionHash: validTxHash,
          paymentMethod: 'STELLAR_CLASSIC',
          payerWalletAddress: payerAddress,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('CONFIRMED');
      expect(body.data.invoiceStatus).toBe('PAID');
      expect(body.data.transactionHash).toBe(validTxHash);

      // Verify DB invoice state updated to PAID
      const invoice = await prisma.invoice.findUnique({
        where: { id: issuedInvoiceId },
      });
      expect(invoice?.status).toBe('PAID');
      expect(invoice?.paidAt).not.toBeNull();
      expect(invoice?.onchainTxHash).toBe(validTxHash);

      // Verify payments table record
      const payment = await prisma.payment.findUnique({
        where: { txHash: validTxHash },
      });
      expect(payment?.status).toBe('CONFIRMED');
      expect(payment?.ledgerSequence).toBe(987654);
    });

    it('idempotency: verifies same transaction hash returns confirmed status without duplicates', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/public/invoices/${issuedPublicToken}/verify-payment`,
        payload: {
          transactionHash: validTxHash,
          paymentMethod: 'STELLAR_CLASSIC',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('CONFIRMED');
    });

    it('replay protection: rejects attempting to redeem same transaction hash for another invoice with 409 Conflict', async () => {
      // Create a second invoice
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/invoices',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          clientId,
          issueDate: '2026-10-20',
          dueDate: '2026-11-20',
          items: [{ description: 'Second Job', quantityScale4: '10000', unitPriceMinor: '10000000' }],
        },
      });
      const secondInvoice = JSON.parse(res2.payload).data;

      // Issue the second invoice
      await app.inject({
        method: 'POST',
        url: `/api/v1/invoices/${secondInvoice.id}/issue`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });

      // Attempt to submit validTxHash (which belongs to first invoice) for second invoice
      const replayRes = await app.inject({
        method: 'POST',
        url: `/api/v1/public/invoices/${secondInvoice.publicToken}/verify-payment`,
        payload: {
          transactionHash: validTxHash, // Already redeemed hash!
          paymentMethod: 'STELLAR_CLASSIC',
        },
      });

      expect(replayRes.statusCode).toBe(409);
      const body = JSON.parse(replayRes.payload);
      expect(body.code).toBe('RESOURCE_CONFLICT');
    });
  });

  describe('Payment Verification: Soroban Token Pathway (Soroban RPC)', () => {
    const sorobanTxHash = randomBytes(32).toString('hex');
    let sorobanInvoicePublicToken = '';

    beforeAll(async () => {
      // Create a Soroban token invoice
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/invoices',
        headers: { authorization: `Bearer ${merchantToken}` },
        payload: {
          clientId,
          currencyType: 'SOROBAN_TOKEN',
          assetCode: 'USDC',
          tokenContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          issueDate: '2026-10-20',
          dueDate: '2026-11-20',
          items: [{ description: 'Soroban Token Payment', quantityScale4: '10000', unitPriceMinor: '50000000' }],
        },
      });
      const data = JSON.parse(res.payload).data;
      sorobanInvoicePublicToken = data.publicToken;

      await app.inject({
        method: 'POST',
        url: `/api/v1/invoices/${data.id}/issue`,
        headers: { authorization: `Bearer ${merchantToken}` },
      });
    });

    it('verifies successful Soroban contract payment via RPC response', async () => {
      vi.spyOn(sorobanClient, 'getTransaction').mockResolvedValueOnce({
        status: 'SUCCESS',
        ledger: 555666,
      } as any);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/public/invoices/${sorobanInvoicePublicToken}/verify-payment`,
        payload: {
          transactionHash: sorobanTxHash,
          paymentMethod: 'SOROBAN_TOKEN',
          payerWalletAddress: Keypair.random().publicKey(),
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('CONFIRMED');
      expect(body.data.invoiceStatus).toBe('PAID');
    });
  });
});
