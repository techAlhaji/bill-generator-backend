import { describe, it, expect } from 'vitest';
import {
  calculateLineTotalMinor,
  calculateTaxMinor,
  calculateInvoiceTotals,
  parseDecimalStringToStroops,
  formatMinorToDecimalString,
  formatQuantityScale4,
  SCALE_4,
  STROOPS_PER_XLM,
} from '../../src/utils/math.js';

describe('Monetary Mathematics & Zero-Float Invariants', () => {
  describe('calculateLineTotalMinor', () => {
    it('calculates integer line total with 10^4 scale correctly', () => {
      // 1.0000 unit * 5,000,000 stroops (0.5 XLM) = 5,000,000 stroops
      const qty = 10_000n;
      const unitPrice = 5_000_000n;
      expect(calculateLineTotalMinor(qty, unitPrice)).toBe(5_000_000n);
    });

    it('calculates fractional unit quantities accurately', () => {
      // 1.5000 units * 10,000,000 stroops = 15,000,000 stroops
      const qty = 15_000n;
      const unitPrice = 10_000_000n;
      expect(calculateLineTotalMinor(qty, unitPrice)).toBe(15_000_000n);
    });

    it('handles half-up integer rounding accurately', () => {
      // 0.3333 units * 100 minor units = 33.33 -> rounds to 33
      // 3333 * 100 = 333300. (333300 + 5000) / 10000 = 33
      expect(calculateLineTotalMinor(3333n, 100n)).toBe(33n);

      // 0.0005 units * 10000 = 5 minor units -> (5 * 10000 + 5000) / 10000 = 5
      expect(calculateLineTotalMinor(5n, 10_000n)).toBe(5n);
    });

    it('throws when given negative inputs', () => {
      expect(() => calculateLineTotalMinor(-10_000n, 5_000_000n)).toThrow();
      expect(() => calculateLineTotalMinor(10_000n, -5_000_000n)).toThrow();
    });
  });

  describe('calculateTaxMinor', () => {
    it('calculates tax in basis points (1% = 100 bps, 10% = 1000 bps)', () => {
      const subtotal = 100_000_000n; // 10 XLM
      // 10% tax = 1000 bps -> 10_000_000 stroops (1 XLM)
      expect(calculateTaxMinor(subtotal, 1000)).toBe(10_000_000n);

      // 8.25% tax = 825 bps on 100_000_000
      // 100_000_000 * 825 = 82_500_000_000. (82500000000 + 5000) / 10000 = 8_250_000
      expect(calculateTaxMinor(subtotal, 825)).toBe(8_250_000n);
    });

    it('returns 0 for 0 bps tax rate or 0 subtotal', () => {
      expect(calculateTaxMinor(100_000_000n, 0)).toBe(0n);
      expect(calculateTaxMinor(0n, 1000)).toBe(0n);
    });

    it('rejects invalid tax rates outside [0, 10000] bps range', () => {
      expect(() => calculateTaxMinor(100_000_000n, -1)).toThrow();
      expect(() => calculateTaxMinor(100_000_000n, 10_001)).toThrow();
    });
  });

  describe('calculateInvoiceTotals', () => {
    it('computes subtotal, tax, and discount breakdown correctly', () => {
      const items = [
        { quantityScale4: 20_000n, unitPriceMinor: 5_000_000n }, // 2 * 0.5 = 1.0 XLM (10,000,000 stroops)
        { quantityScale4: 10_000n, unitPriceMinor: 20_000_000n }, // 1 * 2.0 = 2.0 XLM (20,000,000 stroops)
      ];
      // Subtotal = 30,000,000 stroops
      // Tax @ 5% (500 bps) = 1,500,000 stroops
      // Discount = 500,000 stroops
      // Total = 30,000,000 + 1,500,000 - 500,000 = 31,000,000 stroops
      const result = calculateInvoiceTotals(items, 500, 500_000n);
      expect(result.subtotalMinor).toBe(30_000_000n);
      expect(result.taxMinor).toBe(1_500_000n);
      expect(result.discountMinor).toBe(500_000n);
      expect(result.totalMinor).toBe(31_000_000n);
    });

    it('floors total to 0 if discount exceeds gross amount', () => {
      const items = [{ quantityScale4: 10_000n, unitPriceMinor: 1_000_000n }];
      const result = calculateInvoiceTotals(items, 0, 5_000_000n);
      expect(result.totalMinor).toBe(0n);
    });
  });

  describe('parseDecimalStringToStroops', () => {
    it('converts 7-decimal Horizon string to stroops without floating point', () => {
      expect(parseDecimalStringToStroops('100.5000000')).toBe(1_005_000_000n);
      expect(parseDecimalStringToStroops('0.0000001')).toBe(1n);
      expect(parseDecimalStringToStroops('1')).toBe(10_000_000n);
      expect(parseDecimalStringToStroops('10.5')).toBe(105_000_000n);
      expect(parseDecimalStringToStroops('0')).toBe(0n);
      expect(parseDecimalStringToStroops('99999999.9999999')).toBe(999_999_999_999_999n);
    });

    it('rejects invalid or non-numeric strings', () => {
      expect(() => parseDecimalStringToStroops('')).toThrow();
      expect(() => parseDecimalStringToStroops('abc')).toThrow();
      expect(() => parseDecimalStringToStroops('-10.5')).toThrow();
      expect(() => parseDecimalStringToStroops('10.5.2')).toThrow();
    });
  });

  describe('Formatting helpers', () => {
    it('formats minor units to decimal strings', () => {
      expect(formatMinorToDecimalString(1_005_000_000n, 7)).toBe('100.5000000');
      expect(formatMinorToDecimalString(1n, 7)).toBe('0.0000001');
      expect(formatMinorToDecimalString(0n, 7)).toBe('0.0000000');
    });

    it('formats scale 4 quantities to decimal strings', () => {
      expect(formatQuantityScale4(10_000n)).toBe('1');
      expect(formatQuantityScale4(15_000n)).toBe('1.5');
      expect(formatQuantityScale4(12_345n)).toBe('1.2345');
    });
  });
});
