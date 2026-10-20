import { z } from 'zod';

export const UpdateMerchantProfileSchema = z.object({
  businessName: z.string().min(2).optional(),
  stellarAddress: z.string().regex(/^G[A-Z2-7]{55}$/).optional(),
  settings: z.record(z.unknown()).optional(),
});

export type UpdateMerchantProfileInput = z.infer<typeof UpdateMerchantProfileSchema>;
