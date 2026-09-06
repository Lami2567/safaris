import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../gateway/auth_middleware';
import { TripService } from './trip.service';
import { sendSuccess, sendError } from '../../shared/response';

export class TripController {
  public static estimateFare(req: Request, res: Response) {
    try {
      const distanceKm = req.query.distanceKm ? Number(req.query.distanceKm) : 8.0;
      const estimates = TripService.estimateFare(distanceKm);
      return sendSuccess(res, { distanceKm, estimates });
    } catch (err: any) {
      return sendError(res, 'ESTIMATE_FAILED', err.message);
    }
  }

  public static createTrip(req: AuthenticatedRequest, res: Response) {
    try {
      const customerId = req.user!.userId;
      const trip = TripService.createTrip({
        customerId,
        ...req.body,
      });
      return sendSuccess(res, trip, 201);
    } catch (err: any) {
      return sendError(res, 'TRIP_CREATION_FAILED', err.message);
    }
  }

  public static updateStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const { tripId } = req.params;
      const { status } = req.body;
      const driverId = req.user?.userId;
      const updated = TripService.updateTripStatus(tripId, status, driverId);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'STATUS_UPDATE_FAILED', err.message);
    }
  }

  public static rateTrip(req: AuthenticatedRequest, res: Response) {
    try {
      const { tripId } = req.params;
      const { rating, tipUGX, compliments } = req.body;
      const result = TripService.rateTrip(tripId, Number(rating || 5), Number(tipUGX || 0), compliments || []);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'RATING_FAILED', err.message);
    }
  }

  public static getTrip(req: Request, res: Response) {
    try {
      const { tripId } = req.params;
      const trip = TripService.getTrip(tripId);
      return sendSuccess(res, trip);
    } catch (err: any) {
      return sendError(res, 'TRIP_NOT_FOUND', err.message, 404);
    }
  }

  public static getUserTrips(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const trips = TripService.getUserTrips(userId);
      return sendSuccess(res, trips);
    } catch (err: any) {
      return sendError(res, 'FETCH_TRIPS_FAILED', err.message);
    }
  }
}
