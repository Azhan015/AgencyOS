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
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function getOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.getClient(req.params.id);
    res.json({ success: true, data: client });
  } catch (error) { next(error); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.createClient(req.body);
    res.status(201).json({ success: true, data: client });
  } catch (error) { next(error); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.updateClient(req.params.id, req.body);
    res.json({ success: true, data: client });
  } catch (error) { next(error); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteClient(req.params.id);
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
    const result = await service.acceptInvite(req.body.token, req.body.password);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function getAnalytics(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const analytics = await service.getClientAnalytics(req.params.id);
    res.json({ success: true, data: analytics });
  } catch (error) { next(error); }
}
