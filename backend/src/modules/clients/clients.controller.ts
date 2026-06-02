import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/authenticate';
import * as service from './clients.service';

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, status, search, pmId } = req.query as Record<string, string>;
    const result = await service.listClients({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status,
      search,
      pmId,
      organizationId: req.user?.organizationId,
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function getOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.getClient(req.params.id, req.user?.organizationId);
    res.json({ success: true, data: client });
  } catch (error) { next(error); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.createClient({
      ...req.body,
      organizationId: req.user?.organizationId,
    });
    res.status(201).json({ success: true, data: client });
  } catch (error) { next(error); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.updateClient(req.params.id, req.body, req.user?.organizationId);
    res.json({ success: true, data: client });
  } catch (error) { next(error); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteClient(req.params.id, req.user?.organizationId);
    res.json({ success: true, message: 'Client deleted' });
  } catch (error) { next(error); }
}

export async function invite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { getFrontendUrl } = await import('../../lib/frontendUrl');
    await service.inviteClient(req.params.id, req.body.resend, getFrontendUrl(req));
    res.json({ success: true, message: 'Invitation sent' });
  } catch (error) { next(error); }
}

export async function acceptInvite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { env } = await import('../../config/env');
    const result = await service.acceptInvite(req.body.token, req.body.password);

    // Set refresh token as httpOnly cookie (same options as auth controller)
    const cookieOptions = {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      ...(env.NODE_ENV === 'production' && env.COOKIE_DOMAIN !== 'localhost'
        ? { domain: env.COOKIE_DOMAIN }
        : {}),
    };
    res.cookie('refreshToken', result.refreshToken, cookieOptions);

    res.json({
      success: true,
      data: {
        userId: result.userId,
        clientId: result.clientId,
        accessToken: result.accessToken,
        user: result.user,
      },
    });
  } catch (error) { next(error); }
}

export async function getAnalytics(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const analytics = await service.getClientAnalytics(req.params.id, req.user?.organizationId);
    res.json({ success: true, data: analytics });
  } catch (error) { next(error); }
}
