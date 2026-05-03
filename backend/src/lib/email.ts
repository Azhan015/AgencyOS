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
      // Fallback to ethereal for development
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: 'ethereal@example.com',
          pass: 'password',
        },
      });
    }
  }
  return transporter;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    const transport = getTransporter();
    const info = await transport.sendMail({
      from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`,
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

// Email templates
export function getMagicLinkEmail(name: string, link: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Sign in to Agency OS</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 40px 20px;">
      <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #09090b; margin: 0;">${env.AGENCY_NAME}</h1>
        </div>
        <h2 style="font-size: 20px; font-weight: 600; color: #09090b; margin: 0 0 8px;">Hello, ${name}!</h2>
        <p style="color: #71717a; margin: 0 0 24px; line-height: 1.6;">Click the button below to sign in to your Agency OS portal. This link expires in 72 hours and can only be used once.</p>
        <a href="${link}" style="display: block; background: #2563eb; color: white; text-align: center; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin-bottom: 24px;">Sign In to Portal</a>
        <p style="color: #a1a1aa; font-size: 13px; margin: 0;">If you didn't request this, you can safely ignore this email. The link will expire automatically.</p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
        <p style="color: #a1a1aa; font-size: 12px; margin: 0; text-align: center;">${env.AGENCY_NAME} · ${env.AGENCY_EMAIL}</p>
      </div>
    </body>
    </html>
  `;
}

export function getInvitationEmail(name: string, agencyName: string, link: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>You're invited to ${agencyName}</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 40px 20px;">
      <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #09090b; margin: 0;">${env.AGENCY_NAME}</h1>
        </div>
        <h2 style="font-size: 20px; font-weight: 600; color: #09090b; margin: 0 0 8px;">Welcome, ${name}!</h2>
        <p style="color: #71717a; margin: 0 0 24px; line-height: 1.6;">${agencyName} has invited you to their client portal. Access your projects, files, invoices, and more — all in one place.</p>
        <a href="${link}" style="display: block; background: #2563eb; color: white; text-align: center; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin-bottom: 24px;">Accept Invitation</a>
        <p style="color: #a1a1aa; font-size: 13px; margin: 0;">This invitation expires in 72 hours. If you have questions, contact ${env.AGENCY_EMAIL}.</p>
      </div>
    </body>
    </html>
  `;
}

export function getInvoiceEmail(clientName: string, invoiceNumber: string, amount: string, dueDate: string, payLink: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Invoice ${invoiceNumber}</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 40px 20px;">
      <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="font-size: 20px; font-weight: 600; color: #09090b; margin: 0 0 8px;">Invoice ${invoiceNumber}</h2>
        <p style="color: #71717a; margin: 0 0 24px;">Hi ${clientName}, your invoice is ready.</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #71717a;">Amount Due</span>
            <span style="font-weight: 700; color: #09090b; font-size: 20px;">${amount}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #71717a;">Due Date</span>
            <span style="color: #09090b;">${dueDate}</span>
          </div>
        </div>
        <a href="${payLink}" style="display: block; background: #2563eb; color: white; text-align: center; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin-bottom: 16px;">Pay Now</a>
        <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 0;">Secured by Stripe 🔒</p>
      </div>
    </body>
    </html>
  `;
}

export function getApprovalRequestEmail(clientName: string, projectName: string, deliverableName: string, link: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Approval Required</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 40px 20px;">
      <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="font-size: 20px; font-weight: 600; color: #09090b; margin: 0 0 8px;">Your approval is needed</h2>
        <p style="color: #71717a; margin: 0 0 24px;">Hi ${clientName}, a deliverable is ready for your review on <strong>${projectName}</strong>.</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; font-weight: 600; color: #09090b;">${deliverableName}</p>
        </div>
        <a href="${link}" style="display: block; background: #2563eb; color: white; text-align: center; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Review & Approve</a>
      </div>
    </body>
    </html>
  `;
}

export function getPasswordResetEmail(name: string, link: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Reset your password</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 40px 20px;">
      <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="font-size: 20px; font-weight: 600; color: #09090b; margin: 0 0 8px;">Reset your password</h2>
        <p style="color: #71717a; margin: 0 0 24px;">Hi ${name}, click below to reset your password. This link expires in 1 hour.</p>
        <a href="${link}" style="display: block; background: #2563eb; color: white; text-align: center; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin-bottom: 24px;">Reset Password</a>
        <p style="color: #a1a1aa; font-size: 13px; margin: 0;">If you didn't request this, ignore this email. Your password won't change.</p>
      </div>
    </body>
    </html>
  `;
}
