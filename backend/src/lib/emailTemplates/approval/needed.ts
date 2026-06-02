import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  clientName: string;
  projectName: string;
  deliverableName: string;
  link: string;
  submissionNote?: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const html = baseLayout(`
    <h1>Deliverable ready for your review</h1>
    <p>Hi ${data.clientName},</p>
    <p>A deliverable from <strong>${data.projectName}</strong> is ready for your review and approval.</p>
    <div class="info-box">
      <p class="label">Deliverable</p>
      <p class="value">${data.deliverableName}</p>
      ${data.submissionNote ? `<p class="label" style="margin-top:12px">Note from the team</p><p class="value">${data.submissionNote}</p>` : ''}
    </div>
    <p>Please review and let us know if you approve or have any feedback.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.link}" class="btn">Review deliverable →</a>
    </p>
  `, branding);

  const text = textLayout(
    `Hi ${data.clientName},\n\nDeliverable ready for review:\nProject: ${data.projectName}\nDeliverable: ${data.deliverableName}\n${data.submissionNote ? `Note: ${data.submissionNote}\n` : ''}\nReview: ${data.link}`,
    branding
  );

  return { subject: `Review needed — ${data.deliverableName}`, html, text };
}
