import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { Errors } from '../../errors/problem-details.js';
import { UpdateMerchantProfileInput } from './merchant.schemas.js';

export class MerchantService {
  async getProfile(merchantId: string) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        email: true,
        businessName: true,
        stellarAddress: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!merchant) {
      throw Errors.notFound(`Merchant profile was not found.`);
    }

    return merchant;
  }

  async updateProfile(merchantId: string, input: UpdateMerchantProfileInput) {
    await this.getProfile(merchantId);

    const updated = await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        ...(input.businessName ? { businessName: input.businessName.trim() } : {}),
        ...(input.stellarAddress ? { stellarAddress: input.stellarAddress.trim() } : {}),
        ...(input.settings ? { settings: input.settings as Prisma.InputJsonValue } : {}),
      },
      select: {
        id: true,
        email: true,
        businessName: true,
        stellarAddress: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updated;
  }
}

export const merchantService = new MerchantService();
