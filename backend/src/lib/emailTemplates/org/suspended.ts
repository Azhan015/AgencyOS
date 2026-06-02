import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  ownerName: string;
  orgName: string;
  reason?: string;
  supportUrl?: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>Account suspended</h1>
    <p>Hi ${data.ownerName},</p>
    <p>Your organization <strong>${data.orgName}</strong> has been suspended.</p>
    ${data.reason ? `
    <div class="info-box danger">
      <p class="label">Reason</p>
      <p class="value" style="margin:4px 0 0">${data.reason}</p>
    </div>` : ''}
    <p>To resolve this, please contact our support team at <a href="mailto:${branding.supportEmail}">${branding.supportEmail}</a>${data.supportUrl ? ` or visit <a href="${data.supportUrl}">our support portal</a>` : ''}.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.ownerName},\n\n"${data.orgName}" has been suspended.\n\n${data.reason ? `Reason: ${data.reason}\n\n` : ''}Contact support: ${branding.supportEmail}`,
    branding
  );

  return { subject: `Account suspended — ${data.orgName}`, html, text };
}
