import { z } from 'zod';

// ── Registration ───────────────────────────────────────────────────────────────

export const RegisterOrganizationSchema = z.object({
  // Organization
  orgName: z.string().min(2).max(100).trim(),
  orgSlug: z
    .string()
    .min(3)
    .max(50)
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      'Slug must be lowercase alphanumeric with hyphens, no leading/trailing hyphens'
    )
    .optional(),

  // First user (becomes ORGANIZATION_OWNER)
  ownerName: z.string().min(2).max(100).trim(),
  ownerEmail: z.string().email().toLowerCase().trim(),
  ownerPassword: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
      'Password must contain uppercase, lowercase, number, and special character'
    ),

  // Optional org info
  contactPhone: z.string().max(30).optional(),
  website: z.string().url().optional().or(z.literal('')),
  address: z
    .object({
      line1: z.string().min(1).max(200),
      city: z.string().min(1).max(100),
      country: z.string().length(2, 'Country must be ISO 3166-1 alpha-2 code'),
      postalCode: z.string().min(1).max(20),
    })
    .optional(),

  // Terms acceptance (required)
  acceptedTermsAt: z.string().datetime({ message: 'acceptedTermsAt must be an ISO datetime' }),
  acceptedPrivacyAt: z.string().datetime({ message: 'acceptedPrivacyAt must be an ISO datetime' }),

  // Optional
  referralSource: z.string().max(100).optional(),
  _gotcha: z.string().max(0).optional(), // honeypot — must be empty
});

export type RegisterOrganizationInput = z.infer<typeof RegisterOrganizationSchema>;

// ── Update org profile ─────────────────────────────────────────────────────────

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  domain: z.string().max(253).toLowerCase().optional().or(z.literal('')),
  logoUrl: z.string().url().optional().or(z.literal('')),
  contactPhone: z.string().max(30).optional(),
  billingEmail: z.string().email().optional(),
  address: z
    .object({
      line1: z.string().min(1).max(200),
      city: z.string().min(1).max(100),
      country: z.string().length(2),
      postalCode: z.string().min(1).max(20),
    })
    .optional(),
});

export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;

// ── Invite user ────────────────────────────────────────────────────────────────

export const InviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100).trim(),
  role: z.enum(['ORGANIZATION_ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR']),
});

export type InviteUserInput = z.infer<typeof InviteUserSchema>;

// ── Ownership transfer ─────────────────────────────────────────────────────────

export const TransferOwnershipSchema = z.object({
  newOwnerId: z.string().min(1),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
});

export type TransferOwnershipInput = z.infer<typeof TransferOwnershipSchema>;

// ── Deletion request ───────────────────────────────────────────────────────────

export const RequestDeletionSchema = z.object({
  reason: z.string().max(500).optional(),
  confirmPhrase: z.string().refine(
    (v) => v === 'DELETE MY ORGANIZATION',
    'You must type "DELETE MY ORGANIZATION" to confirm'
  ),
});

export type RequestDeletionInput = z.infer<typeof RequestDeletionSchema>;
