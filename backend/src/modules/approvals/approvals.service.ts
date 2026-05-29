import { Approval, IApproval } from '../../models/Approval';
import { Project } from '../../models/Project';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { createNotification } from '../notifications/notifications.service';
import { emitToOrgProject } from '../../sockets/socketServer';
import { sendEmail, getApprovalRequestEmail } from '../../lib/email';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export async function listApprovals(query: {
  projectId?: string;
  status?: string;
  page?: number;
  limit?: number;
  organizationId?: string;
}) {
  const { projectId, status, page = 1, limit = 20, organizationId } = query;
  const filter: Record<string, unknown> = {};
  if (organizationId) filter.organizationId = organizationId;
  if (projectId) filter.projectId = projectId;
  if (status) filter.status = status;

  const [approvals, total] = await Promise.all([
    Approval.find(filter)
      .populate('submittedBy', 'name email avatar')
      .populate('approvedBy', 'name email')
      .populate('fileIds', 'name mimeType sizeBytes storageKey version')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Approval.countDocuments(filter),
  ]);

  return { approvals, total, page, limit };
}

export async function getApproval(id: string, organizationId?: string): Promise<IApproval> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;
  const approval = await Approval.findOne(filter)
    .populate('submittedBy', 'name email avatar')
    .populate('approvedBy', 'name email')
    .populate('fileIds', 'name mimeType sizeBytes storageKey version annotations');
  if (!approval) throw new NotFoundError('Approval');
  return approval;
}

export async function createApproval(data: {
  projectId: string;
  milestoneId?: string;
  fileIds: string[];
  submittedBy: string;
  submissionNote?: string;
  dueDate?: Date;
  title: string;
  organizationId?: string;
}): Promise<IApproval> {
  const approval = await Approval.create({
    ...data,
    status: 'PENDING',
  });

  // Get project to find client
  const project = await Project.findById(data.projectId).populate('clientId');
  if (project) {
    const { User } = await import('../../models/User');
    const clientId = (project.clientId as unknown as { _id: string })._id;
    const clientUser = await User.findOne({ clientId, role: 'CLIENT' });

    if (clientUser) {
      await createNotification({
        userId: clientUser._id.toString(),
        type: 'APPROVAL_NEEDED',
        title: 'Approval needed',
        body: `"${data.title}" is ready for your review`,
        link: `/projects/${data.projectId}?tab=approvals`,
        metadata: { approvalId: approval._id.toString(), projectId: data.projectId },
      });

      // Send email
      try {
        const client = project.clientId as unknown as { email: string; contactName: string; companyName: string };
        await sendEmail({
          to: client.email,
          subject: `Approval needed: ${data.title}`,
          html: getApprovalRequestEmail(
            client.contactName,
            (project as unknown as { name: string }).name,
            data.title,
            `${env.FRONTEND_URL}/projects/${data.projectId}?tab=approvals&id=${approval._id}`
          ),
        });
      } catch (err) {
        logger.warn({ err }, 'Approval email failed');
      }
    }
  }

  // Emit socket event — org-namespaced
  try {
    emitToOrgProject(
      data.organizationId ?? '',
      data.projectId,
      'approval:updated',
      { approvalId: approval._id.toString(), status: 'PENDING' }
    );
  } catch (err) {
    logger.warn({ err }, 'Socket emit failed');
  }

  return approval;
}

export async function approveDeliverable(id: string, userId: string): Promise<IApproval> {
  const approval = await Approval.findById(id);
  if (!approval) throw new NotFoundError('Approval');

  if (!['PENDING', 'IN_REVIEW'].includes(approval.status)) {
    throw new ValidationError('Approval is not in a reviewable state');
  }

  const updated = await Approval.findByIdAndUpdate(
    id,
    { status: 'APPROVED', approvedBy: userId, approvedAt: new Date() },
    { new: true }
  );

  if (!updated) throw new NotFoundError('Approval');

  // Notify PM
  const project = await Project.findById(approval.projectId);
  if (project) {
    await createNotification({
      userId: project.pm.toString(),
      type: 'APPROVAL_UPDATED',
      title: 'Deliverable approved',
      body: `"${approval.title}" has been approved`,
      link: `/projects/${approval.projectId}?tab=approvals`,
      metadata: { approvalId: id },
    });
  }

  try {
    emitToOrgProject(
      '',
      approval.projectId.toString(),
      'approval:updated',
      { approvalId: id, status: 'APPROVED' }
    );
  } catch (err) {
    logger.warn({ err }, 'Socket emit failed');
  }

  return updated;
}

export async function rejectDeliverable(id: string, userId: string, reason: string): Promise<IApproval> {
  const approval = await Approval.findById(id);
  if (!approval) throw new NotFoundError('Approval');

  const updated = await Approval.findByIdAndUpdate(
    id,
    { status: 'REJECTED', rejectionReason: reason },
    { new: true }
  );

  if (!updated) throw new NotFoundError('Approval');

  const project = await Project.findById(approval.projectId);
  if (project) {
    await createNotification({
      userId: project.pm.toString(),
      type: 'APPROVAL_UPDATED',
      title: 'Deliverable rejected',
      body: `"${approval.title}" was rejected: ${reason}`,
      link: `/projects/${approval.projectId}?tab=approvals`,
      metadata: { approvalId: id },
    });
  }

  return updated;
}

export async function requestRevision(id: string, data: {
  note: string;
  fileIds?: string[];
}): Promise<IApproval> {
  const approval = await Approval.findById(id);
  if (!approval) throw new NotFoundError('Approval');

  const updated = await Approval.findByIdAndUpdate(
    id,
    {
      status: 'REVISION_REQUESTED',
      $push: {
        revisions: {
          note: data.note,
          fileIds: data.fileIds || [],
          requestedAt: new Date(),
        },
      },
    },
    { new: true }
  );

  if (!updated) throw new NotFoundError('Approval');

  const project = await Project.findById(approval.projectId);
  if (project) {
    await createNotification({
      userId: project.pm.toString(),
      type: 'APPROVAL_UPDATED',
      title: 'Revision requested',
      body: `Revision requested for "${approval.title}": ${data.note}`,
      link: `/projects/${approval.projectId}?tab=approvals`,
      metadata: { approvalId: id },
    });
  }

  return updated;
}
