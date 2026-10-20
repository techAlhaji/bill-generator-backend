import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
  CreateClientSchema,
  UpdateClientSchema,
  PaginationQuerySchema,
  IdParamSchema,
} from '../modules/clients/clients.schemas.js';
import { clientsService } from '../modules/clients/clients.service.js';

export async function clientsRoutes(fastify: FastifyInstance) {
  fastify.get('/clients', { preHandler: requireAuth }, async (req, reply) => {
    const query = PaginationQuerySchema.parse(req.query);
    const result = await clientsService.listClients(req.merchant.id, query);
    return reply.status(200).send(result);
  });

  fastify.post('/clients', { preHandler: requireAuth }, async (req, reply) => {
    const input = CreateClientSchema.parse(req.body);
    const client = await clientsService.createClient(req.merchant.id, input);
    return reply.status(201).send({ data: client });
  });

  fastify.get('/clients/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const client = await clientsService.getClientById(req.merchant.id, id);
    return reply.status(200).send({ data: client });
  });

  fastify.put('/clients/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = UpdateClientSchema.parse(req.body);
    const client = await clientsService.updateClient(req.merchant.id, id, input);
    return reply.status(200).send({ data: client });
  });

  fastify.delete('/clients/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    await clientsService.deleteClient(req.merchant.id, id);
    return reply.status(204).send();
  });
}
