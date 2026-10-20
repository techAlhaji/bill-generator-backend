import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  ListInvoicesQuerySchema,
} from '../modules/invoices/invoices.schemas.js';
import { IdParamSchema } from '../modules/clients/clients.schemas.js';
import { invoicesService } from '../modules/invoices/invoices.service.js';

export async function invoicesRoutes(fastify: FastifyInstance) {
  fastify.get('/invoices', { preHandler: requireAuth }, async (req, reply) => {
    const query = ListInvoicesQuerySchema.parse(req.query);
    const result = await invoicesService.listInvoices(req.merchant.id, query);
    return reply.status(200).send(result);
  });

  fastify.post('/invoices', { preHandler: requireAuth }, async (req, reply) => {
    const input = CreateInvoiceSchema.parse(req.body);
    const invoice = await invoicesService.createInvoice(req.merchant.id, input);
    return reply.status(201).send({ data: invoice });
  });

  fastify.get('/invoices/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const invoice = await invoicesService.getInvoiceById(req.merchant.id, id);
    return reply.status(200).send({ data: invoice });
  });

  fastify.put('/invoices/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = UpdateInvoiceSchema.parse(req.body);
    const updated = await invoicesService.updateInvoice(req.merchant.id, id, input);
    return reply.status(200).send({ data: updated });
  });

  fastify.post('/invoices/:id/issue', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const issued = await invoicesService.issueInvoice(req.merchant.id, id);
    return reply.status(200).send({ data: issued });
  });

  fastify.post('/invoices/:id/cancel', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const cancelled = await invoicesService.cancelInvoice(req.merchant.id, id);
    return reply.status(200).send({ data: cancelled });
  });

  fastify.get('/invoices/:id/pdf', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const pdfBuffer = await invoicesService.getInvoicePdf(req.merchant.id, id);

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="invoice-${id}.pdf"`)
      .send(pdfBuffer);
  });

  fastify.get('/invoices/:id/payments', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const payments = await invoicesService.getInvoicePayments(req.merchant.id, id);
    return reply.status(200).send({ data: payments });
  });

  fastify.get('/invoices/:id/audit-logs', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const logs = await invoicesService.getInvoiceAuditLogs(req.merchant.id, id);
    return reply.status(200).send({ data: logs });
  });
}
