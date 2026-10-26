import { commitBooking } from '../pricing/booking_commit';
import { v4 as uuidv4 } from 'uuid';
import { db, localStore } from '../../config/database';
import {
  emitToUser,
  emitToRoom,
  emitToTrip,
  broadcastToFleet,
  broadcastDriverSnapshot,
} from '../../realtime/socket_server';
import { NotificationService } from '../notification/notification.service';
import { AdminService } from '../admin/admin.service';
import { FinancialService } from '../financial/financial.service';
import { PayoutService } from '../financial/payout.service';
import { PricingEngineService } from '../pricing/pricing_engine.service';
import { ENV } from '../../config/env';

export interface EstimateRequest {
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  distanceKm?: number;
  serviceType?: 'RIDE' | 'AIRPORT_SHUTTLE';
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
  vehicleId?: string;
  serviceType?: 'RIDE' | 'AIRPORT_SHUTTLE';
  quotationId?: string;
  routeCode?: string;
  distanceKm: number;
  paymentMethod: string;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['SEARCHING', 'DRIVER_ASSIGNED', 'CANCELLED'],
  SEARCHING: ['DRIVER_ASSIGNED', 'CANCELLED'],
  DRIVER_ASSIGNED: ['DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'CANCELLED'],
  DRIVER_ARRIVING: ['DRIVER_ARRIVED', 'TRIP_STARTED', 'CANCELLED'],
  DRIVER_ARRIVED: ['TRIP_STARTED', 'CANCELLED'],
  TRIP_STARTED: ['TRIP_COMPLETED', 'CANCELLED'],
  TRIP_COMPLETED: [],
  CANCELLED: [],
};

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

  public static estimateFare(distanceKm: number, serviceKey: 'ride_hailing' | 'airport_shuttle' = 'ride_hailing') {
    const estimates: Record<string, number> = {};
    const eligibleVehicles = PricingEngineService.getAllCatalogueVehicles({ service: serviceKey });

    for (const veh of eligibleVehicles) {
      if (serviceKey === 'airport_shuttle' && veh.service_pricing?.airport_shuttle) {
        const asCfg = veh.service_pricing.airport_shuttle;
        const raw = Number(asCfg.baseFareUgx || 25000) + distanceKm * Number(asCfg.perKmUgx || 2500);
        estimates[veh.code] = Math.round(Math.max(Number(asCfg.minimumFareUgx || 0), raw));
      } else if (veh.service_pricing?.ride_hailing) {
        const rhCfg = veh.service_pricing.ride_hailing;
        const { distanceChargeUgx } = PricingEngineService.calculateDistanceBandCharge(
          distanceKm,
          rhCfg.distanceBands || [],
          rhCfg.calculationMode || 'BAND_MATCH'
        );
        const raw = Number(rhCfg.baseFareUgx || 0) + distanceChargeUgx;
        estimates[veh.code] = Math.round(Math.max(Number(rhCfg.minimumFareUgx || 0), raw));
      }
    }

    // Ensure legacy tier keys remain populated if present in AdminService
    const pricing = this.getTierPricing();
    for (const [tier, rates] of Object.entries(pricing)) {
      if (estimates[tier] === undefined) {
        estimates[tier] = Math.round(rates.base + distanceKm * rates.perKm);
      }
    }
    return estimates;
  }

