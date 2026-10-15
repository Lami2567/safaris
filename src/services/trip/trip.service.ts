import { v4 as uuidv4 } from 'uuid';
import { localStore } from '../../config/database';
import { emitToUser, emitToRoom } from '../../realtime/socket_server';
import { NotificationService } from '../notification/notification.service';
import { AdminService } from '../admin/admin.service';

export interface EstimateRequest {
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  distanceKm?: number;
}

export interface CreateTripRequest {
  customerId: string;
  pickupTitle: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  destTitle: string;
  destAddress: string;
  destLat: number;
  destLng: number;
  vehicleTier: string;
  distanceKm: number;
  paymentMethod: string;
}

export class TripService {
  public static getTierPricing(): Record<string, { base: number; perKm: number }> {
    const adminPricing = AdminService.getPricing();
    return {
      boda: { base: adminPricing.boda.baseFare, perKm: adminPricing.boda.perKm },
      go: { base: adminPricing.go.baseFare, perKm: adminPricing.go.perKm },
      comfort: { base: adminPricing.comfort.baseFare, perKm: adminPricing.comfort.perKm },
      safari4x4: { base: adminPricing.safari4x4.baseFare, perKm: adminPricing.safari4x4.perKm },
      tour_van: { base: adminPricing.tour_van.baseFare, perKm: adminPricing.tour_van.perKm },
    };
  }

  public static estimateFare(distanceKm: number) {
    const estimates: Record<string, number> = {};
    const pricing = this.getTierPricing();
    for (const [tier, rates] of Object.entries(pricing)) {
      estimates[tier] = rates.base + distanceKm * rates.perKm;
    }
    return estimates;
  }

