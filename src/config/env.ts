import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  STELLAR_NETWORK: z.enum(['TESTNET', 'PUBLIC', 'STANDALONE']).default('TESTNET'),
  STELLAR_NETWORK_PASSPHRASE: z
    .string()
    .default('Test SDF Network ; September 2015'),
  HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
  SOROBAN_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  INVOICE_REGISTRY_CONTRACT_ID: z.string().default('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  SERVER_SIGNER_SECRET_KEY: z
    .string()
    .regex(/^S[A-Z2-7]{55}$/, 'Invalid Stellar secret key format')
    .optional(),
  ASSET_ALLOWLIST: z.string().default('*'),
  CORS_ORIGIN: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_TIME_WINDOW: z.string().default('1 minute'),
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const formattedErrors = error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    console.error(`\x1b[31m[CONFIG ERROR] Invalid environment configuration:\x1b[0m\n${formattedErrors}`);
  } else {
    console.error('\x1b[31m[CONFIG ERROR] Unexpected error parsing environment config:\x1b[0m', error);
  }
  process.exit(1);
}

export const env = parsedEnv;
