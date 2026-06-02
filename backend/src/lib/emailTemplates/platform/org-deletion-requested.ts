import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  orgId: string;
  orgName: string;
  ownerId: string;
  reason?: string;
  deletionScheduledFor: Date;
  platformUrl?: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const deletionStr = new Date(data.deletionScheduledFor).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const reviewUrl = `${data.platformUrl ?? branding.frontendUrl}/platform/organizations/${data.orgId}`;

  const html = baseLayout(`
    <h1>Organization deletion requested</h1>
    <p>An organization owner has requested account deletion.</p>
    <div class="info-box warning">
      <p class="label">Organization</p>
      <p class="value">${data.orgName}</p>
      <p class="label" style="margin-top:12px">Scheduled deletion</p>
      <p class="value">${deletionStr}</p>
      ${data.reason ? `<p class="label" style="margin-top:12px">Reason</p><p class="value">${data.reason}</p>` : ''}
    </div>
    <p style="text-align:center;margin:28px 0">
      <a href="${reviewUrl}" class="btn btn-secondary">View organization →</a>
    </p>
  `, branding);

  const text = textLayout(
    `Org deletion requested:\n\nName: ${data.orgName}\nScheduled: ${deletionStr}\n${data.reason ? `Reason: ${data.reason}\n` : ''}\nView: ${reviewUrl}`,
    branding
  );

  return { subject: `Org deletion scheduled — ${data.orgName}`, html, text };
}