  public static createTrip(data: CreateTripRequest) {
    const tripId = `trp_${uuidv4().substring(0, 8)}`;
    const pricingMap = this.getTierPricing();
    const pricing = pricingMap[data.vehicleTier] || pricingMap.go;
    const fareUGX = pricing.base + data.distanceKm * pricing.perKm;

    const newTrip = {
      id: tripId,
      customer_id: data.customerId,
      driver_id: null,
      pickup_title: data.pickupTitle,
      pickup_address: data.pickupAddress,
      pickup_lat: data.pickupLat,
      pickup_lng: data.pickupLng,
      dest_title: data.destTitle,
      dest_address: data.destAddress,
      dest_lat: data.destLat,
      dest_lng: data.destLng,
      vehicle_tier: data.vehicleTier,
      status: 'SEARCHING',
      distance_km: data.distanceKm,
      estimated_duration_mins: Math.max(5, Math.round(data.distanceKm * 2.2)),
      fare_ugx: fareUGX,
      tip_ugx: 0,
      payment_method: data.paymentMethod || 'MTN Mobile Money',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localStore.trips.set(tripId, newTrip);

    // Broadcast request to all online, available, approved drivers so a real driver can accept
    for (const d of localStore.drivers.values()) {
      if (d.is_online && d.is_available && d.is_approved && d.approval_status === 'APPROVED') {
        emitToUser(d.id, 'trip:incoming_request', {
          tripId,
          trip: newTrip,
        });
      }
    }

    return newTrip;
  }

  /**
   * Called when a real driver accepts an incoming trip.
   */
  public static acceptTrip(tripId: string, driverId: string) {
    const trip = localStore.trips.get(tripId);
    if (!trip) throw new Error('Trip not found.');
    if (trip.status !== 'SEARCHING') throw new Error(`Trip is no longer searching (status: ${trip.status}).`);

    const driver = localStore.drivers.get(driverId);
    if (!driver) throw new Error('Driver profile not found.');
    if (!driver.is_approved || driver.approval_status !== 'APPROVED') {
      throw new Error('Driver must be approved by Mumwe Safaris administrators before accepting trips.');
    }

    trip.driver_id = driverId;
    trip.status = 'DRIVER_ASSIGNED';
    trip.updated_at = new Date().toISOString();
    driver.is_available = false;

    const driverUser = localStore.users.get(driverId);
    const vehicle = driver.vehicle_id ? localStore.vehicles.get(driver.vehicle_id) : null;

    const driverDetails = {
      driverId,
      fullName: driverUser ? driverUser.full_name : 'Driver',
      phone: driverUser ? driverUser.phone : '',
      rating: driverUser ? driverUser.rating : 5.0,
      vehicleModel: vehicle ? `${vehicle.make} ${vehicle.model}` : 'Vehicle',
      licensePlate: vehicle ? vehicle.registration_plate : '',
      vehicleColor: vehicle ? vehicle.color : '',
    };

    // Broadcast real-time assignment via WebSockets to customer
    emitToUser(trip.customer_id, 'trip:driver_assigned', {
      tripId,
      driver: driverDetails,
      status: 'DRIVER_ASSIGNED',
    });

    emitToRoom(`trip:${tripId}`, 'trip:status_change', {
      tripId,
      status: 'DRIVER_ASSIGNED',
    });

    NotificationService.createNotification({
      userId: trip.customer_id,
      title: 'Driver Assigned',
      message: `${driverDetails.fullName} in ${driverDetails.vehicleModel} (${driverDetails.licensePlate}) accepted your trip and is on the way.`,
      type: 'DRIVER',
      metadata: {
        tripId,
        driverId,
        driverName: driverDetails.fullName,
        licensePlate: driverDetails.licensePlate,
        vehicleModel: driverDetails.vehicleModel,
      },
    }).catch((err) => console.error('[TripDriverNotification Error]', err));

    return { trip, driver: driverDetails };
  }

  /**
   * Receives real telemetry updates from an assigned driver and transmits to customer.
   */
  public static updateDriverLocation(tripId: string, lat: number, lng: number, heading?: number) {
    const trip = localStore.trips.get(tripId);
    if (!trip) throw new Error('Trip not found.');

    // Broadcast to customer and trip room
    emitToRoom(`trip:${tripId}`, 'trip:driver_location', {
      tripId,
      lat,
      lng,
      heading: heading || 0,
      timestamp: Date.now(),
    });

    if (trip.customer_id) {
      emitToUser(trip.customer_id, 'trip:driver_location', {
        tripId,
        lat,
        lng,
        heading: heading || 0,
        timestamp: Date.now(),
      });
    }

    return { tripId, lat, lng };
  }

  /**
   * Retrieves active, non-completed trip for a customer or driver (for app restoration)
   */
  public static getActiveTrip(userId: string) {
    for (const trip of localStore.trips.values()) {
      if (
        (trip.customer_id === userId || trip.driver_id === userId) &&
        !['TRIP_COMPLETED', 'CANCELLED'].includes(trip.status)
      ) {
        return this.getTrip(trip.id);
      }
    }
    return null;
  }


  public static updateTripStatus(tripId: string, status: string, driverId?: string) {
    const trip = localStore.trips.get(tripId);
    if (!trip) {
      throw new Error('Trip not found.');
    }

    trip.status = status;
    trip.updated_at = new Date().toISOString();

    if (status === 'TRIP_COMPLETED') {
      const driver = localStore.drivers.get(trip.driver_id);
      if (driver) {
        driver.today_earnings_ugx += trip.fare_ugx;
        driver.is_available = true;
      }
      const customer = localStore.users.get(trip.customer_id);
      if (customer) {
        customer.total_trips += 1;
      }
    }

    // Emit live update to both customer and driver
    emitToRoom(`trip:${tripId}`, 'trip:status_change', {
      tripId,
      status,
    });

    if (trip.customer_id) {
      emitToUser(trip.customer_id, 'trip:status_change', { tripId, status });

      // Direct database notification based on status
      let notifTitle = '';
      let notifMessage = '';
      if (status === 'DRIVER_ARRIVING') {
        notifTitle = 'Driver En Route';
        notifMessage = 'Your SAFARIS driver is en route to your pickup location.';
      } else if (status === 'DRIVER_ARRIVED') {
        notifTitle = 'Driver Arrived';
        notifMessage = 'Your driver has arrived outside your pickup location.';
      } else if (status === 'TRIP_STARTED') {
        notifTitle = 'Trip In Progress';
        notifMessage = `Your journey to ${trip.dest_title} has started. Enjoy your ride!`;
      } else if (status === 'TRIP_COMPLETED') {
        notifTitle = 'Trip Completed';
        notifMessage = `You arrived safely at ${trip.dest_title}. Total fare: UGX ${trip.fare_ugx?.toLocaleString()}.`;
      } else if (status === 'CANCELLED') {
        notifTitle = 'Trip Cancelled';
        notifMessage = 'Your trip request has been cancelled.';
      }

      if (notifTitle) {
        NotificationService.createNotification({
          userId: trip.customer_id,
          title: notifTitle,
          message: notifMessage,
          type: 'DRIVER',
          metadata: { tripId, status, fareUGX: trip.fare_ugx, destination: trip.dest_title },
        }).catch((err) => console.error('[TripStatusNotification Error]', err));
      }
    }
    if (trip.driver_id) {
      emitToUser(trip.driver_id, 'trip:status_change', { tripId, status });
    }

    return trip;
  }

  public static rateTrip(tripId: string, rating: number, tipUGX = 0, compliments: string[] = []) {
    const trip = localStore.trips.get(tripId);
    if (!trip) {
      throw new Error('Trip not found.');
    }

    trip.tip_ugx = tipUGX;
    if (tipUGX > 0 && trip.driver_id) {
      const driver = localStore.drivers.get(trip.driver_id);
      if (driver) {
        driver.today_earnings_ugx += tipUGX;
      }
    }

    return {
      tripId,
      rating,
      tipUGX,
      compliments,
      message: 'Thank you for rating your SAFARIS driver.',
    };
  }

  public static getTrip(tripId: string) {
    const trip = localStore.trips.get(tripId);
    if (!trip) {
      throw new Error('Trip not found.');
    }

    let driverDetails = null;
    if (trip.driver_id) {
      const driverUser = localStore.users.get(trip.driver_id);
      const driver = localStore.drivers.get(trip.driver_id);
      const vehicle = driver?.vehicle_id ? localStore.vehicles.get(driver.vehicle_id) : null;

      driverDetails = {
        driverId: trip.driver_id,
        fullName: driverUser ? driverUser.full_name : 'Assigned Driver',
        phone: driverUser ? driverUser.phone : '',
        rating: driverUser ? (driverUser.rating || 5.0) : 5.0,
        vehicleModel: vehicle ? `${vehicle.make} ${vehicle.model}` : 'Vehicle',
        licensePlate: vehicle ? vehicle.registration_plate : '',
        vehicleColor: vehicle ? vehicle.color : '',
      };
    }

    return { ...trip, driver: driverDetails };
  }

  public static getUserTrips(userId: string) {
    const userTrips: any[] = [];
    for (const trip of localStore.trips.values()) {
      if (trip.customer_id === userId || trip.driver_id === userId) {
        userTrips.push(trip);
      }
    }
    return userTrips.reverse();
  }
}
