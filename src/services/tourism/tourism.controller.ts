import { Request, Response } from 'express';
import { TourismService } from './tourism.service';
import { sendSuccess, sendError } from '../../shared/response';

export class TourismController {
  public static getAllDestinations(req: Request, res: Response) {
    try {
      const destinations = TourismService.getAllDestinations();
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
      const packages = destinationId
        ? TourismService.getPackagesByDestination(destinationId)
        : TourismService.getAllPackages();
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

  public static createBooking(req: Request, res: Response) {
    try {
      const customerId = (req as any).user?.userId || req.body.customerId;
      const booking = TourismService.createBooking({
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
      const booking = TourismService.getBookingById(req.params.id);
      return sendSuccess(res, booking);
    } catch (err: any) {
      return sendError(res, 'BOOKING_NOT_FOUND', err.message, 404);
    }
  }

  // -----------------------------------------------------------
  // Admin Endpoints
  // -----------------------------------------------------------
  public static createDestination(req: Request, res: Response) {
    try {
      const destination = TourismService.createDestination(req.body);
      return sendSuccess(res, destination, 201);
    } catch (err: any) {
      return sendError(res, 'CREATE_DESTINATION_FAILED', err.message, 400);
    }
  }

  public static updateDestination(req: Request, res: Response) {
    try {
      const destination = TourismService.updateDestination(req.params.id, req.body);
      return sendSuccess(res, destination);
    } catch (err: any) {
      return sendError(res, 'UPDATE_DESTINATION_FAILED', err.message, 400);
    }
  }

  public static deleteDestination(req: Request, res: Response) {
    try {
      const result = TourismService.deleteDestination(req.params.id);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'DELETE_DESTINATION_FAILED', err.message, 400);
    }
  }

  public static createPackage(req: Request, res: Response) {
    try {
      const pkg = TourismService.createPackage(req.body);
      return sendSuccess(res, pkg, 201);
    } catch (err: any) {
      return sendError(res, 'CREATE_PACKAGE_FAILED', err.message, 400);
    }
  }

  public static updatePackage(req: Request, res: Response) {
    try {
      const pkg = TourismService.updatePackage(req.params.id, req.body);
      return sendSuccess(res, pkg);
    } catch (err: any) {
      return sendError(res, 'UPDATE_PACKAGE_FAILED', err.message, 400);
    }
  }

  public static deletePackage(req: Request, res: Response) {
    try {
      const result = TourismService.deletePackage(req.params.id);
      return sendSuccess(res, result);
    } catch (err: any) {
      return sendError(res, 'DELETE_PACKAGE_FAILED', err.message, 400);
    }
  }

  public static getAllBookings(req: Request, res: Response) {
    try {
      const bookings = TourismService.getAllBookings();
      return sendSuccess(res, bookings);
    } catch (err: any) {
      return sendError(res, 'FETCH_ALL_BOOKINGS_FAILED', err.message, 500);
    }
  }

  public static updateBookingStatus(req: Request, res: Response) {
    try {
      const { status } = req.body;
      const booking = TourismService.updateBookingStatus(req.params.id, status);
      return sendSuccess(res, booking);
    } catch (err: any) {
      return sendError(res, 'UPDATE_BOOKING_STATUS_FAILED', err.message, 400);
    }
  }
}
