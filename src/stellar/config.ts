import { Networks } from '@stellar/stellar-sdk';
import { env } from '../config/env.js';

export const STELLAR_NETWORK_PASSPHRASES = {
  TESTNET: Networks.TESTNET,
  PUBLIC: Networks.PUBLIC,
  STANDALONE: Networks.STANDALONE,
};

// Known Testnet Stellar Asset Contract (SAC) addresses
export const TESTNET_SAC_ADDRESSES = {
  NATIVE_XLM: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
};

export function getNetworkPassphrase(): string {
  if (env.STELLAR_NETWORK === 'PUBLIC') return Networks.PUBLIC;
  if (env.STELLAR_NETWORK === 'STANDALONE') return Networks.STANDALONE;
  return Networks.TESTNET;
}
