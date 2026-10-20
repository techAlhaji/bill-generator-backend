import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Keypair } from '@stellar/stellar-sdk';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';

describe('Client Management Endpoints', () => {
  let app: FastifyInstance;
  let merchantToken = '';
  let otherMerchantToken = '';
  let clientId = '';

  let merchant1Email = '';
  let merchant2Email = '';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    merchant1Email = `merchant1_${Date.now()}@example.com`;
    merchant2Email = `merchant2_${Date.now()}@example.com`;

    // Register Merchant 1
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: merchant1Email,
        password: 'Password123!',
        businessName: 'Primary Merchant',
        stellarAddress: Keypair.random().publicKey(),
      },
    });
    merchantToken = JSON.parse(res1.payload).data.token;

    // Register Merchant 2 (for tenant isolation checks)
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: merchant2Email,
        password: 'Password123!',
        businessName: 'Secondary Merchant',
        stellarAddress: Keypair.random().publicKey(),
      },
    });
    otherMerchantToken = JSON.parse(res2.payload).data.token;
  });

  afterAll(async () => {
    await prisma.client.deleteMany({
      where: { merchant: { email: { in: [merchant1Email, merchant2Email] } } },
    });
    await prisma.merchant.deleteMany({
      where: { email: { in: [merchant1Email, merchant2Email] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('POST /api/v1/clients creates a new client scoped to merchant', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/clients',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        name: 'Stellar Foundation',
        email: 'partners@stellar.org',
        address: 'San Francisco, CA',
        taxId: 'US-12345678',
        notes: 'Strategic ecosystem partner',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBeDefined();
    expect(body.data.name).toBe('Stellar Foundation');
    expect(body.data.email).toBe('partners@stellar.org');

    clientId = body.data.id;
  });

  it('GET /api/v1/clients lists merchant clients with pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/clients?page=1&limit=10',
      headers: { authorization: `Bearer ${merchantToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.meta.totalCount).toBeGreaterThanOrEqual(1);
    expect(body.meta.page).toBe(1);
  });

  it('GET /api/v1/clients?search=stellar filters by name/email', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/clients?search=stellar',
      headers: { authorization: `Bearer ${merchantToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('Stellar Foundation');
  });

  it('GET /api/v1/clients/:id returns client details for owner', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/clients/${clientId}`,
      headers: { authorization: `Bearer ${merchantToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.id).toBe(clientId);
  });

  it('enforces tenant isolation: other merchant cannot access client', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/clients/${clientId}`,
      headers: { authorization: `Bearer ${otherMerchantToken}` },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('PUT /api/v1/clients/:id updates client information', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/clients/${clientId}`,
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        name: 'Stellar Development Foundation',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.name).toBe('Stellar Development Foundation');
  });

  it('DELETE /api/v1/clients/:id deletes client when no active invoices exist', async () => {
    // Create a temporary client to delete
    const tempRes = await app.inject({
      method: 'POST',
      url: '/api/v1/clients',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { name: 'Temp Client', email: 'temp@client.com' },
    });
    const tempId = JSON.parse(tempRes.payload).data.id;

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/clients/${tempId}`,
      headers: { authorization: `Bearer ${merchantToken}` },
    });

    expect(res.statusCode).toBe(204);

    const check = await app.inject({
      method: 'GET',
      url: `/api/v1/clients/${tempId}`,
      headers: { authorization: `Bearer ${merchantToken}` },
    });
    expect(check.statusCode).toBe(404);
  });
});
