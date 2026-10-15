import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../gateway/auth_middleware';
import { CareerService } from './career.service';
import { sendSuccess, sendError } from '../../shared/response';

export class CareerController {
  /**
   * Public or Careers API key protected submission endpoint
   * POST /api/v1/careers/apply
   */
  public static async apply(req: Request, res: Response) {
    try {
      const result = await CareerService.submitApplication(req.body);
      return sendSuccess(res, result, 201);
    } catch (err: any) {
      console.error('[CareerController.apply error]', err);
      return sendError(res, 'APPLICATION_FAILED', err.message || 'Failed to submit application', 400);
    }
  }

  /**
   * Admin: List recruitment applicants
   * GET /api/v1/admin/applicants
   */
  public static async getApplicants(req: AuthenticatedRequest, res: Response) {
    try {
      const { status, type } = req.query;
      const applicants = await CareerService.getApplications({
        status: status as string,
        applicant_type: type as string,
      });
      return sendSuccess(res, applicants);
    } catch (err: any) {
      console.error('[CareerController.getApplicants error]', err);
      return sendError(res, 'FETCH_APPLICANTS_FAILED', err.message || 'Failed to fetch applicants', 500);
    }
  }

  /**
   * Admin: Approve applicant
   * POST /api/v1/admin/applicants/:id/approve
   */
  public static async approveApplicant(req: AuthenticatedRequest, res: Response) {
    try {
      const adminId = req.user?.userId || 'admin_mumwe_01';
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const result = await CareerService.approveApplication(req.params.id, adminId, ip);
      return sendSuccess(res, result);
    } catch (err: any) {
      console.error('[CareerController.approveApplicant error]', err);
      return sendError(res, 'APPROVE_FAILED', err.message || 'Failed to approve applicant', 400);
    }
  }

  /**
   * Admin: Reject applicant
   * POST /api/v1/admin/applicants/:id/reject
   */
  public static async rejectApplicant(req: AuthenticatedRequest, res: Response) {
    try {
      const adminId = req.user?.userId || 'admin_mumwe_01';
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const { reason } = req.body;
      const result = await CareerService.rejectApplication(req.params.id, adminId, reason, ip);
      return sendSuccess(res, result);
    } catch (err: any) {
      console.error('[CareerController.rejectApplicant error]', err);
      return sendError(res, 'REJECT_FAILED', err.message || 'Failed to reject applicant', 400);
    }
  }

  /**
   * Admin: Suspend applicant/driver
   * POST /api/v1/admin/applicants/:id/suspend
   */
  public static async suspendApplicant(req: AuthenticatedRequest, res: Response) {
    try {
      const adminId = req.user?.userId || 'admin_mumwe_01';
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const { reason = 'Administrative suspension' } = req.body;
      const result = await CareerService.suspendAccount(req.params.id, adminId, reason, ip);
      return sendSuccess(res, result);
    } catch (err: any) {
      console.error('[CareerController.suspendApplicant error]', err);
      return sendError(res, 'SUSPEND_FAILED', err.message || 'Failed to suspend account', 400);
    }
  }

  /**
   * Candidate: Check application status
   * GET /api/v1/careers/status?query=...
   */
  public static async checkStatus(req: Request, res: Response) {
    try {
      const query = (req.query.query || req.query.id || req.query.email || req.query.phone) as string;
      const result = await CareerService.getApplicationStatus(query);
      return sendSuccess(res, result);
    } catch (err: any) {
      console.error('[CareerController.checkStatus error]', err);
      return sendError(res, 'STATUS_CHECK_FAILED', err.message || 'Application not found', 404);
    }
  }
}
