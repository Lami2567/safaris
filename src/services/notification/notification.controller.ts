import { Request, Response } from 'express';
import { NotificationService } from './notification.service';
import { sendSuccess, sendError } from '../../shared/response';

export class NotificationController {
  public static async getUserNotifications(req: Request, res: Response) {
    try {
      const callerId = (req as any).user?.userId;
      const callerRole = (req as any).user?.role;
      const targetUserId = req.params.userId || callerId;

      if (!callerId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      // IDOR check: Users may only access their own notifications
      if (targetUserId !== callerId && callerRole !== 'admin') {
        return sendError(res, 'FORBIDDEN', 'Access denied to other user notifications.', 403);
      }

      const type = (req.query.type as string) || undefined;
      const notifications = await NotificationService.getUserNotifications(targetUserId, type);
      return sendSuccess(res, notifications);
    } catch (err: any) {
      return sendError(res, 'FETCH_NOTIFICATIONS_FAILED', err.message, 500);
    }
  }

  public static async markAsRead(req: Request, res: Response) {
    try {
      const callerId = (req as any).user?.userId;
      const callerRole = (req as any).user?.role;

      if (!callerId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const notifId = req.params.id;
      const updated = await NotificationService.markAsRead(notifId, callerId, callerRole === 'admin');
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'MARK_READ_FAILED', 'Notification unavailable.', err.message === 'Notification unavailable.' ? 404 : 503);
    }
  }

  public static async markAllAsRead(req: Request, res: Response) {
    try {
      const callerId = (req as any).user?.userId;
      const callerRole = (req as any).user?.role;
      const targetUserId = req.params.userId || callerId;

      if (!callerId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      if (targetUserId !== callerId && callerRole !== 'admin') {
        return sendError(res, 'FORBIDDEN', 'Access denied.', 403);
      }

      const result = await NotificationService.markAllAsRead(targetUserId);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'MARK_ALL_READ_FAILED', err.message, 400);
    }
  }

  public static async clearNotifications(req: Request, res: Response) {
    try {
      const callerId = (req as any).user?.userId;
      const callerRole = (req as any).user?.role;
      const targetUserId = req.params.userId || callerId;

      if (!callerId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      if (targetUserId !== callerId && callerRole !== 'admin') {
        return sendError(res, 'FORBIDDEN', 'Access denied.', 403);
      }

      const type = (req.query.type as string) || undefined;
      const result = await NotificationService.clearUserNotifications(targetUserId, type);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'CLEAR_NOTIFICATIONS_FAILED', err.message, 400);
    }
  }

  public static async deleteNotification(req: Request, res: Response) {
    try {
      const callerId = (req as any).user?.userId;
      const callerRole = (req as any).user?.role;

      if (!callerId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const notifId = req.params.id;
      const result = await NotificationService.deleteNotificationById(notifId, callerId, callerRole === 'admin');
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'DELETE_NOTIFICATION_FAILED', 'Notification unavailable.', err.message === 'Notification unavailable.' ? 404 : 503);
    }
  }

  public static async getUnreadCount(req: Request, res: Response) {
    try {
      const callerId = (req as any).user?.userId;
      const callerRole = (req as any).user?.role;
      const targetUserId = req.params.userId || callerId;

      if (!callerId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      if (targetUserId !== callerId && callerRole !== 'admin') {
        return sendError(res, 'FORBIDDEN', 'Access denied.', 403);
      }

      const unreadCount = await NotificationService.getUnreadCount(targetUserId);
      return sendSuccess(res, { unreadCount });
    } catch (err: any) {
      return sendError(res, 'FETCH_UNREAD_COUNT_FAILED', err.message, 500);
    }
  }

  public static async createNotification(req: Request, res: Response) {
    try {
      const callerRole = (req as any).user?.role;
      if (callerRole !== 'admin') {
        return sendError(res, 'FORBIDDEN', 'Only administrators can create custom notifications.', 403);
      }
      const notif = await NotificationService.createNotification(req.body);
      return sendSuccess(res, notif, 201);
    } catch (err: any) {
      return sendError(res, 'CREATE_NOTIFICATION_FAILED', err.message, 400);
    }
  }

  public static async broadcastNotification(req: Request, res: Response) {
    try {
      const callerRole = (req as any).user?.role;
      if (callerRole !== 'admin') {
        return sendError(res, 'FORBIDDEN', 'Only administrators can broadcast notifications.', 403);
      }
      const result = await NotificationService.broadcastAdminNotification(req.body);
      return sendSuccess(res, result, 201);
    } catch (err: any) {
      return sendError(res, 'BROADCAST_NOTIFICATION_FAILED', err.message, 400);
    }
  }
}
