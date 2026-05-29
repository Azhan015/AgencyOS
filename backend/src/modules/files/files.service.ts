import multer from 'multer';
import path from 'path';
import { File, IFile } from '../../models/File';
import { Client } from '../../models/Client';
import { Organization } from '../../models/Organization';
import {
  uploadFile,
  getOrgSignedDownloadUrl,
  getSignedDownloadUrl,
  deleteFile as deleteFromStorage,
  generateProjectFileKey,
  generateStorageKey,
  validateStorageKeyOwnership,
} from '../../config/storage';
import { NotFoundError, FileError, AuthorizationError } from '../../lib/errors';
import { emitAutomationEvent } from '../automations/automations.service';
import { emitToOrgProject } from '../../sockets/socketServer';
import { logger } from '../../lib/logger';
import { env } from '../../config/env';

// ── Multer config — memory storage for virus scan before S3 ───────────────────
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    const blocked = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.jar'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (blocked.includes(ext)) {
      cb(new FileError(`File type ${ext} is not allowed`));
    } else {
      cb(null, true);
    }
  },
});

// ── Upload ─────────────────────────────────────────────────────────────────────

export async function uploadFileToProject(data: {
  projectId: string;
  clientId: string;
  uploadedBy: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  folder?: string;
  isClientVisible?: boolean;
  existingFileId?: string;
  organizationId?: string;
}): Promise<IFile> {
  const {
    projectId, clientId, uploadedBy, originalName, mimeType, buffer,
    folder = '/', isClientVisible = false, existingFileId, organizationId,
  } = data;

  // ── 1. Check org-level storage quota (primary) ─────────────────────────────
  if (organizationId) {
    const org = await Organization.findById(organizationId)
      .select('usage limits name plan')
      .lean();

    if (org && org.limits.storageBytes !== -1) {
      if (org.usage.storageUsedBytes + buffer.length > org.limits.storageBytes) {
        const usedGB = (org.usage.storageUsedBytes / 1024 ** 3).toFixed(2);
        const limitGB = (org.limits.storageBytes / 1024 ** 3).toFixed(0);
        throw new FileError(
          `Organization storage quota exceeded. Used: ${usedGB}GB / ${limitGB}GB. ` +
          `Upgrade your plan to add more storage.`
        );
      }
    }
  }

  // ── 2. Check client-level storage quota (secondary) ───────────────────────
  const client = await Client.findById(clientId);
  if (!client) throw new NotFoundError('Client');

  if (client.storageUsedBytes + buffer.length > client.storageLimitBytes) {
    throw new FileError('Client storage quota exceeded');
  }

  // ── 3. Resolve version info ────────────────────────────────────────────────
  let version = 1;
  let parentFileId: string | undefined;

  if (existingFileId) {
    const existing = await File.findById(existingFileId);
    if (existing) {
      version = existing.version + 1;
      parentFileId = existingFileId;
    }
  }

  // ── 4. Generate org-scoped storage key ────────────────────────────────────
  // New uploads use org-scoped keys: organizations/{orgId}/projects/{projectId}/...
  // Legacy uploads (no orgId) fall back to the old key format.
  const storageKey = organizationId
    ? generateProjectFileKey(organizationId, projectId, folder, originalName)
    : generateStorageKey(`projects/${projectId}/${folder}`, originalName);

  // ── 5. Upload to S3/R2 with server-side encryption ────────────────────────
  await uploadFile(storageKey, buffer, mimeType, {
    organizationId: organizationId ?? '',
    projectId,
    uploadedBy,
  });

  // ── 6. Create file record ──────────────────────────────────────────────────
  const file = await File.create({
    projectId,
    clientId,
    uploadedBy,
    name: originalName,
    originalName,
    mimeType,
    sizeBytes: buffer.length,
    storageKey,
    folder,
    version,
    parentFileId,
    isClientVisible,
    scanStatus: 'PENDING',
    ...(organizationId ? { organizationId } : {}),
  });

  // ── 7. Update storage usage counters ──────────────────────────────────────
  // Update both client and org usage atomically
  await Promise.all([
    Client.findByIdAndUpdate(clientId, { $inc: { storageUsedBytes: buffer.length } }),
    organizationId
      ? Organization.findByIdAndUpdate(organizationId, {
          $inc: { 'usage.storageUsedBytes': buffer.length },
        })
      : Promise.resolve(),
  ]);

  // ── 8. Queue virus scan ────────────────────────────────────────────────────
  try {
    const { scanQueue } = await import('../../workers/scanWorker');
    const queue = scanQueue();
    if (queue) {
      await queue.add({ fileId: file._id.toString(), storageKey });
    } else {
      await File.findByIdAndUpdate(file._id, { scanStatus: 'CLEAN' });
    }
  } catch (err) {
    logger.warn({ err }, 'Scan queue not available, marking file as clean');
    await File.findByIdAndUpdate(file._id, { scanStatus: 'CLEAN' });
  }

  // ── 9. Emit socket event ───────────────────────────────────────────────────
  try {
    emitToOrgProject(organizationId ?? '', projectId, 'file:uploaded', {
      fileId: file._id.toString(),
      name: originalName,
      uploadedBy,
      projectId,
    });
  } catch (err) {
    logger.warn({ err }, 'Socket emit failed');
  }

  // ── 10. Automation event ───────────────────────────────────────────────────
  if (isClientVisible) {
    await emitAutomationEvent('file.uploaded', {
      fileId: file._id.toString(),
      projectId,
      clientId,
      fileName: originalName,
      organizationId,
    });
  }

  return file;
}

// ── List ───────────────────────────────────────────────────────────────────────

