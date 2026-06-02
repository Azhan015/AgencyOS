import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  ownerName: string;
  orgName: string;
  slug: string;
  estimatedReviewTime?: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const reviewTime = data.estimatedReviewTime ?? '24–48 hours';
  const html = baseLayout(`
    <h1>We received your application</h1>
    <p>Hi ${data.ownerName},</p>
    <p>Thanks for registering <strong>${data.orgName}</strong> on ${branding.agencyName}. Your application is now in our review queue.</p>
    <div class="info-box">
      <p class="label">Organization</p>
      <p class="value">${data.orgName}</p>
      <p class="label" style="margin-top:12px">Slug</p>
      <p class="value">${data.slug}</p>
      <p class="label" style="margin-top:12px">Estimated review time</p>
      <p class="value">${reviewTime}</p>
    </div>
    <p>We'll email you as soon as a decision has been made. In the meantime, if you have any questions reach out to <a href="mailto:${branding.supportEmail}">${branding.supportEmail}</a>.</p>
  `, branding);

  const text = textLayout(
    `Hi ${data.ownerName},\n\nThanks for registering "${data.orgName}". Your application is under review.\n\nEstimated review time: ${reviewTime}\n\nWe'll be in touch soon.`,
    branding
  );

  return { subject: `Application received — ${data.orgName}`, html, text };
}
