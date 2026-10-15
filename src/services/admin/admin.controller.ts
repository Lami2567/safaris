import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../gateway/auth_middleware';
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

  public static async updatePricing(req: Request, res: Response) {
    try {
      const updated = await AdminService.updatePricing(req.body);
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

  public static async changePassword(req: AuthenticatedRequest, res: Response) {
    try {
      const adminId = req.user?.userId || 'usr_adm_001';
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const { currentPassword, newPassword } = req.body;
      const result = await AdminService.changePassword(adminId, currentPassword, newPassword, ip);
      return sendSuccess(res, result);
    } catch (err: any) {
      console.error('[AdminController.changePassword error]', err);
      return sendError(res, 'PASSWORD_CHANGE_FAILED', err.message || 'Failed to update password', 400);
    }
  }
}
