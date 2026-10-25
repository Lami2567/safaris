import { Request, Response } from 'express';
import { TourismService } from './tourism.service';
import { sendSuccess, sendError } from '../../shared/response';

export class TourismController {
  public static getAllDestinations(req: Request, res: Response) {
    try {
      const includeDrafts = req.query.includeDrafts === 'true';
      const category = req.query.category as string | undefined;
      const destinations = TourismService.getAllDestinations({ includeDrafts, category });
      return sendSuccess(res, destinations);
    } catch (err: any) {
      return sendError(res, 'FETCH_DESTINATIONS_FAILED', err.message, 500);
    }
  }

  public static getDestinationById(req: Request, res: Response) {
    try {
      const dest = TourismService.getDestinationById(req.params.id);
      return sendSuccess(res, dest);
    } catch (err: any) {
      return sendError(res, 'DESTINATION_NOT_FOUND', err.message, 404);
    }
  }

  public static getAllPackages(req: Request, res: Response) {
    try {
      const destinationId = req.query.destinationId as string;
      const includeDrafts = req.query.includeDrafts === 'true';
      const packages = destinationId
        ? TourismService.getPackagesByDestination(destinationId, { includeDrafts })
        : TourismService.getAllPackages({ includeDrafts });
      return sendSuccess(res, packages);
    } catch (err: any) {
      return sendError(res, 'FETCH_PACKAGES_FAILED', err.message, 500);
    }
  }

  public static getPackageById(req: Request, res: Response) {
    try {
      const pkg = TourismService.getPackageById(req.params.id);
      return sendSuccess(res, pkg);
    } catch (err: any) {
      return sendError(res, 'PACKAGE_NOT_FOUND', err.message, 404);
    }
  }

  public static async createBooking(req: Request, res: Response) {
    try {
      const customerId = (req as any).user?.userId || req.body.customerId;
      const booking = await TourismService.createBooking({
        ...req.body,
        customerId,
      });
      return sendSuccess(res, booking, 201);
    } catch (err: any) {
      return sendError(res, 'BOOKING_CREATION_FAILED', err.message, 400);
    }
  }

  public static getUserBookings(req: Request, res: Response) {
    try {
      const customerId = (req as any).user?.userId || (req.query.customerId as string);
      const bookings = TourismService.getUserBookings(customerId);
      return sendSuccess(res, bookings);
    } catch (err: any) {
      return sendError(res, 'FETCH_BOOKINGS_FAILED', err.message, 500);
    }
  }

  public static getBookingById(req: Request, res: Response) {
    try {
      const callerId = (req as any).user?.userId;
      const callerRole = (req as any).user?.role;
      if (!callerId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }
      const booking = TourismService.getBookingById(req.params.id);
      if (
        callerRole !== 'admin' &&
        booking.customer_id !== callerId &&
        booking.tour_guide_id !== callerId &&
        booking.guide_id !== callerId
      ) {
        return sendError(res, 'FORBIDDEN', 'Access denied to this booking record.', 403);
      }
      return sendSuccess(res, booking);
    } catch (err: any) {
      return sendError(res, 'BOOKING_NOT_FOUND', err.message, 404);
    }
  }

  // -----------------------------------------------------------
  // Admin Endpoints
  // -----------------------------------------------------------
  public static async createDestination(req: Request, res: Response) {
    try {
      const destination = await TourismService.createDestination(req.body);
      return sendSuccess(res, destination, 201);
    } catch (err: any) {
      return sendError(res, 'CREATE_DESTINATION_FAILED', err.message, 400);
    }
  }

  public static async updateDestination(req: Request, res: Response) {
    try {
      const destination = await TourismService.updateDestination(req.params.id, req.body);
      return sendSuccess(res, destination);
    } catch (err: any) {
      return sendError(res, 'UPDATE_DESTINATION_FAILED', err.message, 400);
    }
  }

  public static async duplicateDestination(req: Request, res: Response) {
    try {
      const destination = await TourismService.duplicateDestination(req.params.id);
      return sendSuccess(res, destination, 201);
    } catch (err: any) {
      return sendError(res, 'DUPLICATE_DESTINATION_FAILED', err.message, 400);
    }
  }

  public static async deleteDestination(req: Request, res: Response) {
    try {
      const result = await TourismService.deleteDestination(req.params.id);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'DELETE_DESTINATION_FAILED', err.message, 400);
    }
  }

  public static async createPackage(req: Request, res: Response) {
    try {
      const pkg = await TourismService.createPackage(req.body);
      return sendSuccess(res, pkg, 201);
    } catch (err: any) {
      return sendError(res, 'CREATE_PACKAGE_FAILED', err.message, 400);
    }
  }

  public static async updatePackage(req: Request, res: Response) {
    try {
      const pkg = await TourismService.updatePackage(req.params.id, req.body);
      return sendSuccess(res, pkg);
    } catch (err: any) {
      return sendError(res, 'UPDATE_PACKAGE_FAILED', err.message, 400);
    }
  }

  public static async duplicatePackage(req: Request, res: Response) {
    try {
      const pkg = await TourismService.duplicatePackage(req.params.id);
      return sendSuccess(res, pkg, 201);
    } catch (err: any) {
      return sendError(res, 'DUPLICATE_PACKAGE_FAILED', err.message, 400);
    }
  }

  public static async deletePackage(req: Request, res: Response) {
    try {
      const result = await TourismService.deletePackage(req.params.id);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'DELETE_PACKAGE_FAILED', err.message, 400);
    }
  }

  public static getAllBookings(req: Request, res: Response) {
    try {
      const callerId = (req as any).user?.userId;
      const callerRole = (req as any).user?.role;
      if (!callerId) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }
      if (callerRole === 'admin') {
        const bookings = TourismService.getAllBookings();
        return sendSuccess(res, bookings);
      }
      if (callerRole === 'tour_guide') {
        const bookings = TourismService.getUserBookings(callerId);
        return sendSuccess(res, bookings);
      }
      return sendError(res, 'FORBIDDEN', 'Access restricted to administrators or assigned guides.', 403);
    } catch (err: any) {
      return sendError(res, 'FETCH_ALL_BOOKINGS_FAILED', err.message, 500);
    }
  }

  public static assignGuide(req: Request, res: Response) {
    try {
      const guideId = req.body.guideId || req.body.tourGuideId;
      if (!guideId) {
        return sendError(res, 'INVALID_INPUT', 'guideId is required to assign a tour guide.', 400);
      }
      const booking = TourismService.assignGuideToBooking(req.params.id, guideId);
      return sendSuccess(res, booking);
    } catch (err: any) {
      const code = err.message?.includes('Only approved') ? 403 : 400;
      return sendError(res, 'ASSIGN_GUIDE_FAILED', err.message, code);
    }
  }

  public static updateBookingStatus(req: Request, res: Response) {
    try {
      const { status } = req.body;
      const actorId = (req as any).user?.userId;
      const actorRole = (req as any).user?.role;
      const booking = TourismService.updateBookingStatus(req.params.id, status, actorId, actorRole);
      return sendSuccess(res, booking);
    } catch (err: any) {
      const code = err.message?.includes('not authorized') ? 403 : 400;
      return sendError(res, 'UPDATE_BOOKING_STATUS_FAILED', err.message, code);
    }
  }
}
