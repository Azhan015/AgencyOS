/**
 * Email Template System
 *
 * Central dispatcher for all email templates.
 * Each template module exports a render(data, branding) function
 * that returns { subject, html, text }.
 *
 * Usage:
 *   const { subject, html, text } = renderEmailTemplate('org:approved', data, branding);
 */

import { BrandingContext, defaultBranding } from './base/layout';

// ── Template type registry ─────────────────────────────────────────────────────

export type EmailTemplateType =
  // Organization lifecycle
  | 'org:registration-received'
  | 'org:approved'
  | 'org:rejected'
  | 'org:trial-expiring-7-days'
  | 'org:trial-expiring-3-days'
  | 'org:trial-expiring-1-day'
  | 'org:trial-expired'
  | 'org:suspended'
  | 'org:reactivated'
  | 'org:deletion-scheduled'
  | 'org:ownership-transferred'
  | 'org:payment-overdue-grace'
  // Platform admin notifications
  | 'platform:new-org-pending'
  | 'platform:org-deletion-requested'
  // Team
  | 'team:invited'
  // Client portal
  | 'client:invited'
  // Auth
  | 'auth:magic-link'
  | 'auth:password-reset'
  // Invoices
  | 'invoice:sent'
  | 'invoice:overdue'
  // Contracts
  | 'contract:sent'
  // Approvals
  | 'approval:needed';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// ── Transactional vs marketing classification ──────────────────────────────────

export const TRANSACTIONAL_TYPES: ReadonlySet<EmailTemplateType> = new Set([
  'auth:magic-link',
  'auth:password-reset',
  'invoice:sent',
  'invoice:overdue',
  'contract:sent',
  'approval:needed',
  'team:invited',
  'client:invited',
  'org:approved',
  'org:rejected',
  'org:suspended',
  'org:reactivated',
  'org:deletion-scheduled',
  'org:ownership-transferred',
  'org:registration-received',
  'platform:new-org-pending',
  'platform:org-deletion-requested',
]);

export const MARKETING_TYPES: ReadonlySet<EmailTemplateType> = new Set([
  'org:trial-expiring-7-days',
  'org:trial-expiring-3-days',
  'org:trial-expiring-1-day',
  'org:trial-expired',
  'org:payment-overdue-grace',
]);

export function isTransactional(type: EmailTemplateType): boolean {
  return TRANSACTIONAL_TYPES.has(type);
}

// ── Template dispatcher ────────────────────────────────────────────────────────

export function renderEmailTemplate(
  type: EmailTemplateType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>,
  branding: BrandingContext = defaultBranding
): RenderedEmail {
  switch (type) {
    // ── Org lifecycle ──────────────────────────────────────────────────
    case 'org:registration-received': {
      const m = require('./org/registration-received');
      return m.render(data, branding);
    }
    case 'org:approved': {
      const m = require('./org/approved');
      return m.render(data, branding);
    }
    case 'org:rejected': {
      const m = require('./org/rejected');
      return m.render(data, branding);
    }
    case 'org:trial-expiring-7-days':
    case 'org:trial-expiring-3-days':
    case 'org:trial-expiring-1-day': {
      const m = require('./org/trial-expiring');
      return m.render(data, branding);
    }
    case 'org:trial-expired': {
      const m = require('./org/trial-expired');
      return m.render(data, branding);
    }
    case 'org:suspended': {
      const m = require('./org/suspended');
      return m.render(data, branding);
    }
    case 'org:reactivated': {
      const m = require('./org/reactivated');
      return m.render(data, branding);
    }
    case 'org:deletion-scheduled': {
      const m = require('./org/deletion-scheduled');
      return m.render(data, branding);
    }
    case 'org:ownership-transferred': {
      const m = require('./org/ownership-transferred');
      return m.render(data, branding);
    }
    case 'org:payment-overdue-grace': {
      const m = require('./org/payment-overdue');
      return m.render(data, branding);
    }

    // ── Platform ───────────────────────────────────────────────────────
    case 'platform:new-org-pending': {
      const m = require('./platform/new-org-pending');
      return m.render(data, branding);
    }
    case 'platform:org-deletion-requested': {
      const m = require('./platform/org-deletion-requested');
      return m.render(data, branding);
    }

    // ── Team ───────────────────────────────────────────────────────────
    case 'team:invited': {
      const m = require('./team/invited');
      return m.render(data, branding);
    }

    // ── Client ─────────────────────────────────────────────────────────
    case 'client:invited': {
      const m = require('./client/invited');
      return m.render(data, branding);
    }

    // ── Auth ───────────────────────────────────────────────────────────
    case 'auth:magic-link': {
      const m = require('./auth/magic-link');
      return m.render(data, branding);
    }
    case 'auth:password-reset': {
      const m = require('./auth/password-reset');
      return m.render(data, branding);
    }

    // ── Invoices ───────────────────────────────────────────────────────
    case 'invoice:sent': {
      const m = require('./invoice/sent');
      return m.render(data, branding);
    }
    case 'invoice:overdue': {
      const m = require('./invoice/overdue');
      return m.render(data, branding);
    }

    // ── Contracts ──────────────────────────────────────────────────────
    case 'contract:sent': {
      const m = require('./contract/sent');
      return m.render(data, branding);
    }

    // ── Approvals ──────────────────────────────────────────────────────
    case 'approval:needed': {
      const m = require('./approval/needed');
      return m.render(data, branding);
    }

    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown email template type: ${exhaustive}`);
    }
  }
}
