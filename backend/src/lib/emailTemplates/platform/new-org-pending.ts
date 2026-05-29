import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  orgId: string;
  orgName: string;
  ownerEmail: string;
  platformUrl?: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const reviewUrl = `${data.platformUrl ?? branding.frontendUrl}/platform/organizations/${data.orgId}`;

  const html = baseLayout(`
    <h1>New organization pending review</h1>
    <p>A new organization has registered and is awaiting approval.</p>
    <div class="info-box">
      <p class="label">Organization</p>
      <p class="value">${data.orgName}</p>
      <p class="label" style="margin-top:12px">Owner email</p>
      <p class="value">${data.ownerEmail}</p>
      <p class="label" style="margin-top:12px">Organization ID</p>
      <p class="value" style="font-family:monospace;font-size:13px">${data.orgId}</p>
    </div>
    <p style="text-align:center;margin:28px 0">
      <a href="${reviewUrl}" class="btn">Review application →</a>
    </p>
  `, branding);

  const text = textLayout(
    `New org pending review:\n\nName: ${data.orgName}\nOwner: ${data.ownerEmail}\nID: ${data.orgId}\n\nReview: ${reviewUrl}`,
    branding
  );

  return { subject: `New org pending review — ${data.orgName}`, html, text };
}
