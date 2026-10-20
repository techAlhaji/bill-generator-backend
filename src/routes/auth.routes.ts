import { FastifyInstance } from 'fastify';
import {
  RegisterMerchantSchema,
  LoginSchema,
  StellarChallengeSchema,
  StellarVerifySchema,
} from '../modules/auth/auth.schemas.js';
import { authService } from '../modules/auth/auth.service.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/register', async (req, reply) => {
    const input = RegisterMerchantSchema.parse(req.body);
    const merchant = await authService.register(input);

    const token = fastify.jwt.sign({
      sub: merchant.id,
      email: merchant.email,
      stellarAddress: merchant.stellarAddress,
    });

    return reply.status(201).send({
      data: {
        token,
        merchant,
      },
    });
  });

  fastify.post('/auth/login', async (req, reply) => {
    const input = LoginSchema.parse(req.body);
    const merchant = await authService.login(input);

    const token = fastify.jwt.sign({
      sub: merchant.id,
      email: merchant.email,
      stellarAddress: merchant.stellarAddress,
    });

    return reply.status(200).send({
      data: {
        token,
        merchant,
      },
    });
  });

  fastify.post('/auth/stellar-challenge', async (req, reply) => {
    const input = StellarChallengeSchema.parse(req.body);
    const challenge = await authService.createStellarChallenge(input);

    return reply.status(200).send(challenge);
  });

  fastify.post('/auth/stellar-verify', async (req, reply) => {
    const input = StellarVerifySchema.parse(req.body);
    const merchant = await authService.verifyStellarChallenge(input);

    const token = fastify.jwt.sign({
      sub: merchant.id,
      email: merchant.email,
      stellarAddress: merchant.stellarAddress,
    });

    return reply.status(200).send({
      data: {
        token,
        merchant,
      },
    });
  });
}
