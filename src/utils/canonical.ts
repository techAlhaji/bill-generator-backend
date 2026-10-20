import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';

export interface CanonicalInvoicePayload {
  client: {
    name: string;
    taxId?: string | null;
  };
  currency: string;
  dueDate: string;
  invoiceNumber: string;
  issueDate: string;
  items: Array<{
    description: string;
    quantityScale4: string;
    unitPriceMinor: string;
  }>;
  merchant: {
    businessName: string;
    stellarAddress: string;
  };
  totalMinor: string;
}

/**
 * Derives the canonical 32-byte on-chain invoice identifier (prefixed with 0x).
 * Defined as: SHA-256("stellar-invoice:" + merchantId + ":" + invoiceNumber)
 */
export function deriveOnchainInvoiceId(merchantId: string, invoiceNumber: string): string {
  const rawInput = `stellar-invoice:${merchantId}:${invoiceNumber}`;
  const digest = createHash('sha256').update(rawInput, 'utf8').digest('hex');
  return `0x${digest}`;
}

/**
 * Computes deterministic RFC 8785 SHA-256 content hash (prefixed with 0x).
 */
export function computeInvoiceContentHash(payload: CanonicalInvoicePayload): string {
  const canonicalizeFn = (typeof canonicalize === 'function' ? canonicalize : (canonicalize as any).default) as (obj: any) => string | undefined;
  const canonicalJson = canonicalizeFn(payload);
  if (!canonicalJson) {
    throw new Error('Failed to canonicalize invoice JSON payload using RFC 8785');
  }
  const digest = createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  return `0x${digest}`;
}
