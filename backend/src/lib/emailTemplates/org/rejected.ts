import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  ownerName: string;
  orgName: string;
  reason?: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>Application not approved</h1>
    <p>Hi ${data.ownerName},</p>
    <p>After reviewing your application for <strong>${data.orgName}</strong>, we're unable to approve it at this time.</p>
    ${data.reason ? `
    <div class="info-box warning">
      <p class="label">Reason</p>
      <p class="value" style="margin:4px 0 0">${data.reason}</p>
    </div>` : ''}
    <p>If you believe this is a mistake or would like to discuss further, please contact us at <a href="mailto:${branding.supportEmail}">${branding.supportEmail}</a>.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.ownerName},\n\nYour application for "${data.orgName}" was not approved.\n\n${data.reason ? `Reason: ${data.reason}\n\n` : ''}Contact us at ${branding.supportEmail} if you have questions.`,
    branding
  );

  return { subject: `Application update — ${data.orgName}`, html, text };
}
