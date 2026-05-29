import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  newOwnerName: string;
  orgName: string;
  loginUrl: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>You're now the owner</h1>
    <p>Hi ${data.newOwnerName},</p>
    <p>Ownership of <strong>${data.orgName}</strong> has been transferred to you. You now have full administrative control of the organization.</p>
    <div class="info-box success">
      <p style="margin:0">As the new owner you can manage billing, invite admins, and configure all organization settings.</p>
    </div>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.loginUrl}" class="btn">Go to dashboard →</a>
    </p>
  `, branding);

  const text = textLayout(
    `Hi ${data.newOwnerName},\n\nOwnership of "${data.orgName}" has been transferred to you.\n\nLog in: ${data.loginUrl}`,
    branding
  );

  return { subject: `You're now the owner of ${data.orgName}`, html, text };
}
