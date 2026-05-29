import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  name: string;
  email: string;
  role: string;
  agencyName: string;
  loginUrl: string;
  tempPassword: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>You've been invited to ${data.agencyName}</h1>
    <p>Hi ${data.name},</p>
    <p>You've been added to <strong>${data.agencyName}</strong> as a <strong>${data.role}</strong>.</p>
    <div class="info-box">
      <p class="label">Your login credentials</p>
      <p class="value" style="margin:4px 0 0">Email: <strong>${data.email}</strong></p>
      <p class="value">Temporary password: <strong style="font-family:monospace">${data.tempPassword}</strong></p>
    </div>
    <p>Please log in and change your password immediately.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.loginUrl}" class="btn">Accept invitation →</a>
    </p>
    <hr class="divider" />
    <p style="font-size:13px;color:#6b7280">This invitation was sent to ${data.email}. If you weren't expecting this, you can safely ignore it.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.name},\n\nYou've been invited to ${data.agencyName} as ${data.role}.\n\nEmail: ${data.email}\nTemp password: ${data.tempPassword}\n\nLog in: ${data.loginUrl}`,
    branding
  );

  return { subject: `You've been invited to ${data.agencyName}`, html, text };
}
