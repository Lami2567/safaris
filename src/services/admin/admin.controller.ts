import { Request, Response } from 'express';
import { AdminService } from './admin.service';
import { sendSuccess, sendError } from '../../shared/response';

export class AdminController {
  public static getStats(req: Request, res: Response) {
    try {
      const stats = AdminService.getDashboardStats();
      return sendSuccess(res, stats);
    } catch (err: any) {
      return sendError(res, 'FETCH_STATS_FAILED', err.message, 500);
    }
  }

  public static getPricing(req: Request, res: Response) {
    try {
      const pricing = AdminService.getPricing();
      return sendSuccess(res, pricing);
    } catch (err: any) {
      return sendError(res, 'FETCH_PRICING_FAILED', err.message, 500);
    }
  }

  public static updatePricing(req: Request, res: Response) {
    try {
      const updated = AdminService.updatePricing(req.body);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_PRICING_FAILED', err.message, 400);
    }
  }

  public static getAllTrips(req: Request, res: Response) {
    try {
      const trips = AdminService.getAllTrips();
      return sendSuccess(res, trips);
    } catch (err: any) {
      return sendError(res, 'FETCH_TRIPS_FAILED', err.message, 500);
    }
  }

  public static getAllDeliveries(req: Request, res: Response) {
    try {
      const deliveries = AdminService.getAllDeliveries();
      return sendSuccess(res, deliveries);
    } catch (err: any) {
      return sendError(res, 'FETCH_DELIVERIES_FAILED', err.message, 500);
    }
  }

  public static getDriversFleet(req: Request, res: Response) {
    try {
      const fleet = AdminService.getDriversFleet();
      return sendSuccess(res, fleet);
    } catch (err: any) {
      return sendError(res, 'FETCH_FLEET_FAILED', err.message, 500);
    }
  }

  public static getAllUsers(req: Request, res: Response) {
    try {
      const users = AdminService.getAllUsers();
      return sendSuccess(res, users);
    } catch (err: any) {
      return sendError(res, 'FETCH_USERS_FAILED', err.message, 500);
    }
  }
}
