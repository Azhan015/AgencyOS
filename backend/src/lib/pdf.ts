import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import { env } from '../config/env';

interface InvoiceData {
  invoiceNumber: string;
  issuedAt: Date;
  dueDate: Date;
  clientName: string;
  clientEmail: string;
  agencyName: string;
  agencyEmail: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  subtotal: number;
  tax: number;
  taxRate: number;
  discount: number;
  total: number;
  currency: string;
  notes?: string;
  status: string;
}

export async function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const primaryColor = rgb(0.145, 0.388, 0.922); // #2563EB
  const darkColor = rgb(0.035, 0.035, 0.043);    // #09090B
  const grayColor = rgb(0.443, 0.443, 0.478);    // #71717A
  const lightGray = rgb(0.894, 0.894, 0.906);    // #E4E4E7

  // Header background
  page.drawRectangle({
    x: 0,
    y: height - 120,
    width,
    height: 120,
    color: primaryColor,
  });

  // Agency name
  page.drawText(data.agencyName, {
    x: 40,
    y: height - 50,
    size: 24,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  // Invoice label
  page.drawText('INVOICE', {
    x: width - 140,
    y: height - 50,
    size: 20,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  // Invoice number
  page.drawText(data.invoiceNumber, {
    x: width - 140,
    y: height - 75,
    size: 12,
    font: helvetica,
    color: rgb(0.8, 0.8, 0.9),
  });

  // Agency email
  page.drawText(data.agencyEmail, {
    x: 40,
    y: height - 75,
    size: 11,
    font: helvetica,
    color: rgb(0.8, 0.8, 0.9),
  });

  let yPos = height - 160;

  // Bill To section
  page.drawText('BILL TO', {
    x: 40,
    y: yPos,
    size: 10,
    font: helveticaBold,
    color: grayColor,
  });

  page.drawText('INVOICE DETAILS', {
    x: 300,
    y: yPos,
    size: 10,
    font: helveticaBold,
    color: grayColor,
  });

  yPos -= 20;

  page.drawText(data.clientName, {
    x: 40,
    y: yPos,
    size: 13,
    font: helveticaBold,
    color: darkColor,
  });

  page.drawText(`Issue Date: ${data.issuedAt.toLocaleDateString()}`, {
    x: 300,
    y: yPos,
    size: 11,
    font: helvetica,
    color: darkColor,
  });

  yPos -= 18;

  page.drawText(data.clientEmail, {
    x: 40,
    y: yPos,
    size: 11,
    font: helvetica,
    color: grayColor,
  });

  page.drawText(`Due Date: ${data.dueDate.toLocaleDateString()}`, {
    x: 300,
    y: yPos,
    size: 11,
    font: helvetica,
    color: darkColor,
  });

  yPos -= 18;

  const statusColors: Record<string, ReturnType<typeof rgb>> = {
    PAID: rgb(0.086, 0.639, 0.290),
    OVERDUE: rgb(0.863, 0.149, 0.149),
    SENT: rgb(0.145, 0.388, 0.922),
    DRAFT: grayColor,
  };

  page.drawText(`Status: ${data.status}`, {
    x: 300,
    y: yPos,
    size: 11,
    font: helveticaBold,
    color: statusColors[data.status] || grayColor,
  });

  yPos -= 40;

  // Divider
  page.drawLine({
    start: { x: 40, y: yPos },
    end: { x: width - 40, y: yPos },
    thickness: 1,
    color: lightGray,
  });

  yPos -= 25;

  // Table header
  page.drawRectangle({
    x: 40,
    y: yPos - 5,
    width: width - 80,
    height: 25,
    color: rgb(0.957, 0.957, 0.965),
  });

  page.drawText('DESCRIPTION', { x: 50, y: yPos + 5, size: 10, font: helveticaBold, color: grayColor });
  page.drawText('QTY', { x: 340, y: yPos + 5, size: 10, font: helveticaBold, color: grayColor });
  page.drawText('UNIT PRICE', { x: 390, y: yPos + 5, size: 10, font: helveticaBold, color: grayColor });
  page.drawText('AMOUNT', { x: 490, y: yPos + 5, size: 10, font: helveticaBold, color: grayColor });

  yPos -= 30;

  // Line items
  for (const item of data.lineItems) {
    page.drawText(item.description, { x: 50, y: yPos, size: 11, font: helvetica, color: darkColor });
    page.drawText(String(item.quantity), { x: 350, y: yPos, size: 11, font: helvetica, color: darkColor });
    page.drawText(formatCurrency(item.unitPrice, data.currency), { x: 390, y: yPos, size: 11, font: helvetica, color: darkColor });
    page.drawText(formatCurrency(item.amount, data.currency), { x: 490, y: yPos, size: 11, font: helvetica, color: darkColor });

    yPos -= 5;
    page.drawLine({
      start: { x: 40, y: yPos },
      end: { x: width - 40, y: yPos },
      thickness: 0.5,
      color: lightGray,
    });
    yPos -= 20;
  }

  yPos -= 10;

  // Totals
  const totalsX = 380;

  const drawTotalRow = (label: string, value: string, bold = false, color = darkColor) => {
    page.drawText(label, {
      x: totalsX,
      y: yPos,
      size: 11,
      font: bold ? helveticaBold : helvetica,
      color: grayColor,
    });
    page.drawText(value, {
      x: 490,
      y: yPos,
      size: 11,
      font: bold ? helveticaBold : helvetica,
      color,
    });
    yPos -= 20;
  };

  drawTotalRow('Subtotal', formatCurrency(data.subtotal, data.currency));
  if (data.discount > 0) drawTotalRow('Discount', `-${formatCurrency(data.discount, data.currency)}`);
  if (data.tax > 0) drawTotalRow(`Tax (${data.taxRate}%)`, formatCurrency(data.tax, data.currency));

  yPos -= 5;
  page.drawLine({
    start: { x: totalsX, y: yPos },
    end: { x: width - 40, y: yPos },
    thickness: 1,
    color: darkColor,
  });
  yPos -= 20;

  drawTotalRow('TOTAL DUE', formatCurrency(data.total, data.currency), true, primaryColor);

  // Notes
  if (data.notes) {
    yPos -= 20;
    page.drawText('Notes:', { x: 40, y: yPos, size: 10, font: helveticaBold, color: grayColor });
    yPos -= 18;
    page.drawText(data.notes, { x: 40, y: yPos, size: 10, font: helvetica, color: grayColor, maxWidth: 400 });
  }

  // Footer
  page.drawLine({
    start: { x: 40, y: 60 },
    end: { x: width - 40, y: 60 },
    thickness: 1,
    color: lightGray,
  });

  page.drawText(`${data.agencyName} · ${data.agencyEmail}`, {
    x: 40,
    y: 40,
    size: 10,
    font: helvetica,
    color: grayColor,
  });

  page.drawText('Thank you for your business!', {
    x: width - 200,
    y: 40,
    size: 10,
    font: helvetica,
    color: grayColor,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', CAD: 'C$',
  };
  const symbol = symbols[currency.toUpperCase()] || currency + ' ';
  return `${symbol}${amount.toFixed(2)}`;
}

export async function generateContractPDF(title: string, content: string, signatures: {
  client?: { name: string; signedAt: Date; };
  agency?: { name: string; signedAt: Date; };
}): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();

  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const darkColor = rgb(0.035, 0.035, 0.043);
  const grayColor = rgb(0.443, 0.443, 0.478);
  const primaryColor = rgb(0.145, 0.388, 0.922);

  // Title
  page.drawText(title, {
    x: 40,
    y: height - 60,
    size: 20,
    font: helveticaBold,
    color: darkColor,
  });

  page.drawLine({
    start: { x: 40, y: height - 75 },
    end: { x: width - 40, y: height - 75 },
    thickness: 2,
    color: primaryColor,
  });

  // Content (simplified - strip HTML tags)
  const plainContent = content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const lines = plainContent.split('\n').filter(l => l.trim());

  let yPos = height - 110;
  for (const line of lines) {
    if (yPos < 100) break;
    const chunks = chunkText(line, 90);
    for (const chunk of chunks) {
      if (yPos < 100) break;
      page.drawText(chunk, {
        x: 40,
        y: yPos,
        size: 10,
        font: helvetica,
        color: darkColor,
      });
      yPos -= 16;
    }
    yPos -= 4;
  }

  // Signatures
  if (signatures.client || signatures.agency) {
    yPos = Math.min(yPos, 200);

    page.drawLine({
      start: { x: 40, y: yPos + 20 },
      end: { x: width - 40, y: yPos + 20 },
      thickness: 1,
      color: rgb(0.894, 0.894, 0.906),
    });

    page.drawText('SIGNATURES', {
      x: 40,
      y: yPos,
      size: 10,
      font: helveticaBold,
      color: grayColor,
    });

    yPos -= 30;

    if (signatures.client) {
      page.drawText('Client Signature', { x: 40, y: yPos, size: 10, font: helveticaBold, color: darkColor });
      page.drawLine({ start: { x: 40, y: yPos - 25 }, end: { x: 220, y: yPos - 25 }, thickness: 1, color: darkColor });
      page.drawText(signatures.client.name, { x: 40, y: yPos - 40, size: 10, font: helvetica, color: darkColor });
      page.drawText(signatures.client.signedAt.toLocaleDateString(), { x: 40, y: yPos - 55, size: 9, font: helvetica, color: grayColor });
    }

    if (signatures.agency) {
      page.drawText('Agency Signature', { x: 300, y: yPos, size: 10, font: helveticaBold, color: darkColor });
      page.drawLine({ start: { x: 300, y: yPos - 25 }, end: { x: 480, y: yPos - 25 }, thickness: 1, color: darkColor });
      page.drawText(signatures.agency.name, { x: 300, y: yPos - 40, size: 10, font: helvetica, color: darkColor });
      page.drawText(signatures.agency.signedAt.toLocaleDateString(), { x: 300, y: yPos - 55, size: 9, font: helvetica, color: grayColor });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

function chunkText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).length > maxChars) {
      if (current) chunks.push(current.trim());
      current = word;
    } else {
      current += (current ? ' ' : '') + word;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}
