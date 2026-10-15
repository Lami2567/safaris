import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { sendSuccess, sendError } from '../../shared/response';

export class AuthController {
  public static async register(req: Request, res: Response) {
    try {
      const { fullName, phone, email, password, role } = req.body;
      if (!fullName || !phone || !email || !password) {
        return sendError(res, 'VALIDATION_ERROR', 'All registration fields are required.');
      }

      const result = await AuthService.register({ fullName, phone, email, password, role });
      return sendSuccess(res, result, 201);
    } catch (err: any) {
      return sendError(res, 'REGISTER_FAILED', err.message);
    }
  }

  public static async login(req: Request, res: Response) {
    try {
      const { identifier, password } = req.body;
      if (!identifier || !password) {
        return sendError(res, 'VALIDATION_ERROR', 'Phone/email and password are required.');
      }

      const result = await AuthService.login(identifier, password);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'AUTH_FAILED', err.message, 401);
    }
  }

  public static async verifyEmailOtp(req: Request, res: Response) {
    try {
      const { email, otpCode } = req.body;
      if (!email || !otpCode) {
        return sendError(res, 'VALIDATION_ERROR', 'Email and 6-digit OTP code are required.');
      }
      const result = await AuthService.verifyEmailOtp(email, otpCode);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'OTP_FAILED', err.message, 400);
    }
  }

  public static async resendEmailOtp(req: Request, res: Response) {
    try {
      const { email } = req.body;
      if (!email) {
        return sendError(res, 'VALIDATION_ERROR', 'Email is required.');
      }
      const result = await AuthService.resendEmailOtp(email);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'OTP_RESEND_FAILED', err.message, 400);
    }
  }

  public static me(req: any, res: Response) {
    try {
      const user = req.user;
      return sendSuccess(res, user);
    } catch (err: any) {
      return sendError(res, 'ME_FAILED', err.message, 500);
    }
  }
}
