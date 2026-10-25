import { Request, Response } from 'express';
import { DeliveryService } from './delivery.service';
import { sendSuccess, sendError } from '../../shared/response';

export class DeliveryController {
  public static calculateFare(req: Request, res: Response) {
    try {
      const { category, weightKg, distanceKm } = req.body;
      const fare = DeliveryService.calculateDeliveryFare(
        category || 'DOCUMENTS',
        Number(weightKg) || 1,
        Number(distanceKm) || 5
      );
      return sendSuccess(res, { fareUgx: fare });
    } catch (err: any) {
      return sendError(res, 'CALCULATE_FARE_FAILED', err.message, 400);
    }
  }

  public static createDelivery(req: Request, res: Response) {
    try {
      const senderId = (req as any).user?.userId;
      if (!senderId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required to create a delivery.', 401);
      }
      const delivery = DeliveryService.createDelivery({
        ...req.body,
        senderId,
      });
      return sendSuccess(res, delivery, 201);
    } catch (err: any) {
      return sendError(res, 'DELIVERY_CREATION_FAILED', err.message, 400);
    }
  }

  public static getDeliveryById(req: Request, res: Response) {
    try {
      const callerId = (req as any).user?.userId;
      const callerRole = (req as any).user?.role;

      if (!callerId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const delivery = DeliveryService.getDeliveryById(req.params.id);

      // Enforce ownership/assignment
      if (callerRole !== 'admin' && delivery.sender_id !== callerId && delivery.courier_id !== callerId) {
        return sendError(res, 'FORBIDDEN', 'Access denied to this delivery record.', 403);
      }

      return sendSuccess(res, delivery);
    } catch (err: any) {
      return sendError(res, 'DELIVERY_NOT_FOUND', err.message, 404);
    }
  }

  public static trackByTrackingNumber(req: Request, res: Response) {
    try {
      const trackingNumber = req.params.trackingNumber;
      const delivery = DeliveryService.trackByTrackingNumber(trackingNumber);
      return sendSuccess(res, delivery);
    } catch (err: any) {
      return sendError(res, 'PACKAGE_NOT_FOUND', err.message, 404);
    }
  }

  public static updateStatus(req: Request, res: Response) {
    try {
      const actorId = (req as any).user?.userId;
      const actorRole = (req as any).user?.role;

      if (!actorId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const { status } = req.body;
      const updated = DeliveryService.updateDeliveryStatus(req.params.id, status, actorId, actorRole);
      return sendSuccess(res, updated);
    } catch (err: any) {
      const statusCode = err.message?.includes('not authorized') ? 403 : 400;
      return sendError(res, 'UPDATE_STATUS_FAILED', err.message, statusCode);
    }
  }

  public static getUserDeliveries(req: Request, res: Response) {
    try {
      const callerId = (req as any).user?.userId;
      const callerRole = (req as any).user?.role;

      if (!callerId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const requestedUserId = (req.query.userId as string) || callerId;
      if (requestedUserId !== callerId && callerRole !== 'admin') {
        return sendError(res, 'FORBIDDEN', 'Access denied to other user deliveries.', 403);
      }

      const deliveries = DeliveryService.getUserDeliveries(requestedUserId);
      return sendSuccess(res, deliveries);
    } catch (err: any) {
      return sendError(res, 'FETCH_DELIVERIES_FAILED', err.message, 500);
    }
  }
}
