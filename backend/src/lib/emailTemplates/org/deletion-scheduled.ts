import { baseLayout, textLayout, BrandingContext, defaultBranding } from '../base/layout';

interface Data {
  ownerName: string;
  orgName: string;
  deletionDate: Date;
  cancelUrl: string;
}

export function render(data: Data, branding: BrandingContext = defaultBranding) {
  const deletionStr = new Date(data.deletionDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const html = baseLayout(`
    <h1>Organization deletion scheduled</h1>
    <p>Hi ${data.ownerName},</p>
    <p>We've received your request to delete <strong>${data.orgName}</strong>. Your organization and all associated data will be permanently deleted on <strong>${deletionStr}</strong>.</p>
    <div class="info-box danger">
      <p style="margin:0"><strong>This action is irreversible.</strong> All projects, clients, files, invoices, and contracts will be permanently removed.</p>
    </div>
    <p>Changed your mind? You can cancel the deletion request before the scheduled date.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${data.cancelUrl}/settings" class="btn btn-secondary">Cancel deletion →</a>
    </p>
  `, branding);

  const text = textLayout(
    `Hi ${data.ownerName},\n\n"${data.orgName}" is scheduled for deletion on ${deletionStr}.\n\nTo cancel: ${data.cancelUrl}/settings`,
    branding
  );

  return { subject: `Deletion scheduled — ${data.orgName}`, html, text };
}
