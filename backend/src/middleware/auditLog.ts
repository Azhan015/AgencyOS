import { Response, NextFunction } from 'express';
import { AuthRequest } from './authenticate';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../lib/logger';

export function auditLog(action: string, resource: string) {
  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user) {
        const isPlatformUser = (req.user as unknown as { isPlatformUser: boolean }).isPlatformUser;

        // Resolve organizationId: org users carry it directly; platform users may be impersonating
        let organizationId: string | undefined;
        if (!isPlatformUser) {
          organizationId = req.user.organizationId || undefined;
        } else {
          const platformUser = req.user as unknown as Express.PlatformUser;
          organizationId = platformUser.impersonating?.organizationId;
        }

        await AuditLog.create({
          userId: req.user.id,
          action,
          resource,
          resourceId: req.params.id,
          organizationId: organizationId || undefined,
          isPlatformAction: isPlatformUser && !organizationId,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: {
            method: req.method,
            path: req.path,
            ...(isPlatformUser ? { platformAction: true } : {}),
          },
        });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to write audit log');
    }
    next();
  };
}