  public static async createTrip(data: CreateTripRequest) {
    const tripId = `trp_${uuidv4().substring(0, 8)}`;
    const tierKey = (data.vehicleId || data.vehicleTier || 'go').toLowerCase();
    const serviceCategory = data.serviceType === 'AIRPORT_SHUTTLE' ? 'AIRPORT_SHUTTLE' : 'RIDE';
    const serviceKey = serviceCategory === 'AIRPORT_SHUTTLE' ? 'airport_shuttle' : 'ride_hailing';

    // Calculate server-authoritative route distance based on coordinates
    const pickupLat = Number(data.pickupLat ?? 0.3136);
    const pickupLng = Number(data.pickupLng ?? 32.5811);
    const destLat = Number(data.destLat ?? 0.0424);
    const destLng = Number(data.destLng ?? 32.4435);

    const serverDistanceKm = PricingEngineService.calculateServerDistanceKm(
      pickupLat,
      pickupLng,
      destLat,
      destLng
    );

    // Authoritative chargeable distance server-side; client distance parameter is ignored
    const distanceKm = serverDistanceKm;

    let fareUGX = 0;
    let quotationId: string | null = data.quotationId || null;
    let pricingVersion = 1;
    let quotationSnapshot: any = {};

    // Check and atomically validate/consume quotation if supplied
    if (quotationId) {
      const existingQuote = PricingEngineService.validateQuotation({
        quotationId,
        expectedServiceType: serviceCategory,
        customerId: data.customerId,
        vehicleId: data.vehicleId || data.vehicleTier,
        pickupLat,
        pickupLng,
        destLat,
        destLng,
      });
      fareUGX = Number(existingQuote.total_price_ugx || existingQuote.totalPriceUgx || 0);
      pricingVersion = Number(existingQuote.pricing_version || existingQuote.pricingVersion || 1);
      quotationSnapshot = existingQuote;
    } else {
      const catVehicle = PricingEngineService.getCatalogueVehicleByIdOrCode(tierKey);
      if (catVehicle && catVehicle.assigned_services.includes(serviceKey) && catVehicle.is_active && catVehicle.is_available) {
        pricingVersion = catVehicle.pricing_version || 1;
        if (serviceCategory === 'AIRPORT_SHUTTLE' && catVehicle.service_pricing?.airport_shuttle) {
          const asCfg = catVehicle.service_pricing.airport_shuttle;
          const routeKey = (data.routeCode || '').toLowerCase().trim();
          if (routeKey && asCfg.fixedRoutes && asCfg.fixedRoutes[routeKey]) {
            fareUGX = Math.round(Number(asCfg.fixedRoutes[routeKey]));
          } else {
            const raw = Number(asCfg.baseFareUgx || 25000) + distanceKm * Number(asCfg.perKmUgx || 2500);
            fareUGX = Math.round(Math.max(Number(asCfg.minimumFareUgx || 0), raw));
          }
        } else if (catVehicle.service_pricing?.ride_hailing) {
          const rhCfg = catVehicle.service_pricing.ride_hailing;
          const { distanceChargeUgx, appliedBandLabel } = PricingEngineService.calculateDistanceBandCharge(
            distanceKm,
            rhCfg.distanceBands || [],
            rhCfg.calculationMode || 'BAND_MATCH'
          );
          const raw = Number(rhCfg.baseFareUgx || 0) + distanceChargeUgx;
          fareUGX = Math.round(Math.max(Number(rhCfg.minimumFareUgx || 0), raw));
          quotationSnapshot = {
            vehicleId: catVehicle.id,
            vehicleName: catVehicle.name,
            basePriceUgx: rhCfg.baseFareUgx,
            distancePriceUgx: distanceChargeUgx,
            appliedBandLabel,
            totalPriceUgx: fareUGX,
            pricingVersion,
          };
        }
      }

      if (fareUGX <= 0) {
        const pricingMap = this.getTierPricing();
        const pricing = pricingMap[tierKey] || pricingMap.go;
        fareUGX = Math.round(pricing.base + distanceKm * pricing.perKm);
      }
    }

    const customer = data.customerId ? localStore.users.get(data.customerId) : null;
    const nowIso = new Date().toISOString();

    const newTrip: any = {
      id: tripId,
      customer_id: data.customerId,
      customer_name: customer?.full_name || 'Safaris Customer',
      customer_phone: customer?.phone || '',
      driver_id: null,
      pickup_title: data.pickupTitle || 'Kampala Pickup',
      pickup_address: data.pickupAddress || data.pickupTitle || 'Kampala',
      pickup_lat: Number(data.pickupLat ?? 0.3136),
      pickup_lng: Number(data.pickupLng ?? 32.5811),
      dest_title: data.destTitle || 'Destination',
      dest_address: data.destAddress || data.destTitle || 'Kampala',
      dest_lat: Number(data.destLat ?? 0.3476),
      dest_lng: Number(data.destLng ?? 32.5825),
      vehicle_tier: tierKey,
      service_category: serviceCategory,
      quotation_id: quotationId,
      pricing_version: pricingVersion,
      quotation_snapshot: quotationSnapshot,
      status: 'SEARCHING',
      distance_km: distanceKm,
      estimated_duration_mins: Math.max(5, Math.round(distanceKm * 2.2)),
      fare_ugx: fareUGX,
      fareUgx: fareUGX,
      tip_ugx: 0,
      payment_method: data.paymentMethod || 'MTN Mobile Money',
      declined_by: [],
      created_at: nowIso,
      updated_at: nowIso,
    };

    await commitBooking('trips', newTrip, quotationId, storedQuote => PricingEngineService.validateQuotation({
      quotationId: quotationId!, expectedServiceType: serviceCategory, customerId: data.customerId,
      vehicleId: data.vehicleId || data.vehicleTier, pickupLat, pickupLng, destLat, destLng, storedQuote
    }));

    // Find drivers who already have an active trip so we don't dispatch to busy drivers
    const busyDriverIds = new Set<string>();
    for (const t of localStore.trips.values()) {
      if (
        t.driver_id &&
        ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(t.status)
      ) {
        busyDriverIds.add(t.driver_id);
      }
    }

    // Broadcast request to all online, available, approved drivers so a real driver can accept
    for (const d of localStore.drivers.values()) {
      if (
        d.is_online &&
        d.is_available &&
        d.is_approved &&
        d.approval_status === 'APPROVED' &&
        !busyDriverIds.has(d.id)
      ) {
        emitToUser(d.id, 'trip:incoming_request', {
          tripId,
          trip: newTrip,
        });
      }
    }

    // Also broadcast to admin fleet stream
    broadcastToFleet(newTrip, 'trip:created');

    return newTrip;
  }

