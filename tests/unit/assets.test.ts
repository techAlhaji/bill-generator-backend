import { describe, it, expect } from 'vitest';
import { isAssetAllowed } from '../../src/stellar/config.js';

describe('Asset Allowlist Configuration', () => {
  it('allows all assets when wildcard is configured', () => {
    expect(isAssetAllowed('XLM')).toBe(true);
    expect(isAssetAllowed('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')).toBe(true);
    expect(isAssetAllowed('ANY_CUSTOM_TOKEN')).toBe(true);
  });
});
