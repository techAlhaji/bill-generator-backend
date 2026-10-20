import { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { horizonClient } from '../stellar/horizon.client.js';
import { sorobanClient } from '../stellar/soroban.client.js';
import { Errors } from '../errors/problem-details.js';

export async function healthRoutes(fastify: FastifyInstance) {
  // Liveness health check
  fastify.get('/health', async (_req, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness probe verifying DB, Horizon, and Soroban RPC
  fastify.get('/health/ready', async (_req, reply) => {
    let dbStatus = 'disconnected';
    let horizonStatus = 'disconnected';
    let sorobanStatus = 'disconnected';

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'error';
    }

    try {
      const isHorizonHealthy = await horizonClient.checkHealth();
      horizonStatus = isHorizonHealthy ? 'connected' : 'error';
    } catch {
      horizonStatus = 'error';
    }

    try {
      const isSorobanHealthy = await sorobanClient.checkHealth();
      sorobanStatus = isSorobanHealthy ? 'connected' : 'error';
    } catch {
      sorobanStatus = 'error';
    }

    const isAllReady = dbStatus === 'connected';

    if (!isAllReady) {
      throw Errors.serviceUnavailable('Database dependency is not ready to accept traffic.');
    }

    return reply.status(200).send({
      status: 'ready',
      database: dbStatus,
      horizon: horizonStatus,
      sorobanRpc: sorobanStatus,
    });
  });
}
