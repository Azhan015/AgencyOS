import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  name: string;
  link: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>Your sign-in link</h1>
    <p>Hi ${data.name},</p>
    <p>Click the button below to sign in to ${branding.agencyName}. This link is valid for <strong>72 hours</strong> and can only be used once.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.link}" class="btn">Sign in →</a>
    </p>
    <hr class="divider" />
    <p style="font-size:13px;color:#6b7280">If you didn't request this, you can safely ignore this email. Your account is secure.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.name},\n\nYour sign-in link (valid 72 hours):\n${data.link}\n\nIf you didn't request this, ignore this email.`,
    branding
  );

  return { subject: `Sign in to ${branding.agencyName}`, html, text };
}
