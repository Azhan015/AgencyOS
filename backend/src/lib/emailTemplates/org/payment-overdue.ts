import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  ownerName: string;
  orgName: string;
  gracePeriodEnd?: Date;
  updateBillingUrl: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const graceStr = data.gracePeriodEnd
    ? new Date(data.gracePeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : 'soon';

  const html = baseLayout(`
    <h1>Payment issue — action required</h1>
    <p>Hi ${data.ownerName},</p>
    <p>We were unable to process your payment for <strong>${data.orgName}</strong>. Your account is currently in a grace period and will be suspended on <strong>${graceStr}</strong> if payment is not resolved.</p>
    <div class="info-box warning">
      <p style="margin:0">Update your billing information to avoid service interruption.</p>
    </div>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.updateBillingUrl}" class="btn">Update billing →</a>
    </p>
  `, branding);

  const text = textLayout(
    `Hi ${data.ownerName},\n\nPayment failed for "${data.orgName}". Grace period ends ${graceStr}.\n\nUpdate billing: ${data.updateBillingUrl}`,
    branding
  );

  return { subject: `Payment required — ${data.orgName}`, html, text };
}
