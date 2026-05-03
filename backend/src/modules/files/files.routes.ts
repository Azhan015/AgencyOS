import { Router } from 'express';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { uploadLimiter } from '../../middleware/rateLimiter';
import * as service from './files.service';

const router = Router();

router.use(authenticate);

// Upload file
router.post('/upload', uploadLimiter, authorize('files:write'), service.upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: { message: 'No file provided' } });
      return;
    }

    const file = await service.uploadFileToProject({
      projectId: req.body.projectId,
      clientId: req.body.clientId || req.user!.clientId!,
      uploadedBy: req.user!.id,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
      folder: req.body.folder || '/',
      isClientVisible: req.body.isClientVisible === 'true',
      existingFileId: req.body.existingFileId,
    });

    res.status(201).json({ success: true, data: file });
  } catch (e) { next(e); }
});

// List files
router.get('/', authorize('files:read'), async (req: AuthRequest, res, next) => {
  try {
    const result = await service.listFiles({
      ...req.query as Record<string, string>,
      userRole: req.user!.role,
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

// Get file
router.get('/:id', authorize('files:read'), async (req: AuthRequest, res, next) => {
  try {
    const file = await service.getFile(req.params.id, req.user!.role, req.user!.clientId);
    res.json({ success: true, data: file });
  } catch (e) { next(e); }
});

// Download (signed URL redirect)
router.get('/:id/download', authorize('files:read'), async (req: AuthRequest, res, next) => {
  try {
    const url = await service.getDownloadUrl(req.params.id, req.user!.role, req.user!.clientId);
    res.redirect(url);
  } catch (e) { next(e); }
});

// Get versions
router.get('/:id/versions', authorize('files:read'), async (req: AuthRequest, res, next) => {
  try {
    const versions = await service.getFileVersions(req.params.id);
    res.json({ success: true, data: versions });
  } catch (e) { next(e); }
});

// Delete file
router.delete('/:id', authorize('files:write'), async (req: AuthRequest, res, next) => {
  try {
    await service.deleteFile(req.params.id, req.user!.id, req.user!.role);
    res.json({ success: true, message: 'File deleted' });
  } catch (e) { next(e); }
});

// Annotations
router.post('/:id/annotations', authorize('files:write'), async (req: AuthRequest, res, next) => {
  try {
    const file = await service.addAnnotation(req.params.id, { ...req.body, authorId: req.user!.id });
    res.status(201).json({ success: true, data: file });
  } catch (e) { next(e); }
});

router.patch('/:id/annotations/:aid/resolve', authorize('files:write'), async (req: AuthRequest, res, next) => {
  try {
    const file = await service.resolveAnnotation(req.params.id, req.params.aid);
    res.json({ success: true, data: file });
  } catch (e) { next(e); }
});

router.delete('/:id/annotations/:aid', authorize('files:write'), async (req: AuthRequest, res, next) => {
  try {
    const file = await service.deleteAnnotation(req.params.id, req.params.aid);
    res.json({ success: true, data: file });
  } catch (e) { next(e); }
});

export default router;
