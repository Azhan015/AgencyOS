import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

let transporter: nodemailer.Transporter;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (env.NODE_ENV === 'test') {
      transporter = nodemailer.createTransport({ jsonTransport: true });
    } else if (env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    } else {
      // Fallback: log emails to console in development when SMTP is not configured
      transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
      });
    }
  }
  return transporter;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    const transport = getTransporter();

    // When using Gmail SMTP, the From address MUST match the authenticated Gmail
    // account (SMTP_USER). Gmail ignores/overrides any other From address and
    // marks the email as spam if they don't match. We use the configured
    // EMAIL_FROM_NAME for display but force the address to SMTP_USER when set.
    const fromAddress =
      env.SMTP_HOST?.includes('gmail') && env.SMTP_USER
        ? `"${env.EMAIL_FROM_NAME}" <${env.SMTP_USER}>`
        : `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`;

    const info = await transport.sendMail({
      from: fromAddress,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    });
    logger.info({ messageId: info.messageId, to: options.to }, 'Email sent');
  } catch (error) {
    logger.error({ error, to: options.to, subject: options.subject }, 'Failed to send email');
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Templates
// ─────────────────────────────────────────────────────────────────────────────

/** Magic link sign-in email */
export function getMagicLinkEmail(name: string, link: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Sign in to ${env.AGENCY_NAME}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;font-weight:700;color:#09090b;margin:0;">${env.AGENCY_NAME}</h1>
    </div>
    <h2 style="font-size:20px;font-weight:600;color:#09090b;margin:0 0 8px;">Hello, ${name}!</h2>
    <p style="color:#71717a;margin:0 0 24px;line-height:1.6;">Click the button below to sign in to your portal. This link expires in 72 hours and can only be used once.</p>
    <a href="${link}" style="display:block;background:#2563eb;color:white;text-align:center;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;margin-bottom:24px;">Sign In to Portal</a>
    <p style="color:#a1a1aa;font-size:13px;margin:0;">If you didn't request this, you can safely ignore this email.</p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;text-align:center;">${env.AGENCY_NAME} · ${env.AGENCY_EMAIL}</p>
  </div>
</body>
</html>`;
}

/**
 * Team member invite email — sent when an admin invites a new team member.
 * Includes the temporary password and a clear instruction to change it.
 */
export function getTeamInviteEmail(
  name: string,
  email: string,
  role: string,
  agencyName: string,
  loginUrl: string,
  tempPassword: string
): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>You've been invited to ${agencyName}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;font-weight:700;color:#09090b;margin:0;">${agencyName}</h1>
    </div>
    <h2 style="font-size:20px;font-weight:600;color:#09090b;margin:0 0 8px;">Welcome to the team, ${name}!</h2>
    <p style="color:#71717a;margin:0 0 24px;line-height:1.6;">
      You've been added to <strong>${agencyName}</strong> as a <strong>${role}</strong>.
      Use the credentials below to sign in for the first time.
    </p>
    <div style="background:#f4f4f5;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:13px;color:#71717a;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Your login credentials</p>
      <div style="margin-bottom:10px;">
        <span style="font-size:12px;color:#a1a1aa;display:block;margin-bottom:2px;">Email</span>
        <span style="font-weight:600;color:#09090b;font-size:15px;">${email}</span>
      </div>
      <div>
        <span style="font-size:12px;color:#a1a1aa;display:block;margin-bottom:2px;">Temporary Password</span>
        <span style="font-weight:700;color:#09090b;font-size:18px;letter-spacing:0.08em;font-family:monospace;">${tempPassword}</span>
      </div>
    </div>
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
        <strong>⚠️ Important:</strong> After signing in, go to <strong>Settings → Security</strong> and change your password immediately.
        This temporary password will remain active until you change it.
      </p>
    </div>
    <a href="${loginUrl}" style="display:block;background:#2563eb;color:white;text-align:center;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;margin-bottom:24px;">Sign In Now</a>
    <p style="color:#a1a1aa;font-size:13px;margin:0;">If you weren't expecting this invitation, you can safely ignore this email.</p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;text-align:center;">${agencyName}</p>
  </div>
</body>
</html>`;
}

/**
 * Client portal invite email — sent when an admin invites a client.
 * The link goes to /auth/accept-invite where they set their password.
 */
export function getClientInviteEmail(
  name: string,
  agencyName: string,
  inviteLink: string,
  agencyEmail: string
): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>You're invited to ${agencyName}'s portal</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;font-weight:700;color:#09090b;margin:0;">${agencyName}</h1>
    </div>
    <h2 style="font-size:20px;font-weight:600;color:#09090b;margin:0 0 8px;">Welcome, ${name}!</h2>
    <p style="color:#71717a;margin:0 0 16px;line-height:1.6;">
      <strong>${agencyName}</strong> has invited you to their client portal — your dedicated space to track projects,
      review deliverables, sign contracts, and pay invoices.
    </p>
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#0369a1;line-height:1.5;">
        Clicking the button below will take you to a page where you can <strong>set your own password</strong> for the portal.
        You can also sign in with Google if you prefer.
      </p>
    </div>
    <a href="${inviteLink}" style="display:block;background:#2563eb;color:white;text-align:center;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;margin-bottom:24px;">Accept Invitation &amp; Set Password</a>
    <p style="color:#a1a1aa;font-size:13px;margin:0;">
      This invitation expires in 72 hours. If you have questions, contact
      <a href="mailto:${agencyEmail}" style="color:#2563eb;">${agencyEmail}</a>.
    </p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;text-align:center;">${agencyName}</p>
  </div>
</body>
</html>`;
}

/** Invoice email with pay button */
export function getInvoiceEmail(
  clientName: string,
  invoiceNumber: string,
  amount: string,
  dueDate: string,
  payLink: string
): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${invoiceNumber}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;font-weight:700;color:#09090b;margin:0;">${env.AGENCY_NAME}</h1>
    </div>
    <h2 style="font-size:20px;font-weight:600;color:#09090b;margin:0 0 8px;">Invoice ${invoiceNumber}</h2>
    <p style="color:#71717a;margin:0 0 24px;">Hi ${clientName}, your invoice is ready.</p>
    <div style="background:#f4f4f5;border-radius:8px;padding:20px;margin-bottom:24px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:#71717a;">Amount Due</span>
        <span style="font-weight:700;color:#09090b;font-size:20px;">${amount}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#71717a;">Due Date</span>
        <span style="color:#09090b;">${dueDate}</span>
      </div>
    </div>
    <a href="${payLink}" style="display:block;background:#2563eb;color:white;text-align:center;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;margin-bottom:16px;">Pay Now</a>
    <p style="color:#a1a1aa;font-size:12px;text-align:center;margin:0;">Secured by Stripe 🔒</p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;text-align:center;">${env.AGENCY_NAME} · ${env.AGENCY_EMAIL}</p>
  </div>
</body>
</html>`;
}

