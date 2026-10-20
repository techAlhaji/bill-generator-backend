import { z } from 'zod';
import { PaymentMethodEnum } from '../invoices/invoices.schemas.js';

export const PublicTokenParamSchema = z.object({
  publicToken: z.string().min(1, 'Public capability token is required'),
});

export const VerifyPaymentSchema = z.object({
  transactionHash: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'Transaction hash must be a 64-character hexadecimal string'),
  paymentMethod: PaymentMethodEnum,
  payerWalletAddress: z.string().optional(),
});

export type VerifyPaymentInput = z.infer<typeof VerifyPaymentSchema>;
