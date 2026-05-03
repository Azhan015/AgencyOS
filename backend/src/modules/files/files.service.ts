import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { File, IFile } from '../../models/File';
import { Client } from '../../models/Client';
import { uploadFile, getSignedDownloadUrl, deleteFile as deleteFromStorage, generateStorageKey } from '../../config/storage';
import { NotFoundError, FileError, AuthorizationError } from '../../lib/errors';
import { createNotification } from '../notifications/notifications.service';
import { emitAutomationEvent } from '../automations/automations.service';
import { getSocketServer } from '../../sockets/socketServer';
import { logger } from '../../lib/logger';
import { env } from '../../config/env';

// Multer config — memory storage for virus scan before S3
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    // Block dangerous executables
    const blocked = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.jar'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (blocked.includes(ext)) {
      cb(new FileError(`File type ${ext} is not allowed`));
    } else {
      cb(null, true);
    }
  },
});

export async function uploadFileToProject(data: {
  projectId: string;
  clientId: string;
  uploadedBy: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  folder?: string;
  isClientVisible?: boolean;
  existingFileId?: string; // for new version
}): Promise<IFile> {
  const { projectId, clientId, uploadedBy, originalName, mimeType, buffer, folder = '/', isClientVisible = false, existingFileId } = data;

  // Check storage quota
  const client = await Client.findById(clientId);
  if (!client) throw new NotFoundError('Client');

  if (client.storageUsedBytes + buffer.length > client.storageLimitBytes) {
    throw new FileError('Storage quota exceeded');
  }

  let version = 1;
  let parentFileId: string | undefined;

  if (existingFileId) {
    const existing = await File.findById(existingFileId);
    if (existing) {
      version = existing.version + 1;
      parentFileId = existingFileId;
    }
  }

  // Generate storage key
  const ext = path.extname(originalName);
  const storageKey = generateStorageKey(`projects/${projectId}/${folder}`, `${uuidv4()}${ext}`);

  // Upload to S3/R2
  await uploadFile(storageKey, buffer, mimeType);

  // Create file record
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
  });

  // Update client storage usage
  await Client.findByIdAndUpdate(clientId, {
    $inc: { storageUsedBytes: buffer.length },
  });

  // Queue virus scan
  try {
    const { scanQueue } = await import('../../workers/scanWorker');
    const queue = scanQueue();
    if (queue) {
      await queue.add({ fileId: file._id.toString(), storageKey });
    } else {
      // Redis not available — mark clean immediately
      await File.findByIdAndUpdate(file._id, { scanStatus: 'CLEAN' });
    }
  } catch (err) {
    logger.warn({ err }, 'Scan queue not available, marking file as clean');
    await File.findByIdAndUpdate(file._id, { scanStatus: 'CLEAN' });
  }

  // Emit socket event
  try {
    const io = getSocketServer();
    io.to(`project:${projectId}`).emit('file:uploaded', {
      fileId: file._id.toString(),
      name: originalName,
      uploadedBy,
      projectId,
    });
  } catch (err) {
    logger.warn({ err }, 'Socket emit failed');
  }

  // Notify project members if client-visible
  if (isClientVisible) {
    await emitAutomationEvent('file.uploaded', {
      fileId: file._id.toString(),
      projectId,
      clientId,
      fileName: originalName,
    });
  }

  return file;
}

export async function listFiles(query: {
  projectId?: string;
  clientId?: string;
  folder?: string;
  userRole?: string;
  page?: number;
  limit?: number;
}) {
  const { projectId, clientId, folder, userRole, page = 1, limit = 50 } = query;
  const filter: Record<string, unknown> = {};

  if (projectId) filter.projectId = projectId;
  if (clientId) filter.clientId = clientId;
  if (folder) filter.folder = folder;
  if (userRole === 'CLIENT') filter.isClientVisible = true;

  // Only show latest versions (no parentFileId or is root)
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

export async function getFile(id: string, userRole?: string, clientId?: string): Promise<IFile> {
  const file = await File.findById(id).populate('uploadedBy', 'name email avatar');
  if (!file) throw new NotFoundError('File');

  if (userRole === 'CLIENT') {
    if (file.clientId.toString() !== clientId) throw new AuthorizationError();
    if (!file.isClientVisible) throw new AuthorizationError();
  }

  return file;
}

export async function getDownloadUrl(id: string, userRole?: string, clientId?: string): Promise<string> {
  const file = await getFile(id, userRole, clientId);

  if (file.scanStatus === 'INFECTED') {
    throw new FileError('File is infected and cannot be downloaded');
  }
  if (file.scanStatus === 'PENDING') {
    throw new FileError('File is still being scanned');
  }

  // Increment download count
  await File.findByIdAndUpdate(id, { $inc: { downloadCount: 1 } });

  return getSignedDownloadUrl(file.storageKey, 300); // 5 min
}

export async function getFileVersions(fileId: string): Promise<IFile[]> {
  const file = await File.findById(fileId);
  if (!file) throw new NotFoundError('File');

  // Find all versions of this file (same original name, same project)
  const versions = await File.find({
    projectId: file.projectId,
    originalName: file.originalName,
    folder: file.folder,
  }).sort({ version: -1 }).lean();

  return versions as IFile[];
}

export async function deleteFile(id: string, userId: string, userRole: string): Promise<void> {
  const file = await File.findById(id);
  if (!file) throw new NotFoundError('File');

  if (userRole === 'CONTRIBUTOR' && file.uploadedBy.toString() !== userId) {
    throw new AuthorizationError('You can only delete your own files');
  }

  // Delete from storage
  try {
    await deleteFromStorage(file.storageKey);
  } catch (err) {
    logger.warn({ err, storageKey: file.storageKey }, 'Failed to delete from storage');
  }

  // Update client storage
  await Client.findByIdAndUpdate(file.clientId, {
    $inc: { storageUsedBytes: -file.sizeBytes },
  });

  await File.findByIdAndDelete(id);
}

export async function addAnnotation(fileId: string, data: {
  x: number;
  y: number;
  pageNum?: number;
  comment: string;
  authorId: string;
}): Promise<IFile> {
  const file = await File.findByIdAndUpdate(
    fileId,
    {
      $push: {
        annotations: {
          ...data,
          pageNum: data.pageNum || 1,
          createdAt: new Date(),
        },
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
