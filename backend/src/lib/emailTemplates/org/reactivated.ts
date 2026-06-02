import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  ownerName: string;
  orgName: string;
  loginUrl: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>Account reactivated</h1>
    <p>Hi ${data.ownerName},</p>
    <p>Your organization <strong>${data.orgName}</strong> has been reactivated. You now have full access again.</p>
    <div class="info-box success">
      <p style="margin:0">All your projects, clients, and data are exactly as you left them.</p>
    </div>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.loginUrl}" class="btn">Go to dashboard →</a>
    </p>
  `, branding);

  const text = textLayout(
    `Hi ${data.ownerName},\n\n"${data.orgName}" has been reactivated. Log in: ${data.loginUrl}`,
    branding
  );

  return { subject: `Account reactivated — ${data.orgName}`, html, text };
}
