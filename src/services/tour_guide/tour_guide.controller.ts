import { Request, Response } from 'express';
import { TourGuideService } from './tour_guide.service';
import { sendSuccess, sendError } from '../../shared/response';

export class TourGuideController {
  public static getAllGuides(req: Request, res: Response) {
    try {
      const specialization = req.query.specialization as string;
      const guides = TourGuideService.getAllGuides(specialization);
      return sendSuccess(res, guides);
    } catch (err: any) {
      return sendError(res, 'FETCH_GUIDES_FAILED', err.message, 500);
    }
  }

  public static getGuideById(req: Request, res: Response) {
    try {
      const guide = TourGuideService.getGuideById(req.params.id);
      return sendSuccess(res, guide);
    } catch (err: any) {
      return sendError(res, 'GUIDE_NOT_FOUND', err.message, 404);
    }
  }

  public static getDashboard(req: Request, res: Response) {
    try {
      const guideId = (req as any).user?.userId || (req.query.guideId as string);
      if (!guideId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required for guide dashboard.', 401);
      }
      const dashboard = TourGuideService.getGuideDashboard(guideId);
      return sendSuccess(res, dashboard);
    } catch (err: any) {
      return sendError(res, 'GUIDE_DASHBOARD_FAILED', err.message, 400);
    }
  }

  public static toggleAvailability(req: Request, res: Response) {
    try {
      const guideId = (req as any).user?.userId || req.params.id;
      const isAvailable = req.body.isAvailable !== undefined ? req.body.isAvailable : req.body.isOnline;
      const updated = TourGuideService.toggleAvailability(guideId, Boolean(isAvailable));
      return sendSuccess(res, updated);
    } catch (err: any) {
      const status = err.message?.includes('not approved') || err.message?.includes('pending') ? 403 : 400;
      return sendError(res, 'TOGGLE_AVAILABILITY_FAILED', err.message, status);
    }
  }

  public static createGuide(req: Request, res: Response) {
    try {
      const guide = TourGuideService.createGuide(req.body);
      return sendSuccess(res, guide, 201);
    } catch (err: any) {
      return sendError(res, 'CREATE_GUIDE_FAILED', err.message, 400);
    }
  }

  public static updateGuide(req: Request, res: Response) {
    try {
      const guide = TourGuideService.updateGuide(req.params.id, req.body);
      return sendSuccess(res, guide);
    } catch (err: any) {
      return sendError(res, 'UPDATE_GUIDE_FAILED', err.message, 400);
    }
  }

  public static deleteGuide(req: Request, res: Response) {
    try {
      const result = TourGuideService.deleteGuide(req.params.id);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'DELETE_GUIDE_FAILED', err.message, 400);
    }
  }
}
