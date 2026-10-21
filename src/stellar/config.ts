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

/**
 * Validates whether an asset is authorized under the configured ASSET_ALLOWLIST.
 * Supports native XLM, Classic assets (CODE or CODE:ISSUER), and Soroban token contract IDs (C...).
 * Wildcard '*' permits all valid assets.
 */
export function isAssetAllowed(
  assetCode: string,
  assetIssuer?: string | null,
  tokenContractId?: string | null
): boolean {
  const allowlist = env.ASSET_ALLOWLIST?.trim() || '*';
  if (allowlist === '*' || allowlist === '') {
    return true;
  }

  const allowedTokens = allowlist
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  // Check code directly (e.g. XLM, USDC)
  if (allowedTokens.includes(assetCode)) {
    return true;
  }

  // Check asset code with issuer (e.g. USDC:GBBD47IF...)
  if (assetIssuer && allowedTokens.includes(`${assetCode}:${assetIssuer}`)) {
    return true;
  }

  // Check Soroban token contract ID (e.g. CDLZFC3S...)
  if (tokenContractId && allowedTokens.includes(tokenContractId)) {
    return true;
  }

  return false;
}
