import { Request, Response, NextFunction } from 'express';
import { Organization } from '../models/Organization';
import { AuthorizationError, NotFoundError } from '../lib/errors';
import { cacheGet, cacheSet, cacheDel } from '../config/redis';

/**
 * tenantScope()
 *
 * Must run AFTER authenticate(). Validates the organization context for every
 * org-scoped request and attaches it to req.organization.
 *
 * Flow:
 *  1. Read organizationId from req.user (set by authenticate)
 *  2. Validate the organization exists and is in an active state
 *  3. Attach org to req.organization
 *  4. Set req.tenantFilter = { organizationId } for all DB queries
 *
 * Platform users (req.user.isPlatformUser = true) bypass this middleware
 * UNLESS they are impersonating an org — in which case the impersonated
 * org is validated and attached.
 */
export async function tenantScope(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError('Authentication required');
    }

    // Platform users bypass tenant scoping (unless impersonating)
    const isPlatform = (req.user as unknown as { isPlatformUser: boolean }).isPlatformUser;
    if (isPlatform) {
      const platformUser = req.user as unknown as Express.PlatformUser;
      if (!platformUser.impersonating) {
        return next();
      }
      // Impersonating — validate the target org
      const orgId = platformUser.impersonating.organizationId;
      const org = await loadOrg(orgId);
      req.organization = org;
      req.tenantFilter = { organizationId: orgId };
      return next();
    }

    const orgId = req.user.organizationId;
    if (!orgId) {
      throw new AuthorizationError('No organization context in token');
    }

    const org = await loadOrg(orgId);
    req.organization = org;
    req.tenantFilter = { organizationId: orgId };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * loadOrg — loads org from Redis cache or MongoDB, validates status.
 */
async function loadOrg(orgId: string) {
  const cacheKey = `org:${orgId}:meta`;
  const cached = await cacheGet<string>(cacheKey);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let org: any;
  if (cached) {
    org = typeof cached === 'string' ? JSON.parse(cached) : cached;
  } else {
    org = await Organization.findById(orgId).lean();
    if (org) {
      await cacheSet(cacheKey, JSON.stringify(org), 300); // 5-min TTL
    }
  }

  if (!org) {
    throw new NotFoundError('Organization not found');
  }

  // Enforce organization status
  switch (org.status) {
    case 'SUSPENDED':
      throw new AuthorizationError(
        'Your organization has been suspended. Please contact support.'
      );
    case 'EXPIRED_TRIAL':
      throw new AuthorizationError(
        'Your trial has expired. Please subscribe to continue.'
      );
    case 'ARCHIVED':
      throw new AuthorizationError('This organization has been archived.');
    case 'REJECTED':
      throw new AuthorizationError(
        'Your organization registration was rejected. Please contact support.'
      );
    case 'PENDING_APPROVAL':
      throw new AuthorizationError(
        'Your organization is pending approval. You will be notified by email.'
      );
  }

  // Only ACTIVE and APPROVED orgs can proceed
  if (!['ACTIVE', 'APPROVED'].includes(org.status)) {
    throw new AuthorizationError('Organization is not active.');
  }

  return org;
}

/**
 * assertSameOrg — inline guard for service functions.
 * Throws AuthorizationError if a resource's org doesn't match the requester's org.
 *
 * Usage:
 *   assertSameOrg(project.organizationId, req.user.organizationId);
 */
export function assertSameOrg(
  resourceOrgId: string | { toString(): string },
  requestingOrgId: string | { toString(): string }
): void {
  if (String(resourceOrgId) !== String(requestingOrgId)) {
    throw new AuthorizationError('Cross-tenant access denied');
  }
}

/**
 * invalidateOrgCache — call this whenever org data changes.
 * Used by org update/status change operations.
 */
export async function invalidateOrgCache(orgId: string): Promise<void> {
  await cacheDel(`org:${orgId}:meta`);
}
