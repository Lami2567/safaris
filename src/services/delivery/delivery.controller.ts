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
      const senderId = (req as any).user?.userId || req.body.senderId || 'usr_ug_001';
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
      const delivery = DeliveryService.getDeliveryById(req.params.id);
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
      const { status } = req.body;
      const updated = DeliveryService.updateDeliveryStatus(req.params.id, status);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_STATUS_FAILED', err.message, 400);
    }
  }

  public static getUserDeliveries(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId || (req.query.userId as string);
      const deliveries = DeliveryService.getUserDeliveries(userId);
      return sendSuccess(res, deliveries);
    } catch (err: any) {
      return sendError(res, 'FETCH_DELIVERIES_FAILED', err.message, 500);
    }
  }
}
