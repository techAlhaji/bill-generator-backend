import bcrypt from 'bcryptjs';
import { Keypair, WebAuth, TransactionBuilder } from '@stellar/stellar-sdk';
import { prisma } from '../../db/prisma.js';
import { Errors } from '../../errors/problem-details.js';
import { env } from '../../config/env.js';
import { getNetworkPassphrase } from '../../stellar/config.js';
import {
  RegisterMerchantInput,
  LoginInput,
  StellarChallengeInput,
  StellarVerifyInput,
  AuthJwtPayload,
} from './auth.schemas.js';

export class AuthService {
  private serverKeypair: Keypair;

  constructor() {
    if (env.SERVER_SIGNER_SECRET_KEY) {
      try {
        this.serverKeypair = Keypair.fromSecret(env.SERVER_SIGNER_SECRET_KEY);
      } catch {
        this.serverKeypair = Keypair.random();
      }
    } else {
      this.serverKeypair = Keypair.random();
    }
  }

  /**
   * Register a new merchant with email, password, businessName, and stellarAddress
   */
  async register(input: RegisterMerchantInput) {
    const normalizedEmail = input.email.toLowerCase().trim();

    const existing = await prisma.merchant.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw Errors.conflict('A merchant account with this email address already exists.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(input.password, salt);

    const merchant = await prisma.merchant.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        businessName: input.businessName.trim(),
        stellarAddress: input.stellarAddress.trim(),
        settings: {},
      },
      select: {
        id: true,
        email: true,
        businessName: true,
        stellarAddress: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return merchant;
  }

  /**
   * Authenticate merchant with email & password
   */
  async login(input: LoginInput) {
    const normalizedEmail = input.email.toLowerCase().trim();

    const merchant = await prisma.merchant.findUnique({
      where: { email: normalizedEmail },
    });

    if (!merchant) {
      throw Errors.unauthorized('Invalid email or password credentials.');
    }

    const isMatch = await bcrypt.compare(input.password, merchant.passwordHash);
    if (!isMatch) {
      throw Errors.unauthorized('Invalid email or password credentials.');
    }

    return {
      id: merchant.id,
      email: merchant.email,
      businessName: merchant.businessName,
      stellarAddress: merchant.stellarAddress,
      settings: merchant.settings,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    };
  }

  /**
   * Request SEP-10 Web3 challenge transaction
   */
  async createStellarChallenge(input: StellarChallengeInput) {
    const networkPassphrase = getNetworkPassphrase();
    const serverHomeDomain = new URL(env.FRONTEND_URL).hostname;

    // Use official SEP-10 challenge utility from Stellar SDK
    const challengeXdr = WebAuth.buildChallengeTx(
      this.serverKeypair,
      input.stellarAddress,
      serverHomeDomain,
      300, // 5 minutes validity
      networkPassphrase,
      serverHomeDomain
    );

    return {
      transaction: challengeXdr,
      networkPassphrase,
    };
  }

  /**
   * Verify signed SEP-10 Web3 challenge transaction
   */
  async verifyStellarChallenge(input: StellarVerifyInput) {
    const networkPassphrase = getNetworkPassphrase();
    const serverHomeDomain = new URL(env.FRONTEND_URL).hostname;

    let signerAddress: string;

    try {
      const { clientAccountID } = WebAuth.readChallengeTx(
        input.signedTransaction,
        this.serverKeypair.publicKey(),
        networkPassphrase,
        serverHomeDomain,
        serverHomeDomain
      );
      signerAddress = clientAccountID;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid challenge transaction';
      throw Errors.unauthorized(`SEP-10 challenge verification failed: ${message}`);
    }

    // Look for existing merchant with this Stellar address or create a new merchant profile
    let merchant = await prisma.merchant.findFirst({
      where: { stellarAddress: signerAddress },
    });

    if (!merchant) {
      // Auto-provision merchant account for verified Stellar address
      const randomEmail = `${signerAddress.slice(0, 10).toLowerCase()}@stellarbills.local`;
      const dummyPasswordHash = await bcrypt.hash(Keypair.random().secret(), 10);

      merchant = await prisma.merchant.create({
        data: {
          email: randomEmail,
          passwordHash: dummyPasswordHash,
          businessName: `Merchant (${signerAddress.slice(0, 6)}...${signerAddress.slice(-4)})`,
          stellarAddress: signerAddress,
          settings: {},
        },
      });
    }

    return {
      id: merchant.id,
      email: merchant.email,
      businessName: merchant.businessName,
      stellarAddress: merchant.stellarAddress,
      settings: merchant.settings,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    };
  }
}

export const authService = new AuthService();
