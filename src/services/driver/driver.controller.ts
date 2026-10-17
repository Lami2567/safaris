import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../gateway/auth_middleware';
import { DriverService } from './driver.service';
import { sendSuccess, sendError } from '../../shared/response';

export class DriverController {
  public static setAvailability(req: AuthenticatedRequest, res: Response) {
    try {
      const driverId = req.user!.userId;
      const { isOnline } = req.body;
      const result = DriverService.setAvailability(driverId, Boolean(isOnline));
      return sendSuccess(res, result);
    } catch (err: any) {
      const status = err.message?.includes('not approved') || err.message?.includes('pending') ? 403 : 400;
      return sendError(res, 'AVAILABILITY_UPDATE_FAILED', err.message, status);
    }
  }

  public static updateLocation(req: AuthenticatedRequest, res: Response) {
    try {
      const driverId = req.user!.userId;
      const { lat, lng, heading, speed, accuracy, batteryLevel } = req.body;
      const result = DriverService.updateLocation(
        driverId,
        Number(lat),
        Number(lng),
        Number(heading || 0),
        Number(speed || 0),
        Number(accuracy || 5),
        batteryLevel !== undefined ? Number(batteryLevel) : undefined
      );
      return sendSuccess(res, result);
    } catch (err: any) {
      const status = err.message?.includes('not approved') ? 403 : 400;
      return sendError(res, 'LOCATION_UPDATE_FAILED', err.message, status);
    }
  }

  public static async getNearby(req: Request, res: Response) {
    try {
      const lat = req.query.lat ? Number(req.query.lat) : 0.3136;
      const lng = req.query.lng ? Number(req.query.lng) : 32.5811;
      const radiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : 10;
      const drivers = await DriverService.getNearbyDrivers(lat, lng, radiusKm);
      return sendSuccess(res, drivers);
    } catch (err: any) {
      return sendError(res, 'FETCH_NEARBY_FAILED', err.message);
    }
  }

  public static getDashboard(req: AuthenticatedRequest, res: Response) {
    try {
      const driverId = req.user!.userId;
      const dashboard = DriverService.getDriverDashboard(driverId);
      return sendSuccess(res, dashboard);
    } catch (err: any) {
      return sendError(res, 'DASHBOARD_FAILED', err.message);
    }
  }

  public static cashOut(req: AuthenticatedRequest, res: Response) {
    try {
      const driverId = req.user!.userId;
      const result = DriverService.cashOut(driverId);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'CASHOUT_FAILED', err.message);
    }
  }
}
