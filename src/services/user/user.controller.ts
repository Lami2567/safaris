import { Response } from 'express';
import { AuthenticatedRequest } from '../../gateway/auth_middleware';
import { UserService } from './user.service';
import { sendSuccess, sendError } from '../../shared/response';

export class UserController {
  public static getProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const profile = UserService.getProfile(userId);
      return sendSuccess(res, profile);
    } catch (err: any) {
      return sendError(res, 'USER_NOT_FOUND', err.message, 404);
    }
  }

  public static updateProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const updated = UserService.updateProfile(userId, req.body);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_FAILED', err.message);
    }
  }

  public static topUpWallet(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { amountUGX } = req.body;
      if (!amountUGX || amountUGX <= 0) {
        return sendError(res, 'INVALID_AMOUNT', 'Please enter a valid top-up amount.');
      }
      const result = UserService.topUpWallet(userId, Number(amountUGX));
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'TOPUP_FAILED', err.message);
    }
  }

  public static switchRole(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { role } = req.body;
      const result = UserService.switchRole(userId, role);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'ROLE_SWITCH_FAILED', err.message);
    }
  }
}
