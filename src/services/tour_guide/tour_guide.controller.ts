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

  public static toggleAvailability(req: Request, res: Response) {
    try {
      const guideId = (req as any).user?.userId || req.params.id;
      const { isAvailable } = req.body;
      const updated = TourGuideService.toggleAvailability(guideId, Boolean(isAvailable));
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'TOGGLE_AVAILABILITY_FAILED', err.message, 400);
    }
  }
}
