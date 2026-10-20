import { z } from 'zod';

export const InvoiceStatusEnum = z.enum(['DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'CANCELLED']);
export const CurrencyTypeEnum = z.enum(['NATIVE_XLM', 'STELLAR_CLASSIC', 'SOROBAN_TOKEN']);
export const PaymentMethodEnum = z.enum(['STELLAR_CLASSIC', 'SOROBAN_TOKEN']);

export const InvoiceItemInputSchema = z.object({
  description: z.string().min(1, 'Item description is required'),
  quantityScale4: z
    .string()
    .regex(/^[1-9]\d*$/, 'Quantity must be a positive integer scaled by 10^4 (e.g. "10000" for 1 unit)'),
  unitPriceMinor: z
    .string()
    .regex(/^\d+$/, 'Unit price must be a non-negative integer string in minor units'),
});

export const CreateInvoiceSchema = z
  .object({
    clientId: z.string().uuid('Invalid client UUID'),
    invoiceNumber: z
      .string()
      .min(1)
      .max(50)
      .optional(),
    currencyType: CurrencyTypeEnum.default('NATIVE_XLM'),
    assetCode: z.string().min(1).default('XLM'),
    assetIssuer: z.string().regex(/^G[A-Z2-7]{55}$/).optional().nullable(),
    tokenContractId: z.string().regex(/^C[A-Z0-9]{55}$/).optional().nullable(),
    taxRateBps: z.coerce.number().int().min(0).max(10_000).default(0),
    discountMinor: z
      .string()
      .regex(/^\d+$/, 'Discount must be a non-negative integer string in minor units')
      .default('0'),
    notes: z.string().optional().nullable(),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'issueDate must be in YYYY-MM-DD format'),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be in YYYY-MM-DD format'),
    items: z.array(InvoiceItemInputSchema).min(1, 'At least one line item is required'),
  })
  .refine(
    (data) => new Date(data.dueDate) >= new Date(data.issueDate),
    {
      message: 'Invoice due date cannot precede issue date',
      path: ['dueDate'],
    }
  );

export const UpdateInvoiceSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    currencyType: CurrencyTypeEnum.optional(),
    assetCode: z.string().min(1).optional(),
    assetIssuer: z.string().regex(/^G[A-Z2-7]{55}$/).optional().nullable(),
    tokenContractId: z.string().regex(/^C[A-Z0-9]{55}$/).optional().nullable(),
    taxRateBps: z.coerce.number().int().min(0).max(10_000).optional(),
    discountMinor: z.string().regex(/^\d+$/).optional(),
    notes: z.string().optional().nullable(),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    items: z.array(InvoiceItemInputSchema).min(1).optional(),
  })
  .refine(
    (data) => {
      if (data.issueDate && data.dueDate) {
        return new Date(data.dueDate) >= new Date(data.issueDate);
      }
      return true;
    },
    {
      message: 'Invoice due date cannot precede issue date',
      path: ['dueDate'],
    }
  );

export const ListInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: InvoiceStatusEnum.optional(),
  clientId: z.string().uuid().optional(),
  currencyType: CurrencyTypeEnum.optional(),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>;
