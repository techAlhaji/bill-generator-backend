import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { UpdateMerchantProfileSchema } from '../modules/merchant/merchant.schemas.js';
import { merchantService } from '../modules/merchant/merchant.service.js';

export async function merchantRoutes(fastify: FastifyInstance) {
  fastify.get('/merchant/profile', { preHandler: requireAuth }, async (req, reply) => {
    const profile = await merchantService.getProfile(req.merchant.id);
    return reply.status(200).send({ data: profile });
  });

  fastify.put('/merchant/profile', { preHandler: requireAuth }, async (req, reply) => {
    const input = UpdateMerchantProfileSchema.parse(req.body);
    const updated = await merchantService.updateProfile(req.merchant.id, input);
    return reply.status(200).send({ data: updated });
  });
}
