import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  clientName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  payLink: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>Invoice ${data.invoiceNumber}</h1>
    <p>Hi ${data.clientName},</p>
    <p>Please find your invoice from <strong>${branding.agencyName}</strong> below.</p>
    <div class="info-box">
      <p class="label">Invoice number</p>
      <p class="value">${data.invoiceNumber}</p>
      <p class="label" style="margin-top:12px">Amount due</p>
      <p class="value" style="font-size:24px;font-weight:700;color:#111827">${data.amount}</p>
      <p class="label" style="margin-top:12px">Due date</p>
      <p class="value">${data.dueDate}</p>
    </div>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.payLink}" class="btn">Pay now →</a>
    </p>
    <hr class="divider" />
    <p style="font-size:13px;color:#6b7280">Questions about this invoice? Reply to this email or contact <a href="mailto:${branding.supportEmail}">${branding.supportEmail}</a>.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.clientName},\n\nInvoice ${data.invoiceNumber} from ${branding.agencyName}\nAmount: ${data.amount}\nDue: ${data.dueDate}\n\nPay now: ${data.payLink}`,
    branding
  );

  return { subject: `Invoice ${data.invoiceNumber} — ${data.amount} due ${data.dueDate}`, html, text };
}
