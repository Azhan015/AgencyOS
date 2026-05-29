import { v4 as uuidv4 } from 'uuid';
import { Organization } from '../../../models/Organization';
import { User } from '../../../models/User';
import { AuditLog } from '../../../models/AuditLog';
import { signPlatformAccessToken } from '../../../lib/jwt';
import { cacheGet, cacheSet, cacheDel } from '../../../config/redis';
import { AuthorizationError, NotFoundError } from '../../../lib/errors';
import { PLATFORM_ROLE_PERMISSIONS, type PlatformRole } from '../../../middleware/authorize';
import { logger } from '../../../lib/logger';

const IMPERSONATION_TTL = 3600; // 1 hour

export async function startImpersonation(
  platformUserId: string,
  platformRole: PlatformRole,
  targetOrgId: string
): Promise<{ accessToken: string; expiresIn: number; targetOrgName: string }> {
  // Validate permission
  const perms = PLATFORM_ROLE_PERMISSIONS[platformRole] ?? [];
  const canImpersonate = perms.includes('impersonate') || perms.includes('impersonate:readonly');
  if (!canImpersonate) {
    throw new AuthorizationError('Your platform role does not have impersonation permission');
  }

  // Validate target org
  const org = await Organization.findById(targetOrgId).lean();
  if (!org) throw new NotFoundError('Organization');
  if (org.status === 'ARCHIVED') {
    throw new AuthorizationError('Cannot impersonate an archived organization');
  }

  const impersonationSessionId = uuidv4();

  // Create impersonation token — scoped to org, expires in 1 hour
  const accessToken = signPlatformAccessToken({
    sub: platformUserId,
    platformRole,
    sessionId: impersonationSessionId,
    impersonating: {
      organizationId: targetOrgId,
      originalPlatformUserId: platformUserId,
      grantedAt: Date.now(),
    },
  });

  // Store impersonation session in Redis
  await cacheSet(
    `platform:impersonation:${impersonationSessionId}`,
    JSON.stringify({
      platformUserId,
      targetOrgId,
      platformRole,
      startedAt: new Date().toISOString(),
      isReadOnly: !perms.includes('impersonate'),
    }),
    IMPERSONATION_TTL
  );

  // Immutable audit log
  await AuditLog.create({
    userId: platformUserId,
    action: 'IMPERSONATION_STARTED',
    resource: 'Organization',
    resourceId: targetOrgId,
    isPlatformAction: true,
    metadata: { platformRole, orgName: org.name },
  });

  logger.info({ platformUserId, targetOrgId, orgName: org.name }, 'Impersonation started');

  return {
    accessToken,
    expiresIn: IMPERSONATION_TTL,
    targetOrgName: org.name,
  };
}

export async function stopImpersonation(
  impersonationSessionId: string,
  platformUserId: string
): Promise<void> {
  // Revoke the impersonation session
  await cacheSet(
    `platform:revoked:session:${impersonationSessionId}`,
    '1',
    86400 // 24h — longer than token lifetime
  );
  await cacheDel(`platform:impersonation:${impersonationSessionId}`);

  await AuditLog.create({
    userId: platformUserId,
    action: 'IMPERSONATION_ENDED',
    isPlatformAction: true,
    resource: 'Organization',
    metadata: { sessionId: impersonationSessionId },
  });

  logger.info({ platformUserId, impersonationSessionId }, 'Impersonation ended');
}

export async function getActiveImpersonation(sessionId: string) {
  const data = await cacheGet<string>(`platform:impersonation:${sessionId}`);
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data;
}
