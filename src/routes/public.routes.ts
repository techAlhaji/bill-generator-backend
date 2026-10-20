import { FastifyInstance } from 'fastify';
import {
  PublicTokenParamSchema,
  VerifyPaymentSchema,
} from '../modules/public/public.schemas.js';
import { publicService } from '../modules/public/public.service.js';
import { paymentVerificationService } from '../modules/payment/payment-verification.service.js';

export async function publicRoutes(fastify: FastifyInstance) {
  // Public sanitized invoice view
  fastify.get('/public/invoices/:publicToken', async (req, reply) => {
    const { publicToken } = PublicTokenParamSchema.parse(req.params);
    const invoice = await publicService.getPublicInvoice(publicToken);
    return reply.status(200).send({ data: invoice });
  });

  // Cryptographic payment verification
  fastify.post('/public/invoices/:publicToken/verify-payment', async (req, reply) => {
    const { publicToken } = PublicTokenParamSchema.parse(req.params);
    const input = VerifyPaymentSchema.parse(req.body);
    const result = await paymentVerificationService.verifyPayment(publicToken, input);
    return reply.status(200).send({ data: result });
  });

  // Lightweight status polling
  fastify.get('/public/invoices/:publicToken/status', async (req, reply) => {
    const { publicToken } = PublicTokenParamSchema.parse(req.params);
    const status = await publicService.getPublicInvoiceStatus(publicToken);
    return reply.status(200).send(status);
  });

  // Public PDF download
  fastify.get('/public/invoices/:publicToken/pdf', async (req, reply) => {
    const { publicToken } = PublicTokenParamSchema.parse(req.params);
    const pdfBuffer = await publicService.getPublicInvoicePdf(publicToken);

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="invoice-${publicToken}.pdf"`)
      .send(pdfBuffer);
  });
}
