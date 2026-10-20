import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { horizonClient } from '../../src/stellar/horizon.client.js';
import { sorobanClient } from '../../src/stellar/soroban.client.js';

describe('Health & Liveness Probes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    vi.spyOn(horizonClient, 'checkHealth').mockResolvedValue(true);
    vi.spyOn(sorobanClient, 'checkHealth').mockResolvedValue(true);
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /health returns 200 with status ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /api/v1/health returns 200 with status ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
  });

  it('GET /health/ready returns 200 with database connected', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ready');
    expect(body.database).toBe('connected');
  });
});
