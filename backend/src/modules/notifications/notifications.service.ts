import { Notification, INotification, NotificationType } from '../../models/Notification';
import { User } from '../../models/User';
import { getSocketServer } from '../../sockets/socketServer';
import { logger } from '../../lib/logger';

export async function createNotification(data: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<INotification> {
  const notification = await Notification.create(data);

  // Emit via socket to user's personal room
  try {
    const io = getSocketServer();
    io.to(`user:${data.userId}`).emit('notification:new', notification);
  } catch (err) {
    logger.warn({ err }, 'Socket notification emit failed');
  }

  return notification;
}

export async function listNotifications(userId: string, query: {
  limit?: number;
  unread?: boolean;
  page?: number;
}) {
  const { limit = 20, unread, page = 1 } = query;
  const filter: Record<string, unknown> = { userId };
  if (unread) filter.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, isRead: false }),
  ]);

  return { notifications, total, unreadCount, page, limit };
}

export async function markRead(notificationId: string, userId: string): Promise<void> {
  await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true, readAt: new Date() }
  );
}

export async function markAllRead(userId: string): Promise<void> {
  await Notification.updateMany(
    { userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
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
