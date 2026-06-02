import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  clientName: string;
  contractTitle: string;
  agencyName: string;
  link: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>Contract ready for your signature</h1>
    <p>Hi ${data.clientName},</p>
    <p><strong>${data.agencyName}</strong> has sent you a contract for review and signature.</p>
    <div class="info-box">
      <p class="label">Contract</p>
      <p class="value">${data.contractTitle}</p>
    </div>
    <p>Please review the contract carefully and sign electronically using the link below.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.link}" class="btn">Review &amp; sign →</a>
    </p>
    <hr class="divider" />
    <p style="font-size:13px;color:#6b7280">Questions about this contract? Contact <a href="mailto:${branding.supportEmail}">${branding.supportEmail}</a>.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.clientName},\n\n${data.agencyName} has sent you a contract: "${data.contractTitle}"\n\nReview and sign: ${data.link}`,
    branding
  );

  return { subject: `Contract ready for signature — ${data.contractTitle}`, html, text };
}
