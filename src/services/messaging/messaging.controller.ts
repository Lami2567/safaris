import { Request, Response } from 'express';
import { MessagingService } from './messaging.service';
import { sendSuccess, sendError } from '../../shared/response';
import { localStore } from '../../config/database';

export class MessagingController {
  public static sendMessage(req: Request, res: Response) {
    try {
      const caller = (req as any).user;
      if (!caller || !caller.userId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const senderId = caller.userId;
      const { recipientId, tripId, content } = req.body || {};

      if (!recipientId || !content || !String(content).trim()) {
        return sendError(res, 'INVALID_PAYLOAD', 'recipientId and non-empty content are required.', 400);
      }

      // If tripId is provided, verify caller is participant in that trip
      if (tripId) {
        const trip = localStore.trips.get(tripId);
        if (!trip) {
          return sendError(res, 'TRIP_NOT_FOUND', `Trip '${tripId}' does not exist.`, 404);
        }

        const isSenderParticipant = caller.role === 'admin' || trip.customer_id === senderId || trip.driver_id === senderId;
        if (!isSenderParticipant) {
          return sendError(res, 'FORBIDDEN', 'You cannot send messages into a trip you are not assigned to.', 403);
        }

        const isRecipientParticipant = trip.customer_id === recipientId || trip.driver_id === recipientId;
        if (!isRecipientParticipant && caller.role !== 'admin') {
          return sendError(res, 'FORBIDDEN', 'Recipient is not an active participant in this trip.', 403);
        }
      }

      const message = MessagingService.sendMessage({
        senderId,
        recipientId: String(recipientId),
        tripId: tripId ? String(tripId) : undefined,
        content: String(content).trim(),
      });
      return sendSuccess(res, message, 201);
    } catch (err: any) {
      return sendError(res, 'SEND_MESSAGE_FAILED', err.message, 400);
    }
  }

  public static getTripMessages(req: Request, res: Response) {
    try {
      const caller = (req as any).user;
      if (!caller || !caller.userId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const { tripId } = req.params;
      const trip = localStore.trips.get(tripId);
      if (!trip) {
        return sendError(res, 'TRIP_NOT_FOUND', `Trip '${tripId}' not found.`, 404);
      }

      // Enforce participant authorization
      if (caller.role !== 'admin' && trip.customer_id !== caller.userId && trip.driver_id !== caller.userId) {
        return sendError(res, 'FORBIDDEN', 'Access denied. You are not a participant in this trip.', 403);
      }

      const messages = MessagingService.getTripMessages(tripId);
      return sendSuccess(res, messages);
    } catch (err: any) {
      return sendError(res, 'FETCH_MESSAGES_FAILED', err.message, 500);
    }
  }

  public static getConversation(req: Request, res: Response) {
    try {
      const caller = (req as any).user;
      if (!caller || !caller.userId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const user1 = req.params.userId || caller.userId;
      const user2 = req.query.otherUserId as string;

      if (!user2) {
        return sendError(res, 'INVALID_QUERY', 'otherUserId query parameter is required.', 400);
      }

      // Authorization: caller must be user1 or user2, or an admin
      if (caller.role !== 'admin' && caller.userId !== user1 && caller.userId !== user2) {
        return sendError(res, 'FORBIDDEN', 'Access denied to this conversation.', 403);
      }

      const messages = MessagingService.getConversation(user1, user2);
      return sendSuccess(res, messages);
    } catch (err: any) {
      return sendError(res, 'FETCH_CONVERSATION_FAILED', err.message, 500);
    }
  }
}
