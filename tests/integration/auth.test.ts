import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Keypair } from '@stellar/stellar-sdk';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';

describe('Merchant Authentication & Profile Endpoints', () => {
  let app: FastifyInstance;
  const testEmail = `merchant_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  const testStellarKey = Keypair.random();
  let authToken = '';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    // Cleanup created test records
    await prisma.merchant.deleteMany({
      where: { email: testEmail },
    });
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/register', () => {
    it('creates a new merchant and returns JWT token with merchant profile', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: testEmail,
          password: testPassword,
          businessName: 'Apex Dev Studio',
          stellarAddress: testStellarKey.publicKey(),
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.token).toBeDefined();
      expect(body.data.merchant.email).toBe(testEmail);
      expect(body.data.merchant.businessName).toBe('Apex Dev Studio');
      expect(body.data.merchant.stellarAddress).toBe(testStellarKey.publicKey());
      expect(body.data.merchant.passwordHash).toBeUndefined();

      authToken = body.data.token;
    });

    it('rejects duplicate email registration with 409 Conflict ProblemDetails', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: testEmail,
          password: testPassword,
          businessName: 'Another Business',
          stellarAddress: Keypair.random().publicKey(),
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('RESOURCE_CONFLICT');
      expect(body.status).toBe(409);
    });

    it('rejects weak password with 400 Validation Error ProblemDetails', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'weak@example.com',
          password: 'short',
          businessName: 'Weak Co',
          stellarAddress: Keypair.random().publicKey(),
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.invalidParams).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('authenticates valid credentials and issues JWT session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testEmail,
          password: testPassword,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.token).toBeDefined();
      expect(body.data.merchant.email).toBe(testEmail);
    });

    it('rejects incorrect password with 401 Unauthorized ProblemDetails', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testEmail,
          password: 'WrongPassword123!',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/auth/stellar-challenge', () => {
    it('generates a valid SEP-10 challenge transaction XDR', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/stellar-challenge',
        payload: {
          stellarAddress: testStellarKey.publicKey(),
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.transaction).toBeDefined();
      expect(typeof body.transaction).toBe('string');
      expect(body.networkPassphrase).toBeDefined();
    });
  });

  describe('Merchant Profile (Protected)', () => {
    it('returns 401 Unauthorized when accessing profile without JWT', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/merchant/profile',
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns merchant profile with valid Bearer token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/merchant/profile',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.email).toBe(testEmail);
      expect(body.data.businessName).toBe('Apex Dev Studio');
    });

    it('updates merchant profile preferences successfully', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/merchant/profile',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          businessName: 'Apex Dev Studio Global',
          settings: { defaultCurrency: 'XLM', notifyOnPayment: true },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.businessName).toBe('Apex Dev Studio Global');
      expect(body.data.settings.defaultCurrency).toBe('XLM');
    });
  });
});
