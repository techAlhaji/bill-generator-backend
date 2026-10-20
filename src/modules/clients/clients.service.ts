import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { Errors } from '../../errors/problem-details.js';
import { CreateClientInput, UpdateClientInput, PaginationQuery } from './clients.schemas.js';

export class ClientsService {
  async listClients(merchantId: string, query: PaginationQuery) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {
      merchantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [totalCount, clients] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return {
      data: clients,
      meta: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getClientById(merchantId: string, clientId: string) {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        merchantId,
      },
    });

    if (!client) {
      throw Errors.notFound(`Client with ID ${clientId} was not found.`);
    }

    return client;
  }

  async createClient(merchantId: string, input: CreateClientInput) {
    const client = await prisma.client.create({
      data: {
        merchantId,
        name: input.name.trim(),
        email: input.email.toLowerCase().trim(),
        address: input.address?.trim() || null,
        taxId: input.taxId?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });

    return client;
  }

  async updateClient(merchantId: string, clientId: string, input: UpdateClientInput) {
    // Verify client exists and belongs to merchant
    await this.getClientById(merchantId, clientId);

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.email !== undefined ? { email: input.email.toLowerCase().trim() } : {}),
        ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
        ...(input.taxId !== undefined ? { taxId: input.taxId?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      },
    });

    return updated;
  }

  async deleteClient(merchantId: string, clientId: string) {
    // Verify client exists and belongs to merchant
    await this.getClientById(merchantId, clientId);

    // Business rule: Prohibited if active invoices exist (DRAFT, ISSUED, OVERDUE)
    const activeInvoicesCount = await prisma.invoice.count({
      where: {
        clientId,
        status: { in: ['DRAFT', 'ISSUED', 'OVERDUE'] },
      },
    });

    if (activeInvoicesCount > 0) {
      throw Errors.validation('Cannot delete client with active invoices.');
    }

    await prisma.client.delete({
      where: { id: clientId },
    });
  }
}

export const clientsService = new ClientsService();
