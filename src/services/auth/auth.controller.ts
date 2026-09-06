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

  public static async sendOtp(req: Request, res: Response) {
    try {
      const { phone } = req.body;
      if (!phone) {
        return sendError(res, 'VALIDATION_ERROR', 'Phone number is required.');
      }
      return sendSuccess(res, { phone, message: 'OTP sent successfully (Use 1234 for testing)' });
    } catch (err: any) {
      return sendError(res, 'OTP_SEND_FAILED', err.message);
    }
  }

  public static async verifyOtp(req: Request, res: Response) {
    try {
      const { phone, otpCode } = req.body;
      const result = await AuthService.verifyOtp(phone, otpCode);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'OTP_FAILED', err.message, 400);
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
