import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  clientName: string;
  agencyName: string;
  inviteLink: string;
  agencyEmail: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>You've been invited to the client portal</h1>
    <p>Hi ${data.clientName},</p>
    <p><strong>${data.agencyName}</strong> has invited you to their client portal where you can track your projects, review deliverables, and manage invoices.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.inviteLink}" class="btn">Accept invitation →</a>
    </p>
    <hr class="divider" />
    <p style="font-size:13px;color:#6b7280">This link expires in 72 hours. Questions? Contact <a href="mailto:${data.agencyEmail}">${data.agencyEmail}</a>.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.clientName},\n\n${data.agencyName} has invited you to their client portal.\n\nAccept: ${data.inviteLink}\n\nThis link expires in 72 hours.`,
    branding
  );

  return { subject: `You're invited to ${data.agencyName}'s client portal`, html, text };
}
