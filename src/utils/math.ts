/**
 * Pure integer-based monetary mathematics module.
 * Zero floating-point arithmetic is permitted in this entire module.
 */

export const SCALE_4 = 10_000n;
export const STROOPS_PER_XLM = 10_000_000n;

/**
 * Calculates line total from quantity (scaled by 10^4) and unit price (minor units).
 * Uses integer half-up rounding: (quantity * unitPrice + 5000) / 10000
 */
export function calculateLineTotalMinor(quantityScale4: bigint, unitPriceMinor: bigint): bigint {
  if (quantityScale4 < 0n || unitPriceMinor < 0n) {
    throw new Error('Quantity and unit price must be non-negative integers');
  }
  const product = quantityScale4 * unitPriceMinor;
  return (product + 5_000n) / SCALE_4;
}

/**
 * Calculates tax in minor units from subtotal and tax rate in basis points (1% = 100 bps).
 * Uses integer half-up rounding: (subtotal * taxRateBps + 5000) / 10000
 */
export function calculateTaxMinor(subtotalMinor: bigint, taxRateBps: number): bigint {
  if (taxRateBps < 0 || taxRateBps > 10_000) {
    throw new Error('Tax rate must be between 0 and 10000 basis points');
  }
  if (taxRateBps === 0 || subtotalMinor === 0n) {
    return 0n;
  }
  const bpsBigInt = BigInt(taxRateBps);
  return (subtotalMinor * bpsBigInt + 5_000n) / SCALE_4;
}

/**
 * Computes the overall invoice breakdown:
 * - Subtotal = sum of line totals
 * - Tax = subtotal * taxRateBps / 10000
 * - Total = max(0, subtotal + tax - discount)
 */
export function calculateInvoiceTotals(
  items: Array<{ quantityScale4: bigint; unitPriceMinor: bigint }>,
  taxRateBps = 0,
  discountMinor = 0n
): {
  lineTotals: bigint[];
  subtotalMinor: bigint;
  taxMinor: bigint;
  discountMinor: bigint;
  totalMinor: bigint;
} {
  const lineTotals = items.map((item) => calculateLineTotalMinor(item.quantityScale4, item.unitPriceMinor));
  const subtotalMinor = lineTotals.reduce((acc, curr) => acc + curr, 0n);
  const taxMinor = calculateTaxMinor(subtotalMinor, taxRateBps);

  if (discountMinor < 0n) {
    throw new Error('Discount cannot be negative');
  }

  const grossTotal = subtotalMinor + taxMinor;
  const totalMinor = grossTotal > discountMinor ? grossTotal - discountMinor : 0n;

  return {
    lineTotals,
    subtotalMinor,
    taxMinor,
    discountMinor,
    totalMinor,
  };
}

/**
 * Converts Horizon 7-decimal string (e.g. "100.5000000" or "42") into stroops BigInt.
 * Strict zero-float string splitting and padding.
 */
export function parseDecimalStringToStroops(decimalStr: string): bigint {
  const trimmed = decimalStr.trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal string amount: "${decimalStr}"`);
  }

  const [wholePart, fractionPart = ''] = trimmed.split('.');
  const wholeBigInt = BigInt(wholePart);
  const normalizedFraction = fractionPart.padEnd(7, '0').slice(0, 7);
  const fractionBigInt = BigInt(normalizedFraction);

  return wholeBigInt * STROOPS_PER_XLM + fractionBigInt;
}

/**
 * Formats integer minor units to human-readable decimal string with specified decimals.
 * e.g. (1005000000n, 7) => "100.5000000"
 */
export function formatMinorToDecimalString(minor: bigint, decimals = 7): string {
  const divisor = 10n ** BigInt(decimals);
  const isNegative = minor < 0n;
  const abs = isNegative ? -minor : minor;

  const whole = abs / divisor;
  const fraction = abs % divisor;

  const fractionPadded = fraction.toString().padStart(decimals, '0');
  const result = `${whole}.${fractionPadded}`;
  return isNegative ? `-${result}` : result;
}

/**
 * Formats scaled quantity (scaled by 10^4) to decimal string.
 * e.g. 15000n => "1.5"
 */
export function formatQuantityScale4(quantityScale4: bigint): string {
  const whole = quantityScale4 / SCALE_4;
  const fraction = (quantityScale4 % SCALE_4).toString().padStart(4, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