  /**
   * Called when a real approved driver accepts an incoming trip.
   */
  public static acceptTrip(tripId: string, driverId: string) {
    const trip = localStore.trips.get(tripId);
    if (!trip) throw new Error('Trip not found.');
    if (trip.status !== 'SEARCHING') {
      throw new Error(
        `Trip is no longer searching (current status: ${trip.status}). Another driver may have already accepted it.`
      );
    }

    const driver = localStore.drivers.get(driverId);
    if (!driver) throw new Error('Driver profile not found.');
    if (!driver.is_approved || driver.approval_status !== 'APPROVED') {
      throw new Error(
        'Driver must be approved by Mumwe Safaris administrators before accepting trips.'
      );
    }
    if (!driver.is_online) {
      throw new Error('Driver must be online to accept a ride request.');
    }

    // Check if driver already has an active trip
    for (const existing of localStore.trips.values()) {
      if (
        existing.id !== tripId &&
        existing.driver_id === driverId &&
        ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(
          existing.status
        )
      ) {
        throw new Error(
          `You already have an active trip (${existing.id}). Complete it before accepting another request.`
        );
      }
    }

    trip.driver_id = driverId;
    trip.status = 'DRIVER_ASSIGNED';
    trip.updated_at = new Date().toISOString();
    driver.is_available = false;
    driver.updated_at = new Date().toISOString();

    db.persistTrip(trip).catch((err) =>
      console.error('[TripService.acceptTrip persistTrip error]', err)
    );
    db.persistDriver(driver).catch((err) =>
      console.error('[TripService.acceptTrip persistDriver error]', err)
    );

    const driverUser = localStore.users.get(driverId);
    const vehicle = driver.vehicle_id ? localStore.vehicles.get(driver.vehicle_id) : null;

    const driverDetails = {
      driverId,
      fullName: driverUser ? driverUser.full_name : 'Driver',
      phone: driverUser ? driverUser.phone : '',
      rating: Number(driverUser?.rating ?? 5.0),
      totalTrips: Number(driverUser?.total_trips ?? 0),
      vehicleModel: vehicle ? `${vehicle.make} ${vehicle.model}` : 'Safari Vehicle',
      licensePlate: vehicle ? vehicle.registration_plate : '',
      vehicleColor: vehicle ? vehicle.color : '',
      tier: vehicle ? vehicle.tier : trip.vehicle_tier,
      lat: Number(driver.current_lat ?? trip.pickup_lat),
      lng: Number(driver.current_lng ?? trip.pickup_lng),
      heading: Number(driver.heading ?? 0),
    };

    // Notify all other online drivers that this request is now closed
    for (const d of localStore.drivers.values()) {
      if (d.id !== driverId && d.is_online) {
        emitToUser(d.id, 'trip:request_closed', {
          tripId,
          acceptedBy: driverId,
        });
      }
    }

    // Broadcast real-time assignment via WebSockets & SSE to customer and trip room
    const assignedPayload = {
      tripId,
      trip: this.getTrip(tripId),
      driver: driverDetails,
      status: 'DRIVER_ASSIGNED',
    };
    if (trip.customer_id) {
      emitToUser(trip.customer_id, 'trip:driver_assigned', assignedPayload);
      emitToUser(trip.customer_id, 'trip:status_change', assignedPayload);
    }
    emitToUser(driverId, 'trip:driver_assigned', assignedPayload);
    emitToTrip(tripId, 'trip:status_change', assignedPayload);

    // Update Admin Map marker to Blue (Assigned/In Trip) immediately
    broadcastDriverSnapshot(driverId, 'fleet:status_update');

    if (trip.customer_id) {
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
    }

    return { status: 'DRIVER_ASSIGNED', trip: this.getTrip(tripId), driver: driverDetails };
  }

