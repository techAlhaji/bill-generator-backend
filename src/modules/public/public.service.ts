import { InvoiceStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { Errors } from '../../errors/problem-details.js';
import { generateInvoicePdf } from '../../utils/pdf.js';

export class PublicService {
  /**
   * Retrieves a sanitized public invoice view by capability token.
   * Strips internal database IDs, internal merchant notes, and private customer PII.
   * Draft invoices strictly return HTTP 404.
   */
  async getPublicInvoice(publicToken: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { publicToken },
      include: {
        merchant: true,
        client: true,
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!invoice || invoice.status === InvoiceStatus.DRAFT) {
      throw Errors.notFound('Invoice not found or has not yet been issued.');
    }

    const today = new Date().toISOString().split('T')[0];
    const dueDateStr = invoice.dueDate.toISOString().split('T')[0];
    let effectiveStatus = invoice.status;

    if (invoice.status === InvoiceStatus.ISSUED && dueDateStr < today) {
      effectiveStatus = InvoiceStatus.OVERDUE;
    }

    return {
      invoiceNumber: invoice.invoiceNumber,
      status: effectiveStatus,
      merchantBusinessName: invoice.merchant.businessName,
      merchantStellarAddress: invoice.merchant.stellarAddress,
      clientName: invoice.client.name,
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
      contentHash: invoice.contentHash,
      issueDate: invoice.issueDate.toISOString().split('T')[0],
      dueDate: dueDateStr,
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
      onchainTxHash: invoice.onchainTxHash,
      items: invoice.items.map((i) => ({
        description: i.description,
        quantityScale4: i.quantityScale4.toString(),
        unitPriceMinor: i.unitPriceMinor.toString(),
        totalMinor: i.totalMinor.toString(),
      })),
    };
  }

  /**
   * Lightweight public payment status polling endpoint
   */
  async getPublicInvoiceStatus(publicToken: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { publicToken },
      select: {
        status: true,
        paidAt: true,
        onchainTxHash: true,
        dueDate: true,
      },
    });

    if (!invoice || invoice.status === InvoiceStatus.DRAFT) {
      throw Errors.notFound('Invoice not found or has not yet been issued.');
    }

    const today = new Date().toISOString().split('T')[0];
    const dueDateStr = invoice.dueDate.toISOString().split('T')[0];
    let effectiveStatus = invoice.status;

    if (invoice.status === InvoiceStatus.ISSUED && dueDateStr < today) {
      effectiveStatus = InvoiceStatus.OVERDUE;
    }

    return {
      status: effectiveStatus,
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
      txHash: invoice.onchainTxHash,
    };
  }

  /**
   * Public invoice PDF download
   */
  async getPublicInvoicePdf(publicToken: string): Promise<Buffer> {
    const invoice = await prisma.invoice.findUnique({
      where: { publicToken },
      include: {
        merchant: true,
        client: true,
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!invoice || invoice.status === InvoiceStatus.DRAFT) {
      throw Errors.notFound('Invoice not found or has not yet been issued.');
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
}

export const publicService = new PublicService();
