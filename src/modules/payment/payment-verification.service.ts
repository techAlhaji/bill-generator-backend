import { PaymentMethod, PaymentStatus, InvoiceStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { Errors } from '../../errors/problem-details.js';
import { logger } from '../../logger/index.js';
import { parseDecimalStringToStroops } from '../../utils/math.js';
import { horizonClient } from '../../stellar/horizon.client.js';
import { sorobanClient } from '../../stellar/soroban.client.js';
import { VerifyPaymentInput } from '../public/public.schemas.js';

export class PaymentVerificationService {
  /**
   * Cryptographically verifies payment for an invoice identified by its public capability token.
   * Row-level locking and database idempotency constraints guarantee replay protection.
   */
  async verifyPayment(publicToken: string, input: VerifyPaymentInput) {
    const txHash = input.transactionHash.toLowerCase().trim();

    // 1. Check database-level idempotency first
    const existingPayment = await prisma.payment.findUnique({
      where: { txHash },
      include: { invoice: true },
    });

    if (existingPayment) {
      if (existingPayment.invoice.publicToken === publicToken && existingPayment.status === PaymentStatus.CONFIRMED) {
        // Idempotent success response if already confirmed for THIS invoice
        return {
          status: 'CONFIRMED',
          invoiceStatus: InvoiceStatus.PAID,
          transactionHash: txHash,
          amountStroops: existingPayment.amountStroops.toString(),
          excessStroops: existingPayment.excessStroops.toString(),
          verifiedAt: existingPayment.verifiedAt.toISOString(),
        };
      }

      // Replay attempt on another invoice or already redeemed transaction
      throw Errors.conflict(
        `Transaction hash "${txHash}" has already been redeemed for another invoice or processed with status ${existingPayment.status}.`,
        'RESOURCE_CONFLICT'
      );
    }

    // 2. Fetch invoice and verify state
    const invoice = await prisma.invoice.findUnique({
      where: { publicToken },
      include: {
        merchant: true,
        client: true,
      },
    });

    if (!invoice) {
      throw Errors.notFound('Invoice not found or invalid public payment link.');
    }

    if (invoice.status === InvoiceStatus.DRAFT) {
      throw Errors.notFound('Draft invoices cannot accept payments.');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw Errors.paymentVerificationFailed('This invoice has been cancelled and cannot accept payments.', 'INVOICE_CANCELLED');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      return {
        status: 'CONFIRMED',
        invoiceStatus: InvoiceStatus.PAID,
        transactionHash: invoice.onchainTxHash || txHash,
        amountStroops: invoice.amountStroops.toString(),
        excessStroops: '0',
        verifiedAt: (invoice.paidAt || new Date()).toISOString(),
      };
    }

    // 3. Dispatch to verification pipeline depending on payment method
    let payerAddress = input.payerWalletAddress || 'UNKNOWN';
    let recipientAddress = invoice.merchant.stellarAddress;
    let assetIdentifier = invoice.assetCode;
    let transferredStroops = 0n;
    let ledgerSequence = 0;

    if (input.paymentMethod === PaymentMethod.STELLAR_CLASSIC) {
      // Pathway A: Stellar Classic (Horizon API)
      const horizonTx = await horizonClient.getTransaction(txHash);
      if (!horizonTx) {
        throw Errors.paymentVerificationFailed(
          'Transaction was not found on the Stellar network. It may not have settled yet.',
          'TRANSACTION_NOT_FOUND'
        );
      }

      if (!horizonTx.successful) {
        throw Errors.paymentVerificationFailed('Transaction failed on-chain.', 'TRANSACTION_FAILED');
      }

      ledgerSequence = horizonTx.ledger_attr || 0;
      if (ledgerSequence <= 0) {
        throw Errors.paymentVerificationFailed('Transaction has not yet been included in a closed ledger.', 'TRANSACTION_PENDING');
      }

      // Validate memo
      const memoText = horizonTx.memo?.trim();
      if (!memoText || memoText !== invoice.memoText.trim()) {
        throw Errors.paymentVerificationFailed(
          `Transaction memo "${memoText || ''}" does not match required invoice memo "${invoice.memoText}".`,
          'PAYMENT_WRONG_MEMO'
        );
      }

      // Fetch operations to match payment destination and asset
      const operations = await horizonClient.getOperations(txHash);
      const paymentOps = operations.filter(
        (op) => op.type === 'payment' || op.type === 'path_payment_strict_receive' || op.type === 'path_payment_strict_send'
      );

      if (paymentOps.length === 0) {
        throw Errors.paymentVerificationFailed('Transaction contains no payment operations.', 'NO_PAYMENT_OPERATION');
      }

      // Find the operation matching the recipient
      const matchingOp = paymentOps.find((op: any) => {
        const toAddress = op.to || op.dest;
        return toAddress === invoice.merchant.stellarAddress;
      }) as any;

      if (!matchingOp) {
        throw Errors.paymentVerificationFailed(
          `Payment recipient does not match merchant Stellar address: expected ${invoice.merchant.stellarAddress}`,
          'PAYMENT_WRONG_RECIPIENT'
        );
      }

      // Verify asset identity
      if (invoice.currencyType === 'NATIVE_XLM') {
        if (matchingOp.asset_type !== 'native') {
          throw Errors.paymentVerificationFailed(
            `Asset mismatch: expected native XLM, received ${matchingOp.asset_code || matchingOp.asset_type}`,
            'PAYMENT_WRONG_ASSET'
          );
        }
        assetIdentifier = 'native';
      } else {
        if (
          matchingOp.asset_code !== invoice.assetCode ||
          (invoice.assetIssuer && matchingOp.asset_issuer !== invoice.assetIssuer)
        ) {
          throw Errors.paymentVerificationFailed(
            `Asset mismatch: expected ${invoice.assetCode}${invoice.assetIssuer ? `:${invoice.assetIssuer}` : ''}`,
            'PAYMENT_WRONG_ASSET'
          );
        }
        assetIdentifier = `${matchingOp.asset_code}:${matchingOp.asset_issuer}`;
      }

      payerAddress = matchingOp.source_account || matchingOp.from || horizonTx.source_account;
      recipientAddress = matchingOp.to || matchingOp.dest;

      // Zero-float amount parsing
      const rawAmountStr = matchingOp.amount || matchingOp.dest_amount;
      transferredStroops = parseDecimalStringToStroops(rawAmountStr);
    } else {
      // Pathway B: Soroban Smart Contract Token (Soroban RPC)
      const sorobanTx = await sorobanClient.getTransaction(txHash);
      if (!sorobanTx) {
        throw Errors.paymentVerificationFailed('Soroban transaction not found on RPC node.', 'TRANSACTION_NOT_FOUND');
      }

      if (sorobanTx.status !== 'SUCCESS') {
        throw Errors.paymentVerificationFailed(
          `Soroban transaction status is "${sorobanTx.status}". Settlement not confirmed.`,
          'TRANSACTION_FAILED'
        );
      }

      ledgerSequence = sorobanTx.ledger || 0;
      transferredStroops = invoice.amountStroops; // In contract pay_invoice, exact amount from storage is transferred
      assetIdentifier = invoice.tokenContractId || invoice.assetCode;
    }

    // 4. Verify Amount
    const requiredStroops = invoice.amountStroops;
    const isUnderpaid = transferredStroops < requiredStroops;

    if (isUnderpaid) {
      // Record payment attempt as UNDERPAID
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          txHash,
          paymentMethod: input.paymentMethod,
          payerAddress,
          recipientAddress,
          assetIdentifier,
          amountStroops: transferredStroops,
          excessStroops: 0n,
          ledgerSequence,
          status: PaymentStatus.UNDERPAID,
          failureReason: `Transferred ${transferredStroops.toString()} stroops is less than required ${requiredStroops.toString()} stroops.`,
        },
      });

      throw Errors.paymentVerificationFailed(
        `Transferred amount ${transferredStroops.toString()} stroops is less than expected ${requiredStroops.toString()} stroops.`,
        'PAYMENT_UNDERPAID',
        [
          {
            name: 'amountStroops',
            reason: `Received ${transferredStroops.toString()} stroops; required ${requiredStroops.toString()} stroops.`,
          },
        ]
      );
    }

    // 5. Payment is confirmed! Execute atomic database update
    const excessStroops = transferredStroops > requiredStroops ? transferredStroops - requiredStroops : 0n;
    const verifiedAt = new Date();

    await prisma.$transaction(async (tx) => {
      // Lock invoice row for update and update status
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.PAID,
          paidAt: verifiedAt,
          onchainTxHash: txHash,
        },
      });

      // Insert confirmed payment record
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          txHash,
          paymentMethod: input.paymentMethod,
          payerAddress,
          recipientAddress,
          assetIdentifier,
          amountStroops: transferredStroops,
          excessStroops,
          ledgerSequence,
          status: PaymentStatus.CONFIRMED,
          verifiedAt,
        },
      });

      // Audit log entry
      await tx.auditLog.create({
        data: {
          invoiceId: invoice.id,
          action: 'PAYMENT_CONFIRMED',
          fromStatus: invoice.status,
          toStatus: 'PAID',
          actorType: 'PAYER',
          actorId: payerAddress,
          metadata: {
            txHash,
            paymentMethod: input.paymentMethod,
            amountStroops: transferredStroops.toString(),
            excessStroops: excessStroops.toString(),
            ledgerSequence,
          },
        },
      });
    });

    logger.info(
      {
        invoiceNumber: invoice.invoiceNumber,
        txHash,
        amountStroops: transferredStroops.toString(),
      },
      'Payment verified and invoice settled successfully'
    );

    return {
      status: 'CONFIRMED',
      invoiceStatus: InvoiceStatus.PAID,
      transactionHash: txHash,
      amountStroops: transferredStroops.toString(),
      excessStroops: excessStroops.toString(),
      verifiedAt: verifiedAt.toISOString(),
    };
  }
}

export const paymentVerificationService = new PaymentVerificationService();