  /**
   * Called when a driver declines an incoming trip request so it leaves their queue.
   */
  public static rejectTrip(tripId: string, driverId: string) {
    const trip = localStore.trips.get(tripId);
    if (!trip) throw new Error('Trip not found.');

    if (!Array.isArray(trip.declined_by)) {
      trip.declined_by = [];
    }
    if (!trip.declined_by.includes(driverId)) {
      trip.declined_by.push(driverId);
    }

    emitToUser(driverId, 'trip:request_closed', {
      tripId,
      declinedBy: driverId,
    });

    return { tripId, status: trip.status, declined: true };
  }

  /**
   * Receives real telemetry updates from an assigned driver and transmits to customer & admin map.
   */
  public static updateDriverLocation(
    tripId: string,
    lat: number,
    lng: number,
    heading?: number,
    driverId?: string
  ) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error('Invalid GPS coordinates.');
    }

    const trip = localStore.trips.get(tripId);
    if (!trip) throw new Error('Trip not found.');

    const effectiveDriverId = driverId || trip.driver_id;
    if (effectiveDriverId) {
      const driver = localStore.drivers.get(effectiveDriverId);
      if (driver && driver.is_approved && driver.approval_status === 'APPROVED') {
        driver.current_lat = Number(lat);
        driver.current_lng = Number(lng);
        if (heading !== undefined && Number.isFinite(heading)) {
          driver.heading = Number(heading);
        }
        driver.updated_at = new Date().toISOString();
        db.persistDriver(driver).catch(() => {});
        broadcastDriverSnapshot(effectiveDriverId, 'fleet:telemetry_update');
      }
    }

    const locPayload = {
      tripId,
      driverId: effectiveDriverId,
      lat: Number(lat),
      lng: Number(lng),
      heading: Number(heading || 0),
      timestamp: Date.now(),
    };

    emitToTrip(tripId, 'trip:driver_location', locPayload);
    if (trip.customer_id) {
      emitToUser(trip.customer_id, 'trip:driver_location', locPayload);
    }

    return { tripId, lat: Number(lat), lng: Number(lng), heading: Number(heading || 0) };
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

  public static updateTripStatus(
    tripId: string,
    status: string,
    actorId?: string,
    actorRole?: string
  ) {
    const trip = localStore.trips.get(tripId);
    if (!trip) {
      throw new Error('Trip not found.');
    }

    if (!actorId) {
      throw new Error('Authentication required to update trip status.');
    }

    // Authorization check
    if (actorRole !== 'admin') {
      const isAssignedDriver = trip.driver_id === actorId;
      const isTripCustomer = trip.customer_id === actorId;
      if (!isAssignedDriver && !(isTripCustomer && status === 'CANCELLED')) {
        throw new Error('You are not authorized to update the status of this trip.');
      }
    }

    // Validate status transition
    const allowedNext = VALID_TRANSITIONS[trip.status] || [];
    if (trip.status !== status && !allowedNext.includes(status) && actorRole !== 'admin') {
      throw new Error(
        `Invalid trip status transition from ${trip.status} to ${status}.`
      );
    }

    const previousStatus = trip.status;
    trip.status = status;
    trip.updated_at = new Date().toISOString();

    if (status === 'DRIVER_ARRIVED' && !trip.driver_arrived_at) {
      trip.driver_arrived_at = trip.updated_at;
    }

    if (status === 'TRIP_COMPLETED' && previousStatus !== 'TRIP_COMPLETED') {
      const driver = trip.driver_id ? localStore.drivers.get(trip.driver_id) : null;
      const activeEnv = (trip.payment_environment || ENV.DPO_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
      if (trip.payment_status === 'PAID' || trip.payment_status === 'COMPLETED') {
        const hasEarning = Array.from(localStore.platform_earnings.values()).some(
          (e: any) => e.booking_type === 'TRIP' && e.booking_id === tripId && e.environment === activeEnv
        );
        if (!hasEarning && trip.driver_id) {
          FinancialService.recordPlatformEarning({
            bookingType: 'TRIP',
            bookingId: tripId,
            payerUserId: trip.customer_id,
            beneficiaryId: trip.driver_id,
            grossAmountUgx: Number(trip.fare_ugx || 0) + Number(trip.tip_ugx || 0),
            commissionRate: 15.0,
            paymentMethod: trip.payment_method || 'WALLET',
            environment: activeEnv,
          }).catch((err) => console.warn('[TripService] recordPlatformEarning error:', err));
        }
      }
      if (driver) {
        driver.today_earnings_ugx = PayoutService.getBeneficiaryEarningsSummary(driver.id, 'driver', activeEnv).availableEarningsUgx;
        driver.is_available = Boolean(driver.is_online);
        driver.updated_at = new Date().toISOString();
        db.persistDriver(driver).catch(() => {});
      }
      const driverUser = trip.driver_id ? localStore.users.get(trip.driver_id) : null;
      if (driverUser) {
        driverUser.total_trips = Number(driverUser.total_trips || 0) + 1;
        db.persistUser(driverUser).catch(() => {});
      }
      const customer = trip.customer_id ? localStore.users.get(trip.customer_id) : null;
      if (customer) {
        customer.total_trips = Number(customer.total_trips || 0) + 1;
        db.persistUser(customer).catch(() => {});
      }
    } else if (status === 'CANCELLED' && previousStatus !== 'CANCELLED') {
      if (trip.driver_id) {
        const driver = localStore.drivers.get(trip.driver_id);
        if (driver) {
          driver.is_available = Boolean(driver.is_online);
          driver.updated_at = new Date().toISOString();
          db.persistDriver(driver).catch(() => {});
        }
      } else {
        // Close searching request for all online drivers
        for (const d of localStore.drivers.values()) {
          if (d.is_online) {
            emitToUser(d.id, 'trip:request_closed', { tripId, cancelled: true });
          }
        }
      }
    }

    db.persistTrip(trip).catch((err) =>
      console.error('[TripService.updateTripStatus persistTrip error]', err)
    );

    const enrichedTrip = this.getTrip(tripId);
    const statusPayload = {
      tripId,
      status,
      trip: enrichedTrip,
    };

    // Emit live update to trip room, customer, driver, and admin fleet
    emitToTrip(tripId, 'trip:status_change', statusPayload);
    broadcastToFleet(statusPayload, 'trip:status_change');

    if (trip.driver_id) {
      broadcastDriverSnapshot(trip.driver_id, 'fleet:status_update');
      emitToUser(trip.driver_id, 'trip:status_change', statusPayload);
    }

    if (trip.customer_id) {
      emitToUser(trip.customer_id, 'trip:status_change', statusPayload);

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
        notifMessage = `You arrived safely at ${trip.dest_title}. Total fare: UGX ${Number(trip.fare_ugx || 0).toLocaleString()}.`;
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

    return enrichedTrip;
  }

  public static rateTrip(tripId: string, rating: number, tipUGX = 0, compliments: string[] = []) {
    const trip = localStore.trips.get(tripId);
    if (!trip) {
      throw new Error('Trip not found.');
    }

    trip.tip_ugx = Number(tipUGX || 0);
    trip.updated_at = new Date().toISOString();
    if (trip.tip_ugx > 0 && trip.driver_id) {
      const driver = localStore.drivers.get(trip.driver_id);
      if (driver) {
        driver.today_earnings_ugx = Number(driver.today_earnings_ugx || 0) + trip.tip_ugx;
        db.persistDriver(driver).catch(() => {});
      }
    }
    db.persistTrip(trip).catch(() => {});

    return {
      tripId,
      rating,
      tipUGX: trip.tip_ugx,
      compliments,
      message: 'Thank you for rating your SAFARIS driver.',
    };
  }

  public static getTrip(tripId: string) {
    const trip = localStore.trips.get(tripId);
    if (!trip) {
      throw new Error('Trip not found.');
    }

    const customer = trip.customer_id ? localStore.users.get(trip.customer_id) : null;
    let driverDetails = null;
    if (trip.driver_id) {
      const driverUser = localStore.users.get(trip.driver_id);
      const driver = localStore.drivers.get(trip.driver_id);
      const vehicle = driver?.vehicle_id ? localStore.vehicles.get(driver.vehicle_id) : null;

      driverDetails = {
        driverId: trip.driver_id,
        fullName: driverUser ? driverUser.full_name : 'Assigned Driver',
        phone: driverUser ? driverUser.phone : '',
        rating: Number(driverUser?.rating ?? 5.0),
        totalTrips: Number(driverUser?.total_trips ?? 0),
        vehicleModel: vehicle ? `${vehicle.make} ${vehicle.model}` : 'Safari Vehicle',
        licensePlate: vehicle ? vehicle.registration_plate : '',
        vehicleColor: vehicle ? vehicle.color : '',
        tier: vehicle ? vehicle.tier : trip.vehicle_tier,
        lat: Number(driver?.current_lat ?? trip.pickup_lat),
        lng: Number(driver?.current_lng ?? trip.pickup_lng),
        heading: Number(driver?.heading ?? 0),
      };
    }

    return {
      ...trip,
      customer_name: customer?.full_name || trip.customer_name || 'Safaris Customer',
      customer_phone: customer?.phone || trip.customer_phone || '',
      driver: driverDetails,
    };
  }

  public static getUserTrips(userId: string) {
    const userTrips: any[] = [];
    for (const trip of localStore.trips.values()) {
      if (trip.customer_id === userId || trip.driver_id === userId) {
        userTrips.push(this.getTrip(trip.id));
      }
    }
    return userTrips.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
}
