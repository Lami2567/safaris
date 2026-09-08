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

  // -----------------------------------------------------------
  // Admin CRUD for Destinations
  // -----------------------------------------------------------
  public static createDestination(data: any) {
    const id = data.id || `dest_${uuidv4().substring(0, 8)}`;
    const destination = {
      id,
      title: data.title || 'New Destination',
      subtitle: data.subtitle || '',
      region: data.region || 'Uganda',
      description: data.description || '',
      highlights: Array.isArray(data.highlights) ? data.highlights : (data.highlights ? data.highlights.split(',').map((h: string) => h.trim()) : []),
      best_time_to_visit: data.best_time_to_visit || data.bestTimeToVisit || 'Year-round',
      distance_hours_from_kampala: Number(data.distance_hours_from_kampala || data.distanceHoursFromKampala || 4),
      hero_tag: data.hero_tag || data.heroTag || 'EXPEDITION',
      image_placeholder: data.image_placeholder || data.imageUrl || '',
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localStore.destinations.set(id, destination);
    return destination;
  }

  public static updateDestination(id: string, data: any) {
    const existing = localStore.destinations.get(id);
    if (!existing) throw new Error('Destination not found.');

    const updated = {
      ...existing,
      ...data,
      highlights: data.highlights !== undefined
        ? (Array.isArray(data.highlights) ? data.highlights : data.highlights.split(',').map((h: string) => h.trim()))
        : existing.highlights,
      updated_at: new Date().toISOString(),
    };

    localStore.destinations.set(id, updated);
    return updated;
  }

  public static deleteDestination(id: string) {
    if (!localStore.destinations.has(id)) throw new Error('Destination not found.');
    localStore.destinations.delete(id);
    // Also remove associated packages
    for (const [pkgId, pkg] of localStore.tour_packages.entries()) {
      if (pkg.destination_id === id) {
        localStore.tour_packages.delete(pkgId);
      }
    }
    return { success: true, id };
  }

  // -----------------------------------------------------------
  // Admin CRUD for Tour Packages
  // -----------------------------------------------------------
  public static createPackage(data: any) {
    const id = data.id || `pkg_${uuidv4().substring(0, 8)}`;
    const pkg = {
      id,
      destination_id: data.destination_id || data.destinationId || '',
      title: data.title || 'New Tour Package',
      duration_days: Number(data.duration_days || data.durationDays || 1),
      price_per_person_ugx: Number(data.price_per_person_ugx || data.pricePerPersonUgx || 100000),
      group_type: data.group_type || data.groupType || 'Daily Group',
      inclusions: Array.isArray(data.inclusions) ? data.inclusions : (data.inclusions ? data.inclusions.split(',').map((i: string) => i.trim()) : []),
      itinerary_summary: Array.isArray(data.itinerary_summary) ? data.itinerary_summary : (data.itinerary_summary ? data.itinerary_summary.split('\n').map((s: string) => s.trim()) : []),
      image_placeholder: data.image_placeholder || data.imageUrl || '',
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localStore.tour_packages.set(id, pkg);
    return pkg;
  }

  public static updatePackage(id: string, data: any) {
    const existing = localStore.tour_packages.get(id);
    if (!existing) throw new Error('Tour package not found.');

    const updated = {
      ...existing,
      ...data,
      price_per_person_ugx: data.price_per_person_ugx !== undefined ? Number(data.price_per_person_ugx) : existing.price_per_person_ugx,
      duration_days: data.duration_days !== undefined ? Number(data.duration_days) : existing.duration_days,
      inclusions: data.inclusions !== undefined
        ? (Array.isArray(data.inclusions) ? data.inclusions : data.inclusions.split(',').map((i: string) => i.trim()))
        : existing.inclusions,
      itinerary_summary: data.itinerary_summary !== undefined
        ? (Array.isArray(data.itinerary_summary) ? data.itinerary_summary : data.itinerary_summary.split('\n').map((s: string) => s.trim()))
        : existing.itinerary_summary,
      updated_at: new Date().toISOString(),
    };

    localStore.tour_packages.set(id, updated);
    return updated;
  }

  public static deletePackage(id: string) {
    if (!localStore.tour_packages.has(id)) throw new Error('Tour package not found.');
    localStore.tour_packages.delete(id);
    return { success: true, id };
  }

  // -----------------------------------------------------------
  // Admin Bookings Management
  // -----------------------------------------------------------
  public static getAllBookings() {
    return Array.from(localStore.tour_bookings.values()).map((b: any) => {
      const dest = b.destination_id ? localStore.destinations.get(b.destination_id) : null;
      const pkg = b.package_id ? localStore.tour_packages.get(b.package_id) : null;
      const guide = b.tour_guide_id ? localStore.tour_guides.get(b.tour_guide_id) : null;
      const customer = b.customer_id ? localStore.users.get(b.customer_id) : null;
      return {
        ...b,
        destination_title: dest?.title || 'Uganda Safari',
        package_title: pkg?.title || 'Custom Tour',
        guide_name: guide?.full_name || 'Assigned Guide',
        customer_name: customer?.full_name || 'Guest Explorer',
        customer_phone: customer?.phone || '+256 700 000000',
      };
    });
  }

  public static updateBookingStatus(bookingId: string, status: string) {
    const booking = localStore.tour_bookings.get(bookingId);
    if (!booking) throw new Error('Tour booking not found.');
    booking.booking_status = status;
    booking.updated_at = new Date().toISOString();
    return booking;
  }
}
