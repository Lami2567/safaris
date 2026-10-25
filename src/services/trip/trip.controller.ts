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
      const {
        pickupTitle,
        pickupAddress,
        pickupLat,
        pickupLng,
        destTitle,
        destAddress,
        destLat,
        destLng,
        vehicleTier,
        vehicleId,
        serviceType,
        quotationId,
        routeCode,
        distanceKm,
        paymentMethod,
      } = req.body || {};

      const trip = TripService.createTrip({
        customerId,
        pickupTitle: String(pickupTitle || 'Kampala Pickup'),
        pickupAddress: String(pickupAddress || pickupTitle || 'Kampala'),
        pickupLat: Number(pickupLat ?? 0.3136),
        pickupLng: Number(pickupLng ?? 32.5811),
        destTitle: String(destTitle || 'Entebbe Destination'),
        destAddress: String(destAddress || destTitle || 'Entebbe'),
        destLat: Number(destLat ?? 0.0424),
        destLng: Number(destLng ?? 32.4435),
        vehicleTier: String(vehicleTier || 'go'),
        vehicleId: vehicleId ? String(vehicleId) : undefined,
        serviceType: serviceType === 'AIRPORT_SHUTTLE' ? 'AIRPORT_SHUTTLE' : 'RIDE',
        quotationId: quotationId ? String(quotationId) : undefined,
        routeCode: routeCode ? String(routeCode) : undefined,
        distanceKm: distanceKm ? Number(distanceKm) : 0,
        paymentMethod: String(paymentMethod || 'CASH'),
      });
      return sendSuccess(res, trip, 201);
    } catch (err: any) {
      return sendError(res, 'TRIP_CREATION_FAILED', err.message, 400);
    }
  }

  public static updateStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const { tripId } = req.params;
      const { status } = req.body;
      const actorId = req.user?.userId;
      const actorRole = req.user?.role;
      const updated = TripService.updateTripStatus(tripId, status, actorId, actorRole);
      return sendSuccess(res, updated);
    } catch (err: any) {
      const code = err.message?.includes('not authorized') ? 403 : 400;
      return sendError(res, 'STATUS_UPDATE_FAILED', err.message, code);
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

  public static getTrip(req: AuthenticatedRequest, res: Response) {
    try {
      const { tripId } = req.params;
      const callerId = req.user?.userId;
      const callerRole = req.user?.role;

      if (!callerId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }

      const trip = TripService.getTrip(tripId);

      // Ownership authorization
      if (callerRole !== 'admin' && trip.customer_id !== callerId && trip.driver_id !== callerId) {
        return sendError(res, 'FORBIDDEN', 'Access denied to this trip record.', 403);
      }

      return sendSuccess(res, trip);
    } catch (err: any) {
      return sendError(res, 'TRIP_NOT_FOUND', err.message, 404);
    }
  }

  public static acceptTrip(req: AuthenticatedRequest, res: Response) {
    try {
      const { tripId } = req.params;
      const driverId = req.user!.userId;
      const result = TripService.acceptTrip(tripId, driverId);
      return sendSuccess(res, result);
    } catch (err: any) {
      const code = err.message?.includes('no longer searching') || err.message?.includes('already have an active trip')
        ? 409
        : err.message?.includes('must be approved')
          ? 403
          : 400;
      return sendError(res, 'ACCEPT_FAILED', err.message, code);
    }
  }

  public static rejectTrip(req: AuthenticatedRequest, res: Response) {
    try {
      const { tripId } = req.params;
      const driverId = req.user!.userId;
      const result = TripService.rejectTrip(tripId, driverId);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'REJECT_FAILED', err.message, 400);
    }
  }

  public static updateLocation(req: AuthenticatedRequest, res: Response) {
    try {
      const { tripId } = req.params;
      const { lat, lng, heading } = req.body;
      const driverId = req.user?.userId;
      const result = TripService.updateDriverLocation(
        tripId,
        Number(lat),
        Number(lng),
        heading !== undefined ? Number(heading) : undefined,
        driverId
      );
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'LOCATION_UPDATE_FAILED', err.message, 400);
    }
  }

  public static getActiveTrip(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const active = TripService.getActiveTrip(userId);
      return sendSuccess(res, active);
    } catch (err: any) {
      return sendError(res, 'FETCH_ACTIVE_TRIP_FAILED', err.message, 500);
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
