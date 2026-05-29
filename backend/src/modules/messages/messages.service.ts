import { Message, IMessage } from '../../models/Message';
import { Channel, IChannel } from '../../models/Channel';
import { NotFoundError, AuthorizationError } from '../../lib/errors';
import { emitToOrgProject } from '../../sockets/socketServer';
import { createNotification } from '../notifications/notifications.service';
import { logger } from '../../lib/logger';

export async function getOrCreateProjectChannel(
  projectId: string,
  name = 'general',
  createdBy: string,
  organizationId?: string
): Promise<IChannel> {
  const filter: Record<string, unknown> = { projectId, name };
  if (organizationId) filter.organizationId = organizationId;

  let channel = await Channel.findOne(filter);
  if (!channel) {
    channel = await Channel.create({
      projectId,
      name,
      type: 'PROJECT',
      members: [createdBy],
      createdBy,
      ...(organizationId ? { organizationId } : {}),
    });
  }
  return channel;
}

export async function listChannels(projectId?: string, organizationId?: string) {
  const filter: Record<string, unknown> = { isArchived: false };
  if (organizationId) filter.organizationId = organizationId;
  if (projectId) filter.projectId = projectId;

  return Channel.find(filter)
    .populate('projectId', 'name')
    .populate('members', 'name email avatar')
    .sort({ lastMessageAt: -1, createdAt: 1 })
    .lean();
}

export async function getMessages(query: {
  projectId?: string;
  channelId?: string;
  before?: string;
  limit?: number;
  organizationId?: string;
}) {
  const { projectId, channelId, before, limit = 50, organizationId } = query;
  const filter: Record<string, unknown> = { deletedAt: null };

  if (organizationId) filter.organizationId = organizationId;
  if (channelId) filter.channelId = channelId;
  else if (projectId) filter.projectId = projectId;
  if (before) filter.createdAt = { $lt: new Date(before) };

  const messages = await Message.find(filter)
    .populate('senderId', 'name email avatar role')
    .populate('attachments', 'name mimeType sizeBytes storageKey')
    .populate('mentions', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return messages.reverse();
}

export async function sendMessage(data: {
  projectId: string;
  channelId: string;
  senderId: string;
  content: string;
  contentType?: string;
  attachments?: string[];
  mentions?: string[];
  replyTo?: string;
  organizationId?: string;
}): Promise<IMessage> {
  const message = await Message.create({
    projectId: data.projectId,
    channelId: data.channelId,
    senderId: data.senderId,
    content: data.content,
    contentType: data.contentType || 'TEXT',
    attachments: data.attachments,
    mentions: data.mentions,
    replyTo: data.replyTo,
    ...(data.organizationId ? { organizationId: data.organizationId } : {}),
  });

  await Channel.findByIdAndUpdate(data.channelId, { lastMessageAt: new Date() });

  const populated = await Message.findById(message._id)
    .populate('senderId', 'name email avatar role')
    .populate('attachments', 'name mimeType sizeBytes')
    .populate('mentions', 'name email');

  // Emit via org-namespaced project room
  try {
    emitToOrgProject(data.organizationId ?? '', data.projectId, 'message:new', populated);
  } catch (err) {
    logger.warn({ err }, 'Socket emit failed');
  }

  // Notify mentioned users
  if (data.mentions?.length) {
    for (const userId of data.mentions) {
      if (userId !== data.senderId) {
        await createNotification({
          userId,
          type: 'MENTION',
          title: 'You were mentioned',
          body: 'Someone mentioned you in a message',
          link: `/projects/${data.projectId}?tab=messages`,
          metadata: { messageId: message._id.toString(), projectId: data.projectId },
          organizationId: data.organizationId,
        });
      }
    }
  }

  return populated!;
}

export async function editMessage(
  id: string,
  content: string,
  userId: string,
  organizationId?: string
): Promise<IMessage> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const message = await Message.findOne(filter);
  if (!message) throw new NotFoundError('Message');
  if (message.senderId.toString() !== userId) {
    throw new AuthorizationError('You can only edit your own messages');
  }

  const updated = await Message.findOneAndUpdate(
    filter,
    { content, editedAt: new Date() },
    { new: true }
  ).populate('senderId', 'name email avatar');

  if (!updated) throw new NotFoundError('Message');

  try {
    emitToOrgProject(
      organizationId ?? '',
      message.projectId.toString(),
      'message:edited',
      updated
    );
  } catch (err) {
    logger.warn({ err }, 'Socket emit failed');
  }

  return updated;
}

export async function deleteMessage(
  id: string,
  userId: string,
  userRole: string,
  organizationId?: string
): Promise<void> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const message = await Message.findOne(filter);
  if (!message) throw new NotFoundError('Message');

  const canDelete =
    message.senderId.toString() === userId ||
    ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_OWNER'].includes(userRole);

  if (!canDelete) throw new AuthorizationError('Cannot delete this message');

  await Message.findOneAndUpdate(filter, {
    deletedAt: new Date(),
    content: '[Message deleted]',
  });

  try {
    emitToOrgProject(
      organizationId ?? '',
      message.projectId.toString(),
      'message:deleted',
      { id }
    );
  } catch (err) {
    logger.warn({ err }, 'Socket emit failed');
  }
}

export async function pinMessage(id: string, pin: boolean): Promise<IMessage> {
  const message = await Message.findByIdAndUpdate(id, { isPinned: pin }, { new: true });
  if (!message) throw new NotFoundError('Message');
  return message;
}

export async function markRead(
  messageId: string,
  userId: string,
  organizationId?: string
): Promise<void> {
  await Message.findByIdAndUpdate(messageId, {
    $addToSet: { readBy: { userId, readAt: new Date() } },
  });

  const filter: Record<string, unknown> = { _id: messageId };
  if (organizationId) filter.organizationId = organizationId;

  const message = await Message.findOne(filter);
  if (message) {
    try {
      emitToOrgProject(
        organizationId ?? '',
        message.projectId.toString(),
        'message:read',
        { messageId, userId }
      );
    } catch (err) {
      logger.warn({ err }, 'Socket emit failed');
    }
  }
}

export async function searchMessages(
  query: string,
  projectId?: string,
  limit = 20,
  organizationId?: string
) {
  const filter: Record<string, unknown> = {
    $text: { $search: query },
    deletedAt: null,
  };
  if (organizationId) filter.organizationId = organizationId;
  if (projectId) filter.projectId = projectId;

  return Message.find(filter, { score: { $meta: 'textScore' } })
    .populate('senderId', 'name email avatar')
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .lean();
}