/** Approval request email to client */
export function getApprovalRequestEmail(
  clientName: string,
  projectName: string,
  deliverableName: string,
  link: string
): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Approval Required</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;font-weight:700;color:#09090b;margin:0;">${env.AGENCY_NAME}</h1>
    </div>
    <h2 style="font-size:20px;font-weight:600;color:#09090b;margin:0 0 8px;">Your approval is needed</h2>
    <p style="color:#71717a;margin:0 0 24px;">Hi ${clientName}, a deliverable is ready for your review on <strong>${projectName}</strong>.</p>
    <div style="background:#f4f4f5;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-weight:600;color:#09090b;">${deliverableName}</p>
    </div>
    <a href="${link}" style="display:block;background:#2563eb;color:white;text-align:center;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;margin-bottom:24px;">Review &amp; Approve</a>
    <p style="color:#a1a1aa;font-size:13px;margin:0;">Log in to your portal to leave feedback or request revisions.</p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;text-align:center;">${env.AGENCY_NAME} · ${env.AGENCY_EMAIL}</p>
  </div>
</body>
</html>`;
}

/** Contract ready-to-sign email */
export function getContractEmail(
  clientName: string,
  contractTitle: string,
  agencyName: string,
  link: string
): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Contract ready to sign</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;font-weight:700;color:#09090b;margin:0;">${agencyName}</h1>
    </div>
    <h2 style="font-size:20px;font-weight:600;color:#09090b;margin:0 0 8px;">Contract ready for your signature</h2>
    <p style="color:#71717a;margin:0 0 24px;line-height:1.6;">Hi ${clientName}, a contract is ready for your review and digital signature.</p>
    <div style="background:#f4f4f5;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-weight:600;color:#09090b;">${contractTitle}</p>
    </div>
    <a href="${link}" style="display:block;background:#2563eb;color:white;text-align:center;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;margin-bottom:24px;">Review &amp; Sign Contract</a>
    <p style="color:#a1a1aa;font-size:13px;margin:0;">If you have questions, reply to this email or contact ${agencyName}.</p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;text-align:center;">${agencyName}</p>
  </div>
</body>
</html>`;
}

/** Password reset email */
export function getPasswordResetEmail(name: string, link: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Reset your password</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;font-weight:700;color:#09090b;margin:0;">${env.AGENCY_NAME}</h1>
    </div>
    <h2 style="font-size:20px;font-weight:600;color:#09090b;margin:0 0 8px;">Reset your password</h2>
    <p style="color:#71717a;margin:0 0 24px;">Hi ${name}, click below to reset your password. This link expires in 1 hour.</p>
    <a href="${link}" style="display:block;background:#2563eb;color:white;text-align:center;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;margin-bottom:24px;">Reset Password</a>
    <p style="color:#a1a1aa;font-size:13px;margin:0;">If you didn't request this, ignore this email. Your password won't change.</p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
    <p style="color:#a1a1aa;font-size:12px;margin:0;text-align:center;">${env.AGENCY_NAME} · ${env.AGENCY_EMAIL}</p>
  </div>
</body>
</html>`;
}

// Keep old name as alias for backward compatibility
export const getInvitationEmail = getClientInviteEmail;
