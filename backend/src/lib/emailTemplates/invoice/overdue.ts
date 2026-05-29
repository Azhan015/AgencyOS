import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  clientName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  payLink: string;
  daysOverdue?: number;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>Invoice overdue — action required</h1>
    <p>Hi ${data.clientName},</p>
    <p>Invoice <strong>${data.invoiceNumber}</strong> from <strong>${branding.agencyName}</strong> was due on <strong>${data.dueDate}</strong>${data.daysOverdue ? ` (${data.daysOverdue} days ago)` : ''} and remains unpaid.</p>
    <div class="info-box danger">
      <p class="label">Amount overdue</p>
      <p class="value" style="font-size:24px;font-weight:700;color:#dc2626">${data.amount}</p>
    </div>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.payLink}" class="btn btn-danger">Pay now →</a>
    </p>
    <hr class="divider" />
    <p style="font-size:13px;color:#6b7280">If you've already paid, please disregard this notice. Questions? Contact <a href="mailto:${branding.supportEmail}">${branding.supportEmail}</a>.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.clientName},\n\nInvoice ${data.invoiceNumber} is OVERDUE.\nAmount: ${data.amount}\nWas due: ${data.dueDate}\n\nPay now: ${data.payLink}`,
    branding
  );

  return { subject: `OVERDUE: Invoice ${data.invoiceNumber} — ${data.amount}`, html, text };
}
