import { FastifyReply, FastifyRequest } from 'fastify';
import { Errors } from '../errors/problem-details.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  stellarAddress: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    merchant: AuthenticatedUser;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = (await req.jwtVerify()) as {
      sub: string;
      email: string;
      stellarAddress: string;
    };

    req.merchant = {
      id: payload.sub,
      email: payload.email,
      stellarAddress: payload.stellarAddress,
    };
  } catch (err) {
    throw Errors.unauthorized('Invalid, missing, or expired JWT session token.');
  }
}
