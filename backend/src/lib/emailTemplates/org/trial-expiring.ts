import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  ownerName: string;
  orgName: string;
  daysLeft: number;
  trialEndsAt?: Date;
  upgradeUrl: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const urgency = data.daysLeft <= 1 ? 'danger' : data.daysLeft <= 3 ? 'warning' : '';
  const expiryStr = data.trialEndsAt
    ? new Date(data.trialEndsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : `in ${data.daysLeft} day${data.daysLeft !== 1 ? 's' : ''}`;

  const html = baseLayout(`
    <h1>Your trial ${data.daysLeft <= 1 ? 'ends tomorrow' : `expires in ${data.daysLeft} days`}</h1>
    <p>Hi ${data.ownerName},</p>
    <p>Your free trial for <strong>${data.orgName}</strong> expires <strong>${expiryStr}</strong>.</p>
    <div class="info-box ${urgency}">
      <p style="margin:0">Upgrade now to keep access to all your projects, clients, and data. Your work won't be lost — just upgrade before the trial ends.</p>
    </div>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.upgradeUrl}" class="btn">Choose a plan →</a>
    </p>
    <hr class="divider" />
    <p style="font-size:13px;color:#6b7280">After your trial ends, your account will be paused. You can reactivate at any time by subscribing.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.ownerName},\n\nYour trial for "${data.orgName}" expires ${expiryStr}.\n\nUpgrade now: ${data.upgradeUrl}`,
    branding
  );

  return {
    subject: `Your trial ${data.daysLeft <= 1 ? 'ends tomorrow' : `expires in ${data.daysLeft} days`} — ${data.orgName}`,
    html,
    text,
  };
}
