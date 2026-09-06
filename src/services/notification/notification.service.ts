import { localStore } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';
import { emitToUser } from '../../realtime/socket_server';

export interface CreateNotificationRequest {
  userId: string;
  title: string;
  body: string;
  type: string;
  data?: any;
}

export class NotificationService {
  public static createNotification(data: CreateNotificationRequest) {
    const id = `notif_${uuidv4().substring(0, 8)}`;
    const notif = {
      id,
      user_id: data.userId,
      title: data.title,
      body: data.body,
      type: data.type || 'SYSTEM',
      data: data.data || {},
      is_read: false,
      created_at: new Date().toISOString(),
    };

    localStore.notifications.set(id, notif);

    // Push notification to user socket
    emitToUser(data.userId, 'notification:received', notif);

    return notif;
  }

  public static getUserNotifications(userId: string) {
    return Array.from(localStore.notifications.values())
      .filter((n: any) => n.user_id === userId)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public static markAsRead(notificationId: string) {
    const notif = localStore.notifications.get(notificationId);
    if (notif) {
      notif.is_read = true;
    }
    return notif;
  }
}
