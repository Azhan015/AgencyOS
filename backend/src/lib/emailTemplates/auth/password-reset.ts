import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  name: string;
  link: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>Reset your password</h1>
    <p>Hi ${data.name},</p>
    <p>We received a request to reset your password for ${branding.agencyName}. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.link}" class="btn">Reset password →</a>
    </p>
    <hr class="divider" />
    <p style="font-size:13px;color:#6b7280">If you didn't request a password reset, you can safely ignore this email. Your password won't change.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.name},\n\nReset your password (expires in 1 hour):\n${data.link}\n\nIf you didn't request this, ignore this email.`,
    branding
  );

  return { subject: `Reset your ${branding.agencyName} password`, html, text };
}
