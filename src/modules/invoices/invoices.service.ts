import { randomBytes } from 'node:crypto';
import { Prisma, InvoiceStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { Errors } from '../../errors/problem-details.js';
import {
  calculateInvoiceTotals,
  formatMinorToDecimalString,
} from '../../utils/math.js';
import {
  computeInvoiceContentHash,
  deriveOnchainInvoiceId,
  CanonicalInvoicePayload,
} from '../../utils/canonical.js';
import { generateInvoicePdf } from '../../utils/pdf.js';
import {
  CreateInvoiceInput,
  UpdateInvoiceInput,
  ListInvoicesQuery,
} from './invoices.schemas.js';
import { isAssetAllowed } from '../../stellar/config.js';

export class InvoicesService {
  /**
   * Helper to format an invoice for API response
   */
  private formatInvoice(invoice: any) {
    // If dueDate has passed and status is ISSUED, we consider it OVERDUE
    const today = new Date().toISOString().split('T')[0];
    const dueDateStr = invoice.dueDate instanceof Date ? invoice.dueDate.toISOString().split('T')[0] : String(invoice.dueDate).split('T')[0];
    let effectiveStatus = invoice.status;

    if (invoice.status === 'ISSUED' && dueDateStr < today) {
      effectiveStatus = 'OVERDUE';
    }

    return {
      id: invoice.id,
      merchantId: invoice.merchantId,
      clientId: invoice.clientId,
      client: invoice.client
        ? {
            id: invoice.client.id,
            merchantId: invoice.client.merchantId,
            name: invoice.client.name,
            email: invoice.client.email,
            address: invoice.client.address,
            taxId: invoice.client.taxId,
            notes: invoice.client.notes,
            createdAt: invoice.client.createdAt,
            updatedAt: invoice.client.updatedAt,
          }
        : undefined,
      invoiceNumber: invoice.invoiceNumber,
      publicToken: invoice.publicToken,
      status: effectiveStatus,
      currencyType: invoice.currencyType,
      assetCode: invoice.assetCode,
      assetIssuer: invoice.assetIssuer,
      tokenContractId: invoice.tokenContractId,
      subtotalMinor: invoice.subtotalMinor.toString(),
      taxRateBps: invoice.taxRateBps,
      taxMinor: invoice.taxMinor.toString(),
      discountMinor: invoice.discountMinor.toString(),
      totalMinor: invoice.totalMinor.toString(),
      amountStroops: invoice.amountStroops.toString(),
      memoText: invoice.memoText,
      notes: invoice.notes,
      contentHash: invoice.contentHash,
      issueDate: invoice.issueDate instanceof Date ? invoice.issueDate.toISOString().split('T')[0] : invoice.issueDate,
      dueDate: dueDateStr,
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
      onchainInvoiceId: invoice.onchainInvoiceId,
      onchainTxHash: invoice.onchainTxHash,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      items: (invoice.items || []).map((item: any) => ({
        id: item.id,
        description: item.description,
        quantityScale4: item.quantityScale4.toString(),
        unitPriceMinor: item.unitPriceMinor.toString(),
        totalMinor: item.totalMinor.toString(),
        sortOrder: item.sortOrder,
      })),
    };
  }

  /**
   * Generates a sequential invoice number scoped to the merchant: INV-YYYY-XXXX
   */
  private async generateNextInvoiceNumber(merchantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.invoice.count({
      where: {
        merchantId,
        invoiceNumber: { startsWith: `INV-${year}-` },
      },
    });

    const nextSeq = String(count + 1).padStart(4, '0');
    return `INV-${year}-${nextSeq}`;
  }

  /**
   * Builds the canonical payload for RFC 8785 hashing
   */
  private buildCanonicalPayload(
    invoiceNumber: string,
    merchant: { businessName: string; stellarAddress: string },
    client: { name: string; taxId?: string | null },
    issueDate: string,
    dueDate: string,
    currency: string,
    items: Array<{ description: string; quantityScale4: bigint; unitPriceMinor: bigint }>,
    totalMinor: bigint
  ): CanonicalInvoicePayload {
    return {
      client: {
        name: client.name,
        taxId: client.taxId || null,
      },
      currency,
      dueDate,
      invoiceNumber,
      issueDate,
      items: items.map((item) => ({
        description: item.description,
        quantityScale4: item.quantityScale4.toString(),
        unitPriceMinor: item.unitPriceMinor.toString(),
      })),
      merchant: {
        businessName: merchant.businessName,
        stellarAddress: merchant.stellarAddress,
      },
      totalMinor: totalMinor.toString(),
    };
  }

  /**
   * List invoices with filters and pagination
   */
  async listInvoices(merchantId: string, query: ListInvoicesQuery) {
    const { page, limit, status, clientId, currencyType } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      merchantId,
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
      ...(currencyType ? { currencyType } : {}),
    };

    const [totalCount, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          client: true,
          items: { orderBy: { sortOrder: 'asc' } },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return {
      data: invoices.map((inv) => this.formatInvoice(inv)),
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

  /**
   * Get invoice by ID (merchant authorized)
   */
  async getInvoiceById(merchantId: string, invoiceId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        merchantId,
      },
      include: {
        client: true,
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!invoice) {
      throw Errors.notFound(`Invoice with ID ${invoiceId} was not found.`);
    }

    return this.formatInvoice(invoice);
  }

  /**
   * Create invoice
   */
  async createInvoice(merchantId: string, input: CreateInvoiceInput) {
    // 1. Validate client belongs to merchant
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, merchantId },
    });
    if (!client) {
      throw Errors.validation('Specified client does not exist or does not belong to merchant.');
    }

    // 2. Fetch merchant profile for branding & canonical hashing
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) {
      throw Errors.notFound('Merchant not found.');
    }

    // 2.5 Verify asset is permitted on allowlist
    const assetCode = input.assetCode.toUpperCase().trim();
    if (!isAssetAllowed(assetCode, input.assetIssuer, input.tokenContractId)) {
      throw Errors.unprocessableEntity(
        `Asset "${assetCode}" is not permitted under the configured asset allowlist.`,
        'ASSET_NOT_ALLOWED'
      );
    }

    // 3. Resolve invoice number
    let invoiceNumber = input.invoiceNumber?.trim();
    if (!invoiceNumber) {
      invoiceNumber = await this.generateNextInvoiceNumber(merchantId);
    } else {
      const existing = await prisma.invoice.findUnique({
        where: {
          merchantId_invoiceNumber: { merchantId, invoiceNumber },
        },
      });
      if (existing) {
        throw Errors.conflict(`Invoice number "${invoiceNumber}" is already in use.`);
      }
    }

    // 4. Zero-float monetary calculations
    const parsedItems = input.items.map((item) => ({
      description: item.description.trim(),
      quantityScale4: BigInt(item.quantityScale4),
      unitPriceMinor: BigInt(item.unitPriceMinor),
    }));

    const discountMinor = BigInt(input.discountMinor || '0');
    const { lineTotals, subtotalMinor, taxMinor, totalMinor } = calculateInvoiceTotals(
      parsedItems,
      input.taxRateBps,
      discountMinor
    );

    // Amount in stroops is equal to totalMinor for 7-decimal assets like XLM
    const amountStroops = totalMinor;

    // 5. Generate high-entropy capability token for public URL
    const publicToken = `pub_${randomBytes(24).toString('base64url')}`;

    // 6. Generate memo identifier (e.g. INV-2026-0001)
    const memoText = invoiceNumber.length <= 28 ? invoiceNumber : invoiceNumber.slice(0, 28);

    // 7. Compute RFC 8785 content hash and onchain ID
    const canonicalPayload = this.buildCanonicalPayload(
      invoiceNumber,
      merchant,
      client,
      input.issueDate,
      input.dueDate,
      input.currencyType,
      parsedItems,
      totalMinor
    );
    const contentHash = computeInvoiceContentHash(canonicalPayload);
    const onchainInvoiceId = deriveOnchainInvoiceId(merchantId, invoiceNumber);

    // 8. Persist in database transaction with line items and audit log
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          merchantId,
          clientId: input.clientId,
          invoiceNumber,
          publicToken,
          status: InvoiceStatus.DRAFT,
          currencyType: input.currencyType,
          assetCode: input.assetCode.toUpperCase().trim(),
          assetIssuer: input.assetIssuer?.trim() || null,
          tokenContractId: input.tokenContractId?.trim() || null,
          subtotalMinor,
          taxRateBps: input.taxRateBps,
          taxMinor,
          discountMinor,
          totalMinor,
          amountStroops,
          memoText,
          notes: input.notes?.trim() || null,
          contentHash,
          onchainInvoiceId,
          issueDate: new Date(input.issueDate),
          dueDate: new Date(input.dueDate),
          items: {
            create: parsedItems.map((item, index) => ({
              description: item.description,
              quantityScale4: item.quantityScale4,
              unitPriceMinor: item.unitPriceMinor,
              totalMinor: lineTotals[index],
              sortOrder: index,
            })),
          },
        },
        include: {
          client: true,
          items: { orderBy: { sortOrder: 'asc' } },
        },
      });

      await tx.auditLog.create({
        data: {
          invoiceId: created.id,
          action: 'CREATED',
          toStatus: 'DRAFT',
          actorType: 'MERCHANT',
          actorId: merchantId,
          metadata: { invoiceNumber },
        },
      });

      return created;
    });

    return this.formatInvoice(invoice);
  }

  /**
   * Update draft invoice
   */
  async updateInvoice(merchantId: string, invoiceId: string, input: UpdateInvoiceInput) {
    const existing = await prisma.invoice.findFirst({
      where: { id: invoiceId, merchantId },
      include: {
        merchant: true,
        client: true,
        items: true,
      },
    });

    if (!existing) {
      throw Errors.notFound(`Invoice with ID ${invoiceId} was not found.`);
    }

    if (existing.status !== InvoiceStatus.DRAFT) {
      throw Errors.invoiceNotEditable();
    }

    // Determine target client
    let client = existing.client;
    if (input.clientId && input.clientId !== existing.clientId) {
      const newClient = await prisma.client.findFirst({
        where: { id: input.clientId, merchantId },
      });
      if (!newClient) {
        throw Errors.validation('Specified client does not exist or does not belong to merchant.');
      }
      client = newClient;
    }

    // Verify asset is permitted on allowlist if changing
    const targetAssetCode = (input.assetCode || existing.assetCode).toUpperCase().trim();
    const targetAssetIssuer = input.assetIssuer !== undefined ? input.assetIssuer : existing.assetIssuer;
    const targetTokenId = input.tokenContractId !== undefined ? input.tokenContractId : existing.tokenContractId;
    if (!isAssetAllowed(targetAssetCode, targetAssetIssuer, targetTokenId)) {
      throw Errors.unprocessableEntity(
        `Asset "${targetAssetCode}" is not permitted under the configured asset allowlist.`,
        'ASSET_NOT_ALLOWED'
      );
    }

    // Prepare line items
    let parsedItems = existing.items.map((i) => ({
      description: i.description,
      quantityScale4: i.quantityScale4,
      unitPriceMinor: i.unitPriceMinor,
    }));

    if (input.items) {
      parsedItems = input.items.map((item) => ({
        description: item.description.trim(),
        quantityScale4: BigInt(item.quantityScale4),
        unitPriceMinor: BigInt(item.unitPriceMinor),
      }));
    }

    const taxRateBps = input.taxRateBps !== undefined ? input.taxRateBps : existing.taxRateBps;
    const discountMinor = input.discountMinor !== undefined ? BigInt(input.discountMinor) : existing.discountMinor;

    const { lineTotals, subtotalMinor, taxMinor, totalMinor } = calculateInvoiceTotals(
      parsedItems,
      taxRateBps,
      discountMinor
    );

    const issueDateStr = input.issueDate || existing.issueDate.toISOString().split('T')[0];
    const dueDateStr = input.dueDate || existing.dueDate.toISOString().split('T')[0];
    const currencyType = input.currencyType || existing.currencyType;

    // Recompute content hash
    const canonicalPayload = this.buildCanonicalPayload(
      existing.invoiceNumber,
      existing.merchant,
      client,
      issueDateStr,
      dueDateStr,
      currencyType,
      parsedItems,
      totalMinor
    );
    const contentHash = computeInvoiceContentHash(canonicalPayload);

    const updated = await prisma.$transaction(async (tx) => {
      // Delete old line items
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });

      // Update invoice record
      const inv = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          clientId: client.id,
          currencyType,
          assetCode: input.assetCode ? input.assetCode.toUpperCase().trim() : existing.assetCode,
          assetIssuer: input.assetIssuer !== undefined ? input.assetIssuer?.trim() || null : existing.assetIssuer,
          tokenContractId: input.tokenContractId !== undefined ? input.tokenContractId?.trim() || null : existing.tokenContractId,
          subtotalMinor,
          taxRateBps,
          taxMinor,
          discountMinor,
          totalMinor,
          amountStroops: totalMinor,
          notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
          contentHash,
          issueDate: new Date(issueDateStr),
          dueDate: new Date(dueDateStr),
          items: {
            create: parsedItems.map((item, index) => ({
              description: item.description,
              quantityScale4: item.quantityScale4,
              unitPriceMinor: item.unitPriceMinor,
              totalMinor: lineTotals[index],
              sortOrder: index,
            })),
          },
        },
        include: {
          client: true,
          items: { orderBy: { sortOrder: 'asc' } },
        },
      });

      await tx.auditLog.create({
        data: {
          invoiceId,
          action: 'UPDATED',
          fromStatus: 'DRAFT',
          toStatus: 'DRAFT',
          actorType: 'MERCHANT',
          actorId: merchantId,
          metadata: { totalMinor: totalMinor.toString() },
        },
      });

      return inv;
    });

    return this.formatInvoice(updated);
  }

  /**
   * Transition invoice from DRAFT to ISSUED
   */
  async issueInvoice(merchantId: string, invoiceId: string) {
    const existing = await prisma.invoice.findFirst({
      where: { id: invoiceId, merchantId },
      include: {
        merchant: true,
        client: true,
        items: true,
      },
    });

    if (!existing) {
      throw Errors.notFound(`Invoice with ID ${invoiceId} was not found.`);
    }

    if (existing.status !== InvoiceStatus.DRAFT) {
      throw Errors.conflict('Only invoices in DRAFT status can be issued.', 'INVOICE_NOT_EDITABLE');
    }

    // Recompute canonical hash to ensure mathematical reproducibility
    const canonicalPayload = this.buildCanonicalPayload(
      existing.invoiceNumber,
      existing.merchant,
      existing.client,
      existing.issueDate.toISOString().split('T')[0],
      existing.dueDate.toISOString().split('T')[0],
      existing.currencyType,
      existing.items.map((i) => ({
        description: i.description,
        quantityScale4: i.quantityScale4,
        unitPriceMinor: i.unitPriceMinor,
      })),
      existing.totalMinor
    );
    const contentHash = computeInvoiceContentHash(canonicalPayload);
    const onchainInvoiceId = deriveOnchainInvoiceId(merchantId, existing.invoiceNumber);

    const issued = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.ISSUED,
          contentHash,
          onchainInvoiceId,
        },
        include: {
          client: true,
          items: { orderBy: { sortOrder: 'asc' } },
        },
      });

      await tx.auditLog.create({
        data: {
          invoiceId,
          action: 'ISSUED',
          fromStatus: 'DRAFT',
          toStatus: 'ISSUED',
          actorType: 'MERCHANT',
          actorId: merchantId,
          metadata: { contentHash, onchainInvoiceId },
        },
      });

      return inv;
    });

    return this.formatInvoice(issued);
  }

  /**
   * Cancel invoice (prohibited if PAID)
   */
  async cancelInvoice(merchantId: string, invoiceId: string) {
    const existing = await prisma.invoice.findFirst({
      where: { id: invoiceId, merchantId },
    });

    if (!existing) {
      throw Errors.notFound(`Invoice with ID ${invoiceId} was not found.`);
    }

    if (existing.status === InvoiceStatus.PAID) {
      throw Errors.conflict('Paid invoices cannot be cancelled.', 'INVOICE_ALREADY_PAID');
    }

    if (existing.status === InvoiceStatus.CANCELLED) {
      return this.formatInvoice(existing);
    }

    const oldStatus = existing.status;

    const cancelled = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.CANCELLED },
        include: {
          client: true,
          items: { orderBy: { sortOrder: 'asc' } },
        },
      });

      await tx.auditLog.create({
        data: {
          invoiceId,
          action: 'CANCELLED',
          fromStatus: oldStatus,
          toStatus: 'CANCELLED',
          actorType: 'MERCHANT',
          actorId: merchantId,
        },
      });

      return inv;
    });

    return this.formatInvoice(cancelled);
  }

  /**
   * Download Invoice PDF (merchant authorized)
   */
  async getInvoicePdf(merchantId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, merchantId },
      include: {
        merchant: true,
        client: true,
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!invoice) {
      throw Errors.notFound(`Invoice with ID ${invoiceId} was not found.`);
    }

    return generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate.toISOString().split('T')[0],
      dueDate: invoice.dueDate.toISOString().split('T')[0],
      currencyType: invoice.currencyType,
      assetCode: invoice.assetCode,
      subtotalMinor: invoice.subtotalMinor,
      taxRateBps: invoice.taxRateBps,
      taxMinor: invoice.taxMinor,
      discountMinor: invoice.discountMinor,
      totalMinor: invoice.totalMinor,
      amountStroops: invoice.amountStroops,
      memoText: invoice.memoText,
      contentHash: invoice.contentHash,
      merchant: {
        businessName: invoice.merchant.businessName,
        stellarAddress: invoice.merchant.stellarAddress,
        email: invoice.merchant.email,
      },
      client: {
        name: invoice.client.name,
        email: invoice.client.email,
        address: invoice.client.address,
        taxId: invoice.client.taxId,
      },
      items: invoice.items.map((i) => ({
        description: i.description,
        quantityScale4: i.quantityScale4,
        unitPriceMinor: i.unitPriceMinor,
        totalMinor: i.totalMinor,
      })),
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    });
  }

  /**
   * Retrieve payments recorded for an invoice
   */
  async getInvoicePayments(merchantId: string, invoiceId: string) {
    // Verify invoice belongs to merchant
    await this.getInvoiceById(merchantId, invoiceId);

    const payments = await prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { verifiedAt: 'desc' },
    });

    return payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      txHash: p.txHash,
      paymentMethod: p.paymentMethod,
      payerAddress: p.payerAddress,
      recipientAddress: p.recipientAddress,
      assetIdentifier: p.assetIdentifier,
      amountStroops: p.amountStroops.toString(),
      excessStroops: p.excessStroops.toString(),
      ledgerSequence: p.ledgerSequence,
      status: p.status,
      failureReason: p.failureReason,
      verifiedAt: p.verifiedAt.toISOString(),
    }));
  }

  /**
   * Retrieve audit logs for an invoice
   */
  async getInvoiceAuditLogs(merchantId: string, invoiceId: string) {
    // Verify invoice belongs to merchant
    await this.getInvoiceById(merchantId, invoiceId);

    const logs = await prisma.auditLog.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((l) => ({
      id: l.id,
      invoiceId: l.invoiceId,
      action: l.action,
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
      actorType: l.actorType,
      actorId: l.actorId,
      metadata: l.metadata as object,
      createdAt: l.createdAt.toISOString(),
    }));
  }
}

export const invoicesService = new InvoicesService();