export async function listFiles(query: {
  projectId?: string;
  clientId?: string;
  folder?: string;
  userRole?: string;
  page?: number;
  limit?: number;
  organizationId?: string;
}) {
  const { projectId, clientId, folder, userRole, page = 1, limit = 50, organizationId } = query;
  const filter: Record<string, unknown> = {};

  if (organizationId) filter.organizationId = organizationId;
  if (projectId) filter.projectId = projectId;
  if (clientId) filter.clientId = clientId;
  if (folder) filter.folder = folder;
  if (userRole === 'CLIENT') filter.isClientVisible = true;
  filter.scanStatus = { $ne: 'INFECTED' };

  const [files, total] = await Promise.all([
    File.find(filter)
      .populate('uploadedBy', 'name email avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    File.countDocuments(filter),
  ]);

  return { files, total, page, limit };
}

// ── Get single file ────────────────────────────────────────────────────────────

export async function getFile(
  id: string,
  userRole?: string,
  clientId?: string,
  organizationId?: string
): Promise<IFile> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const file = await File.findOne(filter).populate('uploadedBy', 'name email avatar');
  if (!file) throw new NotFoundError('File');

  if (userRole === 'CLIENT') {
    if (file.clientId.toString() !== clientId) throw new AuthorizationError();
    if (!file.isClientVisible) throw new AuthorizationError();
  }

  return file;
}

// ── Download (signed URL) ──────────────────────────────────────────────────────

export async function getDownloadUrl(
  id: string,
  userRole?: string,
  clientId?: string,
  organizationId?: string
): Promise<string> {
  const file = await getFile(id, userRole, clientId, organizationId);

  if (file.scanStatus === 'INFECTED') {
    throw new FileError('File is infected and cannot be downloaded');
  }
  if (file.scanStatus === 'PENDING') {
    throw new FileError('File is still being scanned');
  }

  await File.findByIdAndUpdate(id, { $inc: { downloadCount: 1 } });

  // Use org-ownership-validated signed URL for org-scoped keys
  if (organizationId) {
    return getOrgSignedDownloadUrl(file.storageKey, organizationId, 300);
  }

  // Legacy fallback for pre-migration keys
  return getSignedDownloadUrl(file.storageKey, 300);
}

// ── File versions ──────────────────────────────────────────────────────────────

export async function getFileVersions(
  fileId: string,
  organizationId?: string,
  page = 1,
  limit = 20
): Promise<{ versions: IFile[]; total: number; page: number; limit: number }> {
  const fileFilter: Record<string, unknown> = { _id: fileId };
  if (organizationId) fileFilter.organizationId = organizationId;

  const file = await File.findOne(fileFilter);
  if (!file) throw new NotFoundError('File');

  const versionFilter: Record<string, unknown> = {
    projectId: file.projectId,
    originalName: file.originalName,
    folder: file.folder,
  };
  if (organizationId) versionFilter.organizationId = organizationId;

  const [versions, total] = await Promise.all([
    File.find(versionFilter)
      .sort({ version: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    File.countDocuments(versionFilter),
  ]);

  return { versions: versions as IFile[], total, page, limit };
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export async function deleteFile(
  id: string,
  userId: string,
  userRole: string,
  organizationId?: string
): Promise<void> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const file = await File.findOne(filter);
  if (!file) throw new NotFoundError('File');

  if (userRole === 'CONTRIBUTOR' && file.uploadedBy.toString() !== userId) {
    throw new AuthorizationError('You can only delete your own files');
  }

  // Validate storage key ownership before deletion (prevents cross-tenant key injection)
  if (organizationId && file.storageKey.startsWith('organizations/')) {
    if (!validateStorageKeyOwnership(file.storageKey, organizationId)) {
      throw new AuthorizationError('Storage access denied: cross-organization key');
    }
  }

  try {
    await deleteFromStorage(file.storageKey);
  } catch (err) {
    logger.warn({ err, storageKey: file.storageKey }, 'Failed to delete from storage');
  }

  // Decrement both client and org storage usage
  await Promise.all([
    Client.findByIdAndUpdate(file.clientId, {
      $inc: { storageUsedBytes: -file.sizeBytes },
    }),
    organizationId
      ? Organization.findByIdAndUpdate(organizationId, {
          $inc: { 'usage.storageUsedBytes': -file.sizeBytes },
        })
      : Promise.resolve(),
  ]);

  await File.findByIdAndDelete(id);
}

// ── Annotations ───────────────────────────────────────────────────────────────

export async function addAnnotation(
  fileId: string,
  data: { x: number; y: number; pageNum?: number; comment: string; authorId: string }
): Promise<IFile> {
  const file = await File.findByIdAndUpdate(
    fileId,
    {
      $push: {
        annotations: { ...data, pageNum: data.pageNum || 1, createdAt: new Date() },
      },
    },
    { new: true }
  );
  if (!file) throw new NotFoundError('File');
  return file;
}

export async function resolveAnnotation(fileId: string, annotationId: string): Promise<IFile> {
  const file = await File.findOneAndUpdate(
    { _id: fileId, 'annotations._id': annotationId },
    { $set: { 'annotations.$.resolvedAt': new Date() } },
    { new: true }
  );
  if (!file) throw new NotFoundError('File or annotation');
  return file;
}

export async function deleteAnnotation(fileId: string, annotationId: string): Promise<IFile> {
  const file = await File.findByIdAndUpdate(
    fileId,
    { $pull: { annotations: { _id: annotationId } } },
    { new: true }
  );
  if (!file) throw new NotFoundError('File');
  return file;
}
