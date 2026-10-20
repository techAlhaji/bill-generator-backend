import { PrismaClient } from '@prisma/client';
import { logger } from '../logger/index.js';

// Ensure BigInt values serialize to JSON strings globally without throwing TypeError
if (typeof (BigInt.prototype as unknown as { toJSON?: () => string }).toJSON !== 'function') {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function () {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('error' as never, (e: unknown) => {
  logger.error({ err: e }, 'Prisma error encountered');
});

prisma.$on('warn' as never, (e: unknown) => {
  logger.warn({ warning: e }, 'Prisma warning encountered');
});
