import { v4 as uuidv4 } from 'uuid';
import { localStore } from '../../config/database';
import { emitToUser, emitToRoom } from '../../realtime/socket_server';

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
  // Base rates in UGX
  private static tierPricing: Record<string, { base: number; perKm: number }> = {
    boda: { base: 3000, perKm: 1200 },
    go: { base: 6000, perKm: 2200 },
    comfort: { base: 10000, perKm: 3200 },
    safari4x4: { base: 50000, perKm: 6500 },
    tour_van: { base: 65000, perKm: 7500 },
  };

  public static estimateFare(distanceKm: number) {
    const estimates: Record<string, number> = {};
    for (const [tier, pricing] of Object.entries(this.tierPricing)) {
      estimates[tier] = pricing.base + distanceKm * pricing.perKm;
    }
    return estimates;
  }

  public static createTrip(data: CreateTripRequest) {
    const tripId = `trp_${uuidv4().substring(0, 8)}`;
    const pricing = this.tierPricing[data.vehicleTier] || this.tierPricing.go;
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

    // Trigger driver matching asynchronously
    setTimeout(() => {
      this.matchDriver(tripId);
    }, 1500);

    return newTrip;
  }

  public static matchDriver(tripId: string) {
    const trip = localStore.trips.get(tripId);
    if (!trip || trip.status !== 'SEARCHING') return;

    // Find first eligible online driver
    let matchedDriver: any = null;
    for (const d of localStore.drivers.values()) {
      if (d.is_online && d.is_available) {
        matchedDriver = d;
        break;
      }
    }

    // Fallback: pick any driver if none online
    if (!matchedDriver) {
      matchedDriver = Array.from(localStore.drivers.values())[0];
    }

    if (matchedDriver) {
      trip.driver_id = matchedDriver.id;
      trip.status = 'DRIVER_ASSIGNED';
      trip.updated_at = new Date().toISOString();
      matchedDriver.is_available = false;

      const driverUser = localStore.users.get(matchedDriver.id);
      const vehicle = matchedDriver.vehicle_id
        ? localStore.vehicles.get(matchedDriver.vehicle_id)
        : null;

      const driverDetails = {
        driverId: matchedDriver.id,
        fullName: driverUser ? driverUser.full_name : 'Moses Okello',
        phone: driverUser ? driverUser.phone : '+256 701 847291',
        rating: driverUser ? driverUser.rating : 4.96,
        vehicleModel: vehicle ? `${vehicle.make} ${vehicle.model}` : 'Toyota Premio',
        licensePlate: vehicle ? vehicle.registration_plate : 'UBM 714K',
        vehicleColor: vehicle ? vehicle.color : 'Silver Metallic',
      };

      // Broadcast real-time assignment via WebSockets
      emitToUser(trip.customer_id, 'trip:driver_assigned', {
        tripId,
        driver: driverDetails,
        status: 'DRIVER_ASSIGNED',
      });

      emitToUser(matchedDriver.id, 'trip:incoming_request', {
        tripId,
        trip,
      });
    }
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
        fullName: driverUser ? driverUser.full_name : 'Moses Okello',
        phone: driverUser ? driverUser.phone : '+256 701 847291',
        rating: driverUser ? driverUser.rating : 4.96,
        vehicleModel: vehicle ? `${vehicle.make} ${vehicle.model}` : 'Toyota Premio',
        licensePlate: vehicle ? vehicle.registration_plate : 'UBM 714K',
        vehicleColor: vehicle ? vehicle.color : 'Silver Metallic',
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
