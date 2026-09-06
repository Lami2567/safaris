import { Request, Response } from 'express';
import { NotificationService } from './notification.service';
import { sendSuccess, sendError } from '../../shared/response';

export class NotificationController {
  public static getUserNotifications(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId || req.params.userId;
      const notifications = NotificationService.getUserNotifications(userId);
      return sendSuccess(res, notifications);
    } catch (err: any) {
      return sendError(res, 'FETCH_NOTIFICATIONS_FAILED', err.message, 500);
    }
  }

  public static markAsRead(req: Request, res: Response) {
    try {
      const updated = NotificationService.markAsRead(req.params.id);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'MARK_READ_FAILED', err.message, 400);
    }
  }

  public static createNotification(req: Request, res: Response) {
    try {
      const notif = NotificationService.createNotification(req.body);
      return sendSuccess(res, notif, 201);
    } catch (err: any) {
      return sendError(res, 'CREATE_NOTIFICATION_FAILED', err.message, 400);
    }
  }
}
