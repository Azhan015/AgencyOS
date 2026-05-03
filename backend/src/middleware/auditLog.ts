import { Response, NextFunction } from 'express';
import { AuthRequest } from './authenticate';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../lib/logger';

export function auditLog(action: string, resource: string) {
  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user) {
        await AuditLog.create({
          userId: req.user.id,
          action,
          resource,
          resourceId: req.params.id,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { method: req.method, path: req.path },
        });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to write audit log');
    }
    next();
  };
}
