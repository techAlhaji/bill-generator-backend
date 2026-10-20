import { z } from 'zod';

export const RegisterMerchantSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  businessName: z.string().min(2, 'Business name must be at least 2 characters long'),
  stellarAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar public address format (G...)'),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

export const StellarChallengeSchema = z.object({
  stellarAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar public address format (G...)'),
});

export const StellarVerifySchema = z.object({
  signedTransaction: z.string().min(1, 'Signed transaction XDR is required'),
});

export type RegisterMerchantInput = z.infer<typeof RegisterMerchantSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type StellarChallengeInput = z.infer<typeof StellarChallengeSchema>;
export type StellarVerifyInput = z.infer<typeof StellarVerifySchema>;

export interface AuthJwtPayload {
  sub: string;
  email: string;
  stellarAddress: string;
  iat?: number;
  exp?: number;
}
