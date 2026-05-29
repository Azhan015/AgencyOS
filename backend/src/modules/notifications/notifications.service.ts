import { Notification, INotification, NotificationType } from '../../models/Notification';
import { User } from '../../models/User';
import { emitToOrgUser } from '../../sockets/socketServer';
import { logger } from '../../lib/logger';

export async function createNotification(data: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
  organizationId?: string;
}): Promise<INotification> {
  const notification = await Notification.create({
    userId: data.userId,
    type: data.type,
    title: data.title,
    body: data.body,
    link: data.link,
    metadata: data.metadata,
    ...(data.organizationId ? { organizationId: data.organizationId } : {}),
  });

  // Emit via socket to org-scoped user room
  try {
    emitToOrgUser(
      data.organizationId ?? '',
      data.userId,
      'notification:new',
      notification
    );
  } catch (err) {
    logger.warn({ err }, 'Socket notification emit failed');
  }

  return notification;
}

export async function listNotifications(userId: string, query: {
  limit?: number;
  unread?: boolean;
  page?: number;
  organizationId?: string;
}) {
  const { limit = 20, unread, page = 1, organizationId } = query;
  const filter: Record<string, unknown> = { userId };
  if (organizationId) filter.organizationId = organizationId;
  if (unread) filter.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, isRead: false, ...(organizationId ? { organizationId } : {}) }),
  ]);

  return { notifications, total, unreadCount, page, limit };
}

export async function markRead(notificationId: string, userId: string, organizationId?: string): Promise<void> {
  const filter: Record<string, unknown> = { _id: notificationId, userId };
  if (organizationId) filter.organizationId = organizationId;
  await Notification.findOneAndUpdate(filter, { isRead: true, readAt: new Date() });
}

export async function markAllRead(userId: string, organizationId?: string): Promise<void> {
  const filter: Record<string, unknown> = { userId, isRead: false };
  if (organizationId) filter.organizationId = organizationId;
  await Notification.updateMany(filter, { isRead: true, readAt: new Date() });
}

export async function updatePreferences(userId: string, prefs: {
  email?: { immediate?: boolean; digest?: string };
  inApp?: boolean;
  push?: boolean;
}): Promise<void> {
  await User.findByIdAndUpdate(userId, {
    $set: { notificationPrefs: prefs },
  });
}

export async function getPreferences(userId: string) {
  const user = await User.findById(userId).select('notificationPrefs');
  return user?.notificationPrefs;
}
