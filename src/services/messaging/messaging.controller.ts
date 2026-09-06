import { Request, Response } from 'express';
import { MessagingService } from './messaging.service';
import { sendSuccess, sendError } from '../../shared/response';

export class MessagingController {
  public static sendMessage(req: Request, res: Response) {
    try {
      const senderId = (req as any).user?.userId || req.body.senderId;
      const message = MessagingService.sendMessage({
        ...req.body,
        senderId,
      });
      return sendSuccess(res, message, 201);
    } catch (err: any) {
      return sendError(res, 'SEND_MESSAGE_FAILED', err.message, 400);
    }
  }

  public static getTripMessages(req: Request, res: Response) {
    try {
      const messages = MessagingService.getTripMessages(req.params.tripId);
      return sendSuccess(res, messages);
    } catch (err: any) {
      return sendError(res, 'FETCH_MESSAGES_FAILED', err.message, 500);
    }
  }

  public static getConversation(req: Request, res: Response) {
    try {
      const user1 = (req as any).user?.userId || req.params.userId;
      const user2 = req.query.otherUserId as string;
      const messages = MessagingService.getConversation(user1, user2);
      return sendSuccess(res, messages);
    } catch (err: any) {
      return sendError(res, 'FETCH_CONVERSATION_FAILED', err.message, 500);
    }
  }
}
