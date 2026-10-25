import { Response } from 'express';
import { AuthenticatedRequest } from '../../gateway/auth_middleware';
import { UserService } from './user.service';
import { sendSuccess, sendError } from '../../shared/response';

export class UserController {
  public static async getProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const requestedId = req.params?.id;
      const callerId = req.user!.userId;
      const callerRole = req.user!.role;

      // IDOR check: Non-admin users may ONLY access their own profile
      if (requestedId && requestedId !== 'profile' && requestedId !== 'me' && requestedId !== callerId) {
        if (callerRole !== 'admin') {
          return sendError(res, 'FORBIDDEN', 'Access denied to other user profiles.', 403);
        }
      }

      const userId = (requestedId && requestedId !== 'profile' && requestedId !== 'me')
        ? requestedId
        : callerId;

      const profile = await UserService.getProfile(userId);
      return sendSuccess(res, profile);
    } catch (err: any) {
      return sendError(res, 'USER_NOT_FOUND', err.message, 404);
    }
  }

  public static async updateProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const requestedId = req.params?.id;
      const callerId = req.user!.userId;
      const callerRole = req.user!.role;

      // IDOR check: Users may only update their own profile unless admin
      if (requestedId && requestedId !== 'profile' && requestedId !== 'me' && requestedId !== callerId) {
        if (callerRole !== 'admin') {
          return sendError(res, 'FORBIDDEN', 'Cannot modify another user profile.', 403);
        }
      }

      const targetUserId = (requestedId && requestedId !== 'profile' && requestedId !== 'me')
        ? requestedId
        : callerId;

      const updated = await UserService.updateProfile(targetUserId, req.body);
      return sendSuccess(res, updated);
    } catch (err: any) {
      const status = err.message?.includes('prohibited') || err.message?.includes('cannot be modified') ? 403 : 400;
      return sendError(res, 'UPDATE_FAILED', err.message, status);
    }
  }

  public static async topUpWallet(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { amountUGX } = req.body;
      if (!amountUGX || amountUGX <= 0) {
        return sendError(res, 'INVALID_AMOUNT', 'Please enter a valid top-up amount.');
      }
      const result = await UserService.topUpWallet(userId, Number(amountUGX));
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'TOPUP_FAILED', err.message);
    }
  }

  /**
   * Role modification: Strictly restricted to authorized administrators.
   */
  public static async switchRole(req: AuthenticatedRequest, res: Response) {
    try {
      const callerRole = req.user?.role;
      const adminId = req.user?.userId || 'unknown_admin';

      if (callerRole !== 'admin') {
        return sendError(
          res,
          'FORBIDDEN',
          'Unrestricted role switching is disabled. Customers cannot grant themselves elevated privileges.',
          403
        );
      }

      const { role, userId, targetUserId, reason } = req.body;
      const effectiveTargetId = targetUserId || userId;

      if (!effectiveTargetId) {
        return sendError(res, 'INVALID_INPUT', 'targetUserId and new role are required for administrative role assignment.', 400);
      }

      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const result = await UserService.adminChangeUserRole({
        targetUserId: effectiveTargetId,
        newRole: role,
        adminId,
        ipAddress,
        reason,
      });

      return sendSuccess(res, result);
    } catch (err: any) {
      const status = err.message?.includes('approved') ? 400 : 400;
      return sendError(res, 'ROLE_CHANGE_FAILED', err.message, status);
    }
  }

  /**
   * GET /api/v1/admin/privileged-accounts
   * Read-only report for reviewing all accounts with elevated privileges.
   */
  public static async getPrivilegedAccounts(req: AuthenticatedRequest, res: Response) {
    try {
      if (req.user?.role !== 'admin') {
        return sendError(res, 'FORBIDDEN', 'Access restricted to administrators.', 403);
      }
      const report = await UserService.getPrivilegedAccountsReport();
      return sendSuccess(res, report);
    } catch (err: any) {
      return sendError(res, 'REPORT_FAILED', err.message, 500);
    }
  }
}
