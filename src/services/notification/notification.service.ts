import { localStore, db } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';
import { emitToUser, emitToRoom } from '../../realtime/socket_server';

export interface CreateNotificationRequest {
  userId: string;
  title: string;
  body?: string;
  message?: string;
  type?: 'DRIVER' | 'PAYMENT' | 'ADMIN' | 'SYSTEM' | string;
  metadata?: Record<string, any>;
  data?: Record<string, any>;
}

export interface BroadcastNotificationRequest {
  title: string;
  body?: string;
  message?: string;
  type?: 'ADMIN' | 'SYSTEM' | string;
  metadata?: Record<string, any>;
  category?: string;
  priority?: 'normal' | 'high' | 'urgent';
}

export class NotificationService {
  /**
   * Persists a notification to the database and dispatches via WebSocket in real-time
   */
  public static async createNotification(data: CreateNotificationRequest) {
    const id = `notif_${uuidv4().substring(0, 8)}`;
    const msg = data.message || data.body || '';
    const notifType = (data.type || 'SYSTEM').toUpperCase();
    const meta = data.metadata || data.data || {};
    const createdAt = new Date().toISOString();

    const notif = {
      id,
      user_id: data.userId,
      title: data.title,
      message: msg,
      body: msg, // support both keys for frontend compatibility
      type: notifType,
      is_read: false,
      metadata: meta,
      data: meta,
      created_at: createdAt,
    };

    // 1. Persist directly in PostgreSQL if connected
    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO notifications (id, user_id, title, message, type, is_read, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, data.userId, data.title, msg, notifType, false, JSON.stringify(meta), createdAt]
        );
      } catch (err) {
        console.error('[NotificationService.createNotification DB Error]:', err);
      }
    }

    // 2. Keep localStore synchronized
    localStore.notifications.set(id, notif);

    // 3. Dispatch real-time event to user's WebSocket
    emitToUser(data.userId, 'notification:received', notif);

    return notif;
  }

  /**
   * Broadcasts a custom admin notification to all users across database and real-time sockets
   */
  public static async broadcastAdminNotification(data: BroadcastNotificationRequest) {
    const msg = data.message || data.body || '';
    const notifType = (data.type || 'ADMIN').toUpperCase();
    const metadata = {
      priority: data.priority || 'normal',
      category: data.category || 'Advisory',
      ...(data.metadata || {}),
    };

    // Fetch all user IDs
    let userIds: string[] = [];
    if (db.isPostgresConnected) {
      try {
        const res = await db.query('SELECT id FROM users');
        userIds = res.rows.map((r: any) => r.id);
      } catch (err) {
        console.error('[NotificationService.broadcastAdminNotification Users Fetch Error]:', err);
      }
    }

    if (userIds.length === 0) {
      userIds = Array.from(localStore.users.keys());
    }

    // If still empty (e.g. fresh startup), use default customer id
    if (userIds.length === 0) {
      userIds = ['usr_ug_001'];
    }

    const createdNotifications: any[] = [];
    for (const uId of userIds) {
      const created = await this.createNotification({
        userId: uId,
        title: data.title,
        message: msg,
        type: notifType,
        metadata,
      });
      createdNotifications.push(created);
    }

    // Broadcast announcement room wide
    emitToRoom('all_users', 'notification:received', {
      title: data.title,
      message: msg,
      type: notifType,
      metadata,
    });

    return {
      success: true,
      recipientsCount: userIds.length,
      sample: createdNotifications[0],
    };
  }

  /**
   * Fetches notifications for a given user from database or memory store
   */
  public static async getUserNotifications(userId: string, filterType?: string) {
    let items: any[] = [];

    if (db.isPostgresConnected) {
      try {
        let query = 'SELECT * FROM notifications WHERE user_id = $1';
        const params: any[] = [userId];

        if (filterType && filterType !== 'ALL') {
          query += ' AND UPPER(type) = $2';
          params.push(filterType.toUpperCase());
        }

        query += ' ORDER BY created_at DESC';
        const res = await db.query(query, params);
        items = res.rows.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          title: r.title,
          message: r.message,
          body: r.message,
          type: r.type,
          is_read: r.is_read,
          metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {},
          created_at: r.created_at,
        }));
      } catch (err) {
        console.error('[NotificationService.getUserNotifications DB Error]:', err);
      }
    }

    // Fallback or localStore sync
    if (items.length === 0) {
      items = Array.from(localStore.notifications.values())
        .filter((n: any) => n.user_id === userId)
        .filter((n: any) => {
          if (!filterType || filterType.toUpperCase() === 'ALL') return true;
          return (n.type || '').toUpperCase() === filterType.toUpperCase();
        })
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return items;
  }

  /**
   * Marks a specific notification as read in the database
   */
  public static async markAsRead(notificationId: string) {
    if (db.isPostgresConnected) {
      try {
        await db.query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [notificationId]);
      } catch (err) {
        console.error('[NotificationService.markAsRead DB Error]:', err);
      }
    }

    const notif = localStore.notifications.get(notificationId);
    if (notif) {
      notif.is_read = true;
    }
    return notif || { id: notificationId, is_read: true };
  }

  /**
   * Marks all notifications for a specific user as read in the database
   */
  public static async markAllAsRead(userId: string) {
    if (db.isPostgresConnected) {
      try {
        await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [userId]);
      } catch (err) {
        console.error('[NotificationService.markAllAsRead DB Error]:', err);
      }
    }

    for (const notif of localStore.notifications.values()) {
      if (notif.user_id === userId) {
        notif.is_read = true;
      }
    }

    return { success: true, userId };
  }

  /**
   * Clears/deletes notifications for a specific user from the database
   */
  public static async clearUserNotifications(userId: string, filterType?: string) {
    if (db.isPostgresConnected) {
      try {
        if (filterType && filterType !== 'ALL') {
          await db.query('DELETE FROM notifications WHERE user_id = $1 AND UPPER(type) = $2', [
            userId,
            filterType.toUpperCase(),
          ]);
        } else {
          await db.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
        }
      } catch (err) {
        console.error('[NotificationService.clearUserNotifications DB Error]:', err);
      }
    }

    for (const [id, notif] of localStore.notifications.entries()) {
      if (notif.user_id === userId) {
        if (!filterType || filterType.toUpperCase() === 'ALL') {
          localStore.notifications.delete(id);
        } else if ((notif.type || '').toUpperCase() === filterType.toUpperCase()) {
          localStore.notifications.delete(id);
        }
      }
    }

    return { success: true, userId };
  }

  /**
   * Permanently deletes a single notification by ID
   */
  public static async deleteNotificationById(notificationId: string) {
    if (db.isPostgresConnected) {
      try {
        await db.query('DELETE FROM notifications WHERE id = $1', [notificationId]);
      } catch (err) {
        console.error('[NotificationService.deleteNotificationById DB Error]:', err);
      }
    }

    localStore.notifications.delete(notificationId);
    return { success: true, id: notificationId };
  }

  /**
   * Retrieves unread notification count
   */
  public static async getUnreadCount(userId: string) {
    if (db.isPostgresConnected) {
      try {
        const res = await db.query(
          'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
          [userId]
        );
        return parseInt(res.rows[0]?.unread_count || '0', 10);
      } catch (err) {
        console.error('[NotificationService.getUnreadCount DB Error]:', err);
      }
    }

    return Array.from(localStore.notifications.values()).filter(
      (n: any) => n.user_id === userId && !n.is_read
    ).length;
  }
}
