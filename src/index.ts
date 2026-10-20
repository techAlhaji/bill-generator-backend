import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './logger/index.js';
import { prisma } from './db/prisma.js';

async function startServer() {
  try {
    const app = await buildApp();

    // Verify database connectivity on startup
    await prisma.$connect();
    logger.info('PostgreSQL database connection established successfully');

    await app.listen({ port: env.PORT, host: '0.0.0.0' });

    logger.info(
      {
        port: env.PORT,
        nodeEnv: env.NODE_ENV,
        stellarNetwork: env.STELLAR_NETWORK,
        horizonUrl: env.HORIZON_URL,
        sorobanRpcUrl: env.SOROBAN_RPC_URL,
      },
      `Stellar Bill Generator REST API listening at http://localhost:${env.PORT}`
    );

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      try {
        await app.close();
        await prisma.$disconnect();
        logger.info('Server and database connections closed cleanly.');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during server shutdown');
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.fatal({ err }, 'Failed to bootstrap backend application');
    process.exit(1);
  }
}

startServer();
