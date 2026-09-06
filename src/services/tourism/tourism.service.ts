import { localStore } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface CreateBookingRequest {
  customerId: string;
  destinationId?: string;
  packageId?: string;
  tourGuideId?: string;
  travelDate: string;
  guestsCount: number;
  specialRequests?: string;
  totalUgx: number;
  paymentMethod: string;
}

export class TourismService {
  public static getAllDestinations() {
    return Array.from(localStore.destinations.values());
  }

  public static getDestinationById(id: string) {
    const dest = localStore.destinations.get(id);
    if (!dest) throw new Error('Destination not found.');
    return dest;
  }

  public static getPackagesByDestination(destinationId: string) {
    const packages = Array.from(localStore.tour_packages.values()).filter(
      (p: any) => p.destination_id === destinationId
    );
    return packages;
  }

  public static getAllPackages() {
    return Array.from(localStore.tour_packages.values());
  }

  public static getPackageById(id: string) {
    const pkg = localStore.tour_packages.get(id);
    if (!pkg) throw new Error('Tour package not found.');
    return pkg;
  }

  public static createBooking(data: CreateBookingRequest) {
    const bookingId = `tb_${uuidv4().substring(0, 8)}`;
    const newBooking = {
      id: bookingId,
      customer_id: data.customerId,
      destination_id: data.destinationId || null,
      package_id: data.packageId || null,
      tour_guide_id: data.tourGuideId || null,
      booking_status: 'CONFIRMED',
      travel_date: data.travelDate,
      guests_count: data.guestsCount || 1,
      total_ugx: data.totalUgx,
      special_requests: data.specialRequests || '',
      payment_method: data.paymentMethod || 'MTN Mobile Money',
      payment_status: 'PAID',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localStore.tour_bookings.set(bookingId, newBooking);

    // If a guide is attached, register booking to guide's expeditions
    if (data.tourGuideId) {
      const guide = localStore.tour_guides.get(data.tourGuideId);
      if (guide) {
        guide.total_expeditions = (guide.total_expeditions || 0) + 1;
      }
    }

    return newBooking;
  }

  public static getUserBookings(customerId: string) {
    return Array.from(localStore.tour_bookings.values()).filter(
      (b: any) => b.customer_id === customerId
    );
  }

  public static getBookingById(bookingId: string) {
    const booking = localStore.tour_bookings.get(bookingId);
    if (!booking) throw new Error('Tour booking not found.');
    
    // Attach hydrated details
    const dest = booking.destination_id ? localStore.destinations.get(booking.destination_id) : null;
    const pkg = booking.package_id ? localStore.tour_packages.get(booking.package_id) : null;
    const guide = booking.tour_guide_id ? localStore.tour_guides.get(booking.tour_guide_id) : null;

    return {
      ...booking,
      destination: dest,
      package: pkg,
      guide: guide,
    };
  }
}
