import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/authenticate';
import * as service from './projects.service';

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, status, search, clientId } = req.query as Record<string, string>;
    const result = await service.listProjects({
      userId: req.user!.id,
      userRole: req.user!.role,
      orgRole: req.user!.orgRole,
      organizationId: req.user!.organizationId,
      clientId: clientId || req.user!.clientId,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
    });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function getOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const project = await service.getProject(
      req.params.id,
      req.user!.id,
      req.user!.role,
      req.user!.clientId,
      req.user!.organizationId,
      req.user!.orgRole
    );
    res.json({ success: true, data: project });
  } catch (error) { next(error); }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const project = await service.createProject({
      ...req.body,
      pm: req.body.pm || req.user!.id,
      organizationId: req.user!.organizationId,
    });
    res.status(201).json({ success: true, data: project });
  } catch (error) { next(error); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const project = await service.updateProject(
      req.params.id,
      req.body,
      req.user!.id,
      req.user!.role,
      req.user!.organizationId
    );
    res.json({ success: true, data: project });
  } catch (error) { next(error); }
}

export async function updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const project = await service.updateProjectStatus(
      req.params.id,
      req.body.status,
      req.user!.id,
      req.user!.role,
      req.user!.organizationId
    );
    res.json({ success: true, data: project });
  } catch (error) { next(error); }
}

export async function addMilestone(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const project = await service.addMilestone(
      req.params.id,
      req.body,
      req.user!.organizationId
    );
    res.status(201).json({ success: true, data: project });
  } catch (error) { next(error); }
}

export async function updateMilestone(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const project = await service.updateMilestone(
      req.params.id,
      req.params.mid,
      req.body,
      req.user!.organizationId
    );
    res.json({ success: true, data: project });
  } catch (error) { next(error); }
}

export async function getActivity(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const activity = await service.getProjectActivity(
      req.params.id,
      Number(req.query.limit) || 20,
      req.user!.organizationId
    );
    res.json({ success: true, data: activity });
  } catch (error) { next(error); }
}
