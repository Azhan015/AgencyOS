import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  ownerName: string;
  orgName: string;
  upgradeUrl: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>Your trial has ended</h1>
    <p>Hi ${data.ownerName},</p>
    <p>Your free trial for <strong>${data.orgName}</strong> has expired. Your account is currently paused.</p>
    <div class="info-box warning">
      <p style="margin:0"><strong>Your data is safe.</strong> Subscribe to reactivate your account and pick up right where you left off.</p>
    </div>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.upgradeUrl}" class="btn">Reactivate now →</a>
    </p>
  `, branding);

  const text = textLayout(
    `Hi ${data.ownerName},\n\nYour trial for "${data.orgName}" has expired. Your data is safe.\n\nReactivate: ${data.upgradeUrl}`,
    branding
  );

  return { subject: `Trial expired — ${data.orgName}`, html, text };
}
