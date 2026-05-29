/**
 * Base HTML email layout — shared wrapper for all templates.
 * Provides consistent header, footer, and styling.
 */

export interface BrandingContext {
  agencyName: string;
  logoUrl?: string;
  primaryColor?: string;
  supportEmail?: string;
  frontendUrl?: string;
}

export const defaultBranding: BrandingContext = {
  agencyName: process.env.AGENCY_NAME ?? 'Agency OS',
  logoUrl: process.env.AGENCY_LOGO_URL,
  primaryColor: '#4F46E5',
  supportEmail: process.env.AGENCY_EMAIL ?? 'support@agencyos.com',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
};

export function baseLayout(content: string, branding: BrandingContext = defaultBranding): string {
  const { agencyName, logoUrl, primaryColor = '#4F46E5', supportEmail, frontendUrl } = branding;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${agencyName}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 24px 16px; }
    .card { background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background-color: ${primaryColor}; padding: 24px 32px; text-align: center; }
    .header img { max-height: 40px; }
    .header-text { color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; }
    .body { padding: 32px; color: #374151; font-size: 15px; line-height: 1.6; }
    .body h1 { font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 16px; }
    .body h2 { font-size: 18px; font-weight: 600; color: #1f2937; margin: 24px 0 12px; }
    .body p { margin: 0 0 16px; }
    .btn { display: inline-block; padding: 12px 28px; background-color: ${primaryColor}; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; margin: 8px 0; }
    .btn-secondary { background-color: #6b7280; }
    .btn-danger { background-color: #dc2626; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    .info-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 16px 0; }
    .info-box.warning { background: #fffbeb; border-color: #fcd34d; }
    .info-box.danger { background: #fef2f2; border-color: #fca5a5; }
    .info-box.success { background: #f0fdf4; border-color: #86efac; }
    .label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .value { font-size: 15px; color: #111827; font-weight: 500; }
    .footer { padding: 20px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
    .footer a { color: #6b7280; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        ${logoUrl
          ? `<img src="${logoUrl}" alt="${agencyName}" />`
          : `<p class="header-text">${agencyName}</p>`
        }
      </div>
      <div class="body">
        ${content}
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} ${agencyName}. All rights reserved.</p>
        ${supportEmail ? `<p>Questions? <a href="mailto:${supportEmail}">${supportEmail}</a></p>` : ''}
        ${frontendUrl ? `<p><a href="${frontendUrl}">${frontendUrl}</a></p>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function textLayout(content: string, branding: BrandingContext = defaultBranding): string {
  return `${branding.agencyName}\n${'─'.repeat(40)}\n\n${content}\n\n${'─'.repeat(40)}\n© ${new Date().getFullYear()} ${branding.agencyName}\n${branding.supportEmail ?? ''}`;
}
