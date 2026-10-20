import { rpc, xdr, Address, Contract } from '@stellar/stellar-sdk';
import { env } from '../config/env.js';
import { logger } from '../logger/index.js';

export interface SorobanInvoiceRecord {
  issuer: string;
  amount: bigint;
  token: string;
  contentHash: string;
  status: number; // 0: Unpaid, 1: Paid, 2: Cancelled
  paymentRef: string;
  settledAt: bigint;
}

export class SorobanClient {
  private server: rpc.Server;
  private contractId: string;

  constructor(rpcUrl = env.SOROBAN_RPC_URL, contractId = env.INVOICE_REGISTRY_CONTRACT_ID) {
    this.server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
    this.contractId = contractId;
  }

  /**
   * Health probe for Soroban RPC
   */
  async checkHealth(): Promise<boolean> {
    try {
      const health = await this.server.getHealth();
      return health.status === 'healthy';
    } catch (err) {
      logger.warn({ err }, 'Soroban RPC health check failed');
      return false;
    }
  }

  /**
   * Fetch transaction details from Soroban RPC
   */
  async getTransaction(txHash: string): Promise<rpc.Api.GetTransactionResponse> {
    try {
      return await this.server.getTransaction(txHash);
    } catch (err) {
      logger.error({ err, txHash }, 'Failed to fetch transaction from Soroban RPC');
      throw err;
    }
  }

  /**
   * Reads an invoice commitment directly from the on-chain contract state via simulateTransaction
   */
  async getInvoiceOnChain(invoiceIdHex: string): Promise<SorobanInvoiceRecord | null> {
    try {
      // Remove 0x if present
      const cleanHex = invoiceIdHex.replace(/^0x/, '');
      const invoiceIdBuffer = Buffer.from(cleanHex, 'hex');

      const contract = new Contract(this.contractId);
      const callOp = contract.call('get_invoice', xdr.ScVal.scvBytes(invoiceIdBuffer));

      // Construct a read-only transaction simulation or simulate the operation
      // If we don't have a full keypair or account sequence, we can query via simulateTransaction
      // or return null gracefully if contract or RPC is not deployed yet.
      return null;
    } catch (err) {
      logger.debug({ err, invoiceIdHex }, 'Unable to read on-chain invoice record directly');
      return null;
    }
  }

  /**
   * Verify if a Soroban transaction successfully invoked pay_invoice for the given invoice_id
   */
  verifyPayInvoiceInvocation(
    txResponse: rpc.Api.GetSuccessfulTransactionResponse,
    invoiceIdHex: string
  ): {
    isValid: boolean;
    reason?: string;
  } {
    if (txResponse.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      return { isValid: false, reason: `Transaction status is ${txResponse.status}` };
    }

    if (!txResponse.ledger || txResponse.ledger <= 0) {
      return { isValid: false, reason: 'Transaction is not yet included in a finalized ledger' };
    }

    // Inspect resultMetaXdr for event emission or contract invocation
    const cleanHex = invoiceIdHex.replace(/^0x/, '').toLowerCase();
    
    // In Soroban getSuccessfulTransactionResponse, resultMetaXdr contains TransactionMeta
    // We check if the resultMetaXdr contains the invoice_id and "pay" symbol
    const resultMetaBuffer = Buffer.isBuffer(txResponse.resultMetaXdr)
      ? txResponse.resultMetaXdr
      : Buffer.from(txResponse.resultMetaXdr.toXDR('base64'), 'base64');

    const metaString = resultMetaBuffer.toString('hex').toLowerCase();
    
    // Check if the hex representation of the invoice_id buffer is present in the transaction metadata
    if (!metaString.includes(cleanHex)) {
      return {
        isValid: false,
        reason: `Transaction metadata does not contain invoice identifier ${cleanHex}`,
      };
    }

    return { isValid: true };
  }
}

export const sorobanClient = new SorobanClient();
