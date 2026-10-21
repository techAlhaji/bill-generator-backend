import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { FastifyInstance, FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { env } from './config/env.js';
import { logger } from './logger/index.js';
import { errorHandler } from './errors/problem-details.js';
import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { merchantRoutes } from './routes/merchant.routes.js';
import { clientsRoutes } from './routes/clients.routes.js';
import { invoicesRoutes } from './routes/invoices.routes.js';
import { publicRoutes } from './routes/public.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify(
    env.NODE_ENV === 'test'
      ? { logger: false }
      : { loggerInstance: logger as FastifyBaseLogger }
  );

  // 1. Centralized Error Handler
  app.setErrorHandler(errorHandler);

  // Content type parser: allow empty JSON bodies for parameterless POST/PUT requests
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim() === '')) {
      return done(null, {});
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // 2. Security Plugins
  await app.register(helmet, {
    contentSecurityPolicy: false, // Allow API consumers and public pay portal iframes
  });

  await app.register(cors, {
    origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // 3. Authentication Plugin
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  });

  // 4. OpenAPI Specification Route
  const openapiPath = resolve(__dirname, '../openapi.yaml');
  if (existsSync(openapiPath)) {
    const openapiContent = readFileSync(openapiPath, 'utf8');
    app.get('/openapi.yaml', async (_req, reply) => {
      return reply.type('text/yaml').send(openapiContent);
    });
    app.get('/api/v1/openapi.yaml', async (_req, reply) => {
      return reply.type('text/yaml').send(openapiContent);
    });
  }

  // 5. Register Routes
  // Health probes at root and under /api/v1
  await app.register(healthRoutes);
  await app.register(healthRoutes, { prefix: '/api/v1' });

  // API v1 Domain Routes
  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(merchantRoutes);
      await v1.register(clientsRoutes);
      await v1.register(invoicesRoutes);
      await v1.register(publicRoutes);
    },
    { prefix: '/api/v1' }
  );

  return app;
}
