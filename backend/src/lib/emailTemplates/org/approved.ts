import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  ownerName: string;
  orgName: string;
  trialDays: number;
  loginUrl: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>You're approved! 🎉</h1>
    <p>Hi ${data.ownerName},</p>
    <p>Great news — <strong>${data.orgName}</strong> has been approved. Your <strong>${data.trialDays}-day free trial</strong> starts now.</p>
    <div class="info-box success">
      <p style="margin:0"><strong>Your trial includes full access to all features.</strong> No credit card required during the trial period.</p>
    </div>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.loginUrl}" class="btn">Get started →</a>
    </p>
    <hr class="divider" />
    <p style="font-size:13px;color:#6b7280">Your trial ends in ${data.trialDays} days. We'll remind you before it expires so you can choose a plan that fits your team.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.ownerName},\n\n"${data.orgName}" has been approved!\n\nYour ${data.trialDays}-day free trial starts now.\n\nLog in: ${data.loginUrl}`,
    branding
  );

  return { subject: `You're approved — ${data.orgName} trial started`, html, text };
}
