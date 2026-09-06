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
}
