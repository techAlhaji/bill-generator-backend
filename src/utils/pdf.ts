import PDFDocument from 'pdfkit';
import { formatMinorToDecimalString, formatQuantityScale4 } from './math.js';

export interface InvoicePdfData {
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string;
  currencyType: string;
  assetCode: string;
  subtotalMinor: bigint;
  taxRateBps: number;
  taxMinor: bigint;
  discountMinor: bigint;
  totalMinor: bigint;
  amountStroops: bigint;
  memoText: string;
  contentHash: string;
  merchant: {
    businessName: string;
    stellarAddress: string;
    email: string;
  };
  client: {
    name: string;
    email: string;
    address?: string | null;
    taxId?: string | null;
  };
  items: Array<{
    description: string;
    quantityScale4: bigint;
    unitPriceMinor: bigint;
    totalMinor: bigint;
  }>;
  paidAt?: string | null;
}

export function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Invoice ${data.invoiceNumber}`,
          Author: data.merchant.businessName,
          Subject: `Stellar Invoice ${data.invoiceNumber}`,
          Keywords: 'Stellar, Invoice, Soroban, Payment',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const primaryColor = '#0f172a';
      const secondaryColor = '#475569';
      const accentColor = '#2563eb';
      const statusColor =
        data.status === 'PAID'
          ? '#16a34a'
          : data.status === 'OVERDUE'
          ? '#dc2626'
          : data.status === 'ISSUED'
          ? '#2563eb'
          : '#64748b';

      // Header Banner
      doc.rect(40, 40, 515, 60).fill('#f8fafc');
      doc.fillColor(primaryColor).fontSize(20).text('STELLAR INVOICE', 55, 52, { bold: true } as never);
      doc.fontSize(10).fillColor(secondaryColor).text(`Invoice #: ${data.invoiceNumber}`, 55, 78);

      // Status Badge
      doc.roundedRect(440, 52, 100, 26, 4).fill(statusColor);
      doc.fillColor('#ffffff').fontSize(11).text(data.status, 440, 60, { width: 100, align: 'center' });

      doc.moveDown(3);

      // Merchant & Client 2-column info
      const colTop = 120;
      doc.fillColor(primaryColor).fontSize(11).text('ISSUED BY:', 45, colTop, { bold: true } as never);
      doc.fillColor(secondaryColor).fontSize(10);
      doc.text(data.merchant.businessName, 45, colTop + 16);
      doc.text(data.merchant.email, 45, colTop + 30);
      doc.text(`Stellar: ${data.merchant.stellarAddress.slice(0, 12)}...${data.merchant.stellarAddress.slice(-8)}`, 45, colTop + 44);

      doc.fillColor(primaryColor).fontSize(11).text('BILLED TO:', 320, colTop, { bold: true } as never);
      doc.fillColor(secondaryColor).fontSize(10);
      doc.text(data.client.name, 320, colTop + 16);
      doc.text(data.client.email, 320, colTop + 30);
      if (data.client.address) doc.text(data.client.address, 320, colTop + 44);
      if (data.client.taxId) doc.text(`Tax ID: ${data.client.taxId}`, 320, colTop + 58);

      // Invoice metadata bar
      const metaTop = 195;
      doc.rect(40, metaTop, 515, 30).fill('#f1f5f9');
      doc.fillColor(secondaryColor).fontSize(9);
      doc.text(`Issue Date: ${data.issueDate}`, 50, metaTop + 10);
      doc.text(`Due Date: ${data.dueDate}`, 200, metaTop + 10);
      doc.text(`Asset: ${data.assetCode} (${data.currencyType})`, 360, metaTop + 10);

      // Line Items Table Header
      const tableTop = 240;
      doc.rect(40, tableTop, 515, 24).fill(primaryColor);
      doc.fillColor('#ffffff').fontSize(9);
      doc.text('DESCRIPTION', 50, tableTop + 7);
      doc.text('QTY', 310, tableTop + 7, { width: 50, align: 'right' });
      doc.text('UNIT PRICE', 375, tableTop + 7, { width: 75, align: 'right' });
      doc.text('AMOUNT', 465, tableTop + 7, { width: 80, align: 'right' });

      // Line Items Rows
      let currentY = tableTop + 24;
      data.items.forEach((item, index) => {
        const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        doc.rect(40, currentY, 515, 22).fill(rowBg);
        doc.fillColor(primaryColor).fontSize(9);
        doc.text(item.description, 50, currentY + 6, { width: 250, ellipsis: true });
        doc.text(formatQuantityScale4(item.quantityScale4), 310, currentY + 6, { width: 50, align: 'right' });
        doc.text(formatMinorToDecimalString(item.unitPriceMinor), 375, currentY + 6, { width: 75, align: 'right' });
        doc.text(formatMinorToDecimalString(item.totalMinor), 465, currentY + 6, { width: 80, align: 'right' });
        currentY += 22;
      });

      // Totals Box
      const totalsTop = currentY + 15;
      const totalsLeft = 320;
      doc.rect(totalsLeft, totalsTop, 235, 100).fill('#f8fafc');
      doc.fillColor(secondaryColor).fontSize(9);

      doc.text('Subtotal:', totalsLeft + 15, totalsTop + 12);
      doc.text(`${formatMinorToDecimalString(data.subtotalMinor)} ${data.assetCode}`, totalsLeft + 120, totalsTop + 12, { width: 95, align: 'right' });

      const taxPercent = (data.taxRateBps / 100).toFixed(2);
      doc.text(`Tax (${taxPercent}%):`, totalsLeft + 15, totalsTop + 28);
      doc.text(`${formatMinorToDecimalString(data.taxMinor)} ${data.assetCode}`, totalsLeft + 120, totalsTop + 28, { width: 95, align: 'right' });

      doc.text('Discount:', totalsLeft + 15, totalsTop + 44);
      doc.text(`-${formatMinorToDecimalString(data.discountMinor)} ${data.assetCode}`, totalsLeft + 120, totalsTop + 44, { width: 95, align: 'right' });

      doc.rect(totalsLeft + 10, totalsTop + 62, 215, 1).fill('#cbd5e1');

      doc.fillColor(primaryColor).fontSize(11).text('Total Due:', totalsLeft + 15, totalsTop + 72, { bold: true } as never);
      doc.fillColor(accentColor).fontSize(11).text(
        `${formatMinorToDecimalString(data.totalMinor)} ${data.assetCode}`,
        totalsLeft + 100,
        totalsTop + 72,
        { width: 115, align: 'right', bold: true } as never
      );

      // Payment Instructions & Stellar Commitment Box
      const payBoxTop = totalsTop + 120;
      doc.rect(40, payBoxTop, 515, 95).fill('#f0f9ff').stroke('#bae6fd');
      doc.fillColor(primaryColor).fontSize(10).text('STELLAR PAYMENT INSTRUCTIONS', 50, payBoxTop + 10, { bold: true } as never);

      doc.fontSize(8.5).fillColor(secondaryColor);
      doc.text(`Recipient Address: ${data.merchant.stellarAddress}`, 50, payBoxTop + 28);
      doc.text(`Required Memo (Text): ${data.memoText}`, 50, payBoxTop + 42, { bold: true } as never);
      doc.text(`Required Amount: ${formatMinorToDecimalString(data.totalMinor)} ${data.assetCode} (${data.amountStroops.toString()} stroops)`, 50, payBoxTop + 56);
      doc.text(`RFC 8785 Content Hash: ${data.contentHash}`, 50, payBoxTop + 72);

      // Footer
      doc.fillColor('#94a3b8').fontSize(8).text(
        'Tamper-evident invoice cryptographically registered on the Stellar blockchain network.',
        40,
        770,
        { width: 515, align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
