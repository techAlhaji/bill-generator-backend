import { Horizon } from '@stellar/stellar-sdk';
import { env } from '../config/env.js';
import { logger } from '../logger/index.js';

export class HorizonClient {
  private server: Horizon.Server;

  constructor(horizonUrl = env.HORIZON_URL) {
    this.server = new Horizon.Server(horizonUrl);
  }

  /**
   * Health check probe for Horizon
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.server.root();
      return !!response.horizon_version;
    } catch (err) {
      logger.warn({ err }, 'Horizon health check failed');
      return false;
    }
  }

  /**
   * Fetch transaction details by transaction hash from Horizon
   */
  async getTransaction(txHash: string): Promise<Horizon.ServerApi.TransactionRecord | null> {
    try {
      return await this.server.transactions().transaction(txHash).call();
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number } };
      if (errorObj?.response?.status === 404) {
        return null;
      }
      logger.error({ err, txHash }, 'Failed to fetch transaction from Horizon');
      throw err;
    }
  }

  /**
   * Fetch operations belonging to a transaction
   */
  async getOperations(txHash: string): Promise<Horizon.ServerApi.OperationRecord[]> {
    try {
      const collection = await this.server.operations().forTransaction(txHash).call();
      return collection.records;
    } catch (err) {
      logger.error({ err, txHash }, 'Failed to fetch operations from Horizon');
      throw err;
    }
  }
}

export const horizonClient = new HorizonClient();
