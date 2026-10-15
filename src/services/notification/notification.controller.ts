import { Request, Response } from 'express';
import { NotificationService } from './notification.service';
import { sendSuccess, sendError } from '../../shared/response';

export class NotificationController {
  public static async getUserNotifications(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId || req.params.userId;
      const type = (req.query.type as string) || undefined;
      const notifications = await NotificationService.getUserNotifications(userId, type);
      return sendSuccess(res, notifications);
    } catch (err: any) {
      return sendError(res, 'FETCH_NOTIFICATIONS_FAILED', err.message, 500);
    }
  }

  public static async markAsRead(req: Request, res: Response) {
    try {
      const updated = await NotificationService.markAsRead(req.params.id);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'MARK_READ_FAILED', err.message, 400);
    }
  }

  public static async markAllAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId || req.params.userId;
      const result = await NotificationService.markAllAsRead(userId);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'MARK_ALL_READ_FAILED', err.message, 400);
    }
  }

  public static async clearNotifications(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId || req.params.userId;
      const type = (req.query.type as string) || undefined;
      const result = await NotificationService.clearUserNotifications(userId, type);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'CLEAR_NOTIFICATIONS_FAILED', err.message, 400);
    }
  }

  public static async deleteNotification(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await NotificationService.deleteNotificationById(id);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'DELETE_NOTIFICATION_FAILED', err.message, 400);
    }
  }

  public static async getUnreadCount(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId || req.params.userId;
      const unreadCount = await NotificationService.getUnreadCount(userId);
      return sendSuccess(res, { unreadCount });
    } catch (err: any) {
      return sendError(res, 'FETCH_UNREAD_COUNT_FAILED', err.message, 500);
    }
  }

  public static async createNotification(req: Request, res: Response) {
    try {
      const notif = await NotificationService.createNotification(req.body);
      return sendSuccess(res, notif, 201);
    } catch (err: any) {
      return sendError(res, 'CREATE_NOTIFICATION_FAILED', err.message, 400);
    }
  }

  public static async broadcastNotification(req: Request, res: Response) {
    try {
      const result = await NotificationService.broadcastAdminNotification(req.body);
      return sendSuccess(res, result, 201);
    } catch (err: any) {
      return sendError(res, 'BROADCAST_NOTIFICATION_FAILED', err.message, 400);
    }
  }
}
