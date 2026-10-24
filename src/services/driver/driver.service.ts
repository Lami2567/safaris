import { db, localStore } from '../../config/database';
import { ENV } from '../../config/env';
import { FinancialService } from '../financial/financial.service';
import { PayoutService } from '../financial/payout.service';
import { broadcastDriverSnapshot, emitToTrip, emitToUser } from '../../realtime/socket_server';

export class DriverService {
  public static ensureDriverRecord(driverId: string): any | null {
    let driver = localStore.drivers.get(driverId);
    if (driver) return driver;

    const user = localStore.users.get(driverId);
    let app: any = null;
    for (const candidate of localStore.career_applications.values()) {
      if (candidate.user_id === driverId && candidate.applicant_type === 'driver') {
        app = candidate;
        break;
      }
    }

    if (!app && (!user || user.role !== 'driver')) {
      return null;
    }

    const isApproved =
      app?.status === 'APPROVED' || user?.approval_status === 'APPROVED';
    const approvalStatus = isApproved
      ? 'APPROVED'
      : app?.status || user?.approval_status || 'PENDING_APPROVAL';

    let vehicleId: string | null = null;
    if (app?.vehicle_plate) {
      vehicleId = `veh_${driverId.replace(/^usr_/, '')}`;
      if (!localStore.vehicles.has(vehicleId)) {
        const vehicle = {
          id: vehicleId,
          driver_id: driverId,
          tier: app.vehicle_tier || 'go',
          make: app.vehicle_make || 'Toyota',
          model: app.vehicle_model || 'Corolla',
          registration_plate: String(app.vehicle_plate).trim().toUpperCase(),
          color: 'White',
          capacity: 4,
          status: 'active',
          created_at: app.created_at || new Date().toISOString(),
        };
        db.persistVehicle(vehicle).catch(() => {});
      }
    }

    driver = {
      id: driverId,
      vehicle_id: vehicleId,
      is_online: false,
      is_available: false,
      is_approved: isApproved,
      approval_status: approvalStatus,
      current_lat: 0.3136,
      current_lng: 32.5811,
      heading: 0,
      speed: 0,
      license_number: app?.license_number || 'UG-PERMIT',
      national_id: app?.national_id || '',
      driving_permit_number: app?.license_number || '',
      years_of_experience: Number(app?.experience_years || 0),
      acceptance_rate: 100.0,
      today_earnings_ugx: 0,
      application_date: app?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.persistDriver(driver).catch((err) =>
      console.error('[DriverService.ensureDriverRecord persist error]', err)
    );
    return driver;
  }

  public static setAvailability(
    driverId: string,
    isOnline: boolean,
    coords?: { lat?: number; lng?: number; heading?: number; speed?: number }
  ) {
    const driver = this.ensureDriverRecord(driverId);
    if (!driver) {
      throw new Error('Driver account not found. Please apply via careers.mumwesafarisuganda.com.');
    }

    if (driver.approval_status !== 'APPROVED' || !driver.is_approved) {
      throw new Error(
        `Driver account is not approved for active operations (status: ${driver.approval_status || 'PENDING_APPROVAL'}).`
      );
    }

    // Check if driver currently has an active trip
    let hasActiveTrip = false;
    for (const t of localStore.trips.values()) {
      if (
        t.driver_id === driverId &&
        ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(t.status)
      ) {
        hasActiveTrip = true;
        break;
      }
    }

    driver.is_online = Boolean(isOnline);
    driver.is_available = Boolean(isOnline) && !hasActiveTrip;
    if (
      coords &&
      Number.isFinite(coords.lat) &&
      Number.isFinite(coords.lng) &&
      coords.lat! >= -90 &&
      coords.lat! <= 90 &&
      coords.lng! >= -180 &&
      coords.lng! <= 180
    ) {
      driver.current_lat = Number(coords.lat);
      driver.current_lng = Number(coords.lng);
      if (Number.isFinite(coords.heading)) driver.heading = Number(coords.heading);
      if (Number.isFinite(coords.speed)) driver.speed = Number(coords.speed);
    }
    driver.updated_at = new Date().toISOString();

    db.persistDriver(driver).catch((err) =>
      console.error('[DriverService.setAvailability persist error]', err)
    );

    // Immediately broadcast status change to Admin Map & Fleet stream
    const snapshot = broadcastDriverSnapshot(driverId, 'fleet:status_update');

    return {
      driverId,
      isOnline: driver.is_online,
      isAvailable: driver.is_available,
      approvalStatus: driver.approval_status,
      updatedAt: driver.updated_at,
      snapshot,
    };
  }

  public static updateLocation(
    driverId: string,
    lat: number,
    lng: number,
    heading = 0,
    speed = 0,
    accuracy = 5,
    batteryLevel?: number
  ) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error('Invalid GPS coordinates. Latitude must be [-90, 90] and longitude [-180, 180].');
    }

    const driver = this.ensureDriverRecord(driverId);
    if (!driver) {
      throw new Error('Driver not found.');
    }

    if (driver.approval_status !== 'APPROVED' || !driver.is_approved) {
      throw new Error('Driver account is not approved to transmit live telemetry.');
    }

    const nowIso = new Date().toISOString();
    driver.current_lat = Number(lat);
    driver.current_lng = Number(lng);
    driver.heading = Number.isFinite(heading) ? Number(heading) : 0;
    driver.speed = Number.isFinite(speed) ? Number(speed) : 0;
    if (batteryLevel !== undefined && Number.isFinite(batteryLevel)) {
      driver.battery_level = Number(batteryLevel);
    }
    driver.updated_at = nowIso;

    db.persistDriver(driver).catch((err) =>
      console.error('[DriverService.updateLocation persist error]', err)
    );

    // Check if driver is currently on an active trip
    let activeTrip: any = null;
    for (const t of localStore.trips.values()) {
      if (
        t.driver_id === driverId &&
        ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(t.status)
      ) {
        activeTrip = t;
        break;
      }
    }

    // Record breadcrumb point in location_points
    const ptId = `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const pointRecord = {
      id: ptId,
      driver_id: driverId,
      trip_id: activeTrip?.id || null,
      safari_leg_id: null,
      lat: driver.current_lat,
      lng: driver.current_lng,
      speed: driver.speed,
      heading: driver.heading,
      accuracy: Number.isFinite(accuracy) ? Number(accuracy) : 5.0,
      battery_level: driver.battery_level ?? null,
      is_offline_queued: false,
      recorded_at: nowIso,
      created_at: nowIso,
    };
    localStore.location_points.set(ptId, pointRecord);
    if (db.isPostgresConnected) {
      db.query(
        `INSERT INTO location_points (id, driver_id, trip_id, safari_leg_id, lat, lng, speed, heading, accuracy, battery_level, is_offline_queued, recorded_at)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, false, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          ptId,
          driverId,
          activeTrip?.id || null,
          driver.current_lat,
          driver.current_lng,
          driver.speed,
          driver.heading,
          pointRecord.accuracy,
          driver.battery_level ?? null,
          nowIso,
        ]
      ).catch(() => {});
    }

    // If on an active trip, push live coordinates to trip room & customer immediately
    if (activeTrip) {
      const locPayload = {
        tripId: activeTrip.id,
        driverId,
        lat: driver.current_lat,
        lng: driver.current_lng,
        heading: driver.heading,
        speed: driver.speed,
        timestamp: Date.now(),
      };
      emitToTrip(activeTrip.id, 'trip:driver_location', locPayload);
      if (activeTrip.customer_id) {
        emitToUser(activeTrip.customer_id, 'trip:driver_location', locPayload);
      }
    }

    // Immediately broadcast single-driver telemetry snapshot to Admin Map (Socket.IO + SSE)
    const snapshot = broadcastDriverSnapshot(driverId, 'fleet:telemetry_update');

    return {
      driverId,
      lat: driver.current_lat,
      lng: driver.current_lng,
      heading: driver.heading,
      speed: driver.speed,
      updatedAt: nowIso,
      activeTripId: activeTrip?.id || null,
      snapshot,
    };
  }

  public static async getNearbyDrivers(lat = 0.3136, lng = 32.5811, radiusKm = 10) {
    if (db && db.isPostgresConnected) {
      try {
        const query = `
          SELECT 
            d.id as "driverId", 
            u.full_name as "name", 
            u.phone,
            u.rating, 
            d.current_lat as "lat", 
            d.current_lng as "lng", 
            d.heading, 
            CONCAT(v.make, ' ', v.model) as "vehicle", 
            v.tier, 
            v.registration_plate as "plate"
          FROM drivers d
          JOIN users u ON d.id = u.id
          LEFT JOIN vehicles v ON d.vehicle_id = v.id
          WHERE d.is_online = true AND d.is_available = true AND d.is_approved = true AND d.approval_status = 'APPROVED'
        `;
        const result = await db.query(query);
        if (result && result.rows && result.rows.length > 0) {
          return result.rows;
        }
      } catch (e) {
        console.error('Postgres getNearbyDrivers fallback to localStore:', e);
      }
    }

    const activeDrivers: any[] = [];
    for (const d of localStore.drivers.values()) {
      if (d.is_online && d.is_available && d.is_approved && d.approval_status === 'APPROVED') {
        const user = localStore.users.get(d.id);
        const vehicle = d.vehicle_id ? localStore.vehicles.get(d.vehicle_id) : null;

        activeDrivers.push({
          driverId: d.id,
          name: user ? user.full_name : 'Safaris Driver',
          phone: user ? user.phone : '',
          rating: user ? user.rating : 4.9,
          lat: d.current_lat,
          lng: d.current_lng,
          heading: d.heading || 0,
          vehicle: vehicle ? `${vehicle.make} ${vehicle.model}` : 'Safari Vehicle',
          tier: vehicle ? vehicle.tier : 'go',
          plate: vehicle ? vehicle.registration_plate : '',
        });
      }
    }

    return activeDrivers;
  }

  public static getDriverDashboard(driverId: string) {
    const user = localStore.users.get(driverId);
    const driver = this.ensureDriverRecord(driverId);
    const vehicle = driver?.vehicle_id ? localStore.vehicles.get(driver.vehicle_id) : null;

    const isApproved = Boolean(driver?.is_approved && driver?.approval_status === 'APPROVED');
    const approvalStatus = driver?.approval_status || user?.approval_status || 'PENDING_APPROVAL';

    let activeTrip: any = null;
    const incomingRequests: any[] = [];
    const completedTrips: any[] = [];
    let calculatedCompletedEarnings = 0;

    for (const t of localStore.trips.values()) {
      const customer = t.customer_id ? localStore.users.get(t.customer_id) : null;
      const enrichedTrip = {
        ...t,
        customer_name: customer?.full_name || 'Safaris Customer',
        customer_phone: customer?.phone || '',
        customer_rating: Number(customer?.rating ?? 5.0),
      };

      if (t.driver_id === driverId) {
        if (['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(t.status)) {
          activeTrip = enrichedTrip;
        } else if (['TRIP_COMPLETED', 'CANCELLED'].includes(t.status)) {
          completedTrips.push(enrichedTrip);
          if (t.status === 'TRIP_COMPLETED' && t.payment_environment !== 'sandbox') {
            calculatedCompletedEarnings += Number(t.fare_ugx || 0) + Number(t.tip_ugx || 0);
          }
        }
      } else if (
        t.status === 'SEARCHING' &&
        !t.driver_id &&
        isApproved &&
        driver?.is_online
      ) {
        const declinedBy: string[] = Array.isArray(t.declined_by) ? t.declined_by : [];
        if (!declinedBy.includes(driverId)) {
          incomingRequests.push(enrichedTrip);
        }
      }
    }

    completedTrips.sort(
      (a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
    );
    incomingRequests.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const activeEnv = (ENV.DPO_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
    const earningsSummary = PayoutService.getBeneficiaryEarningsSummary(driverId, 'driver', activeEnv);
    const completedCount = completedTrips.filter((t) => t.status === 'TRIP_COMPLETED').length;
    const todayEarningsUGX = earningsSummary.availableEarningsUgx;

    return {
      driverId,
      name: user ? user.full_name : 'Driver',
      email: user ? user.email : '',
      phone: user ? user.phone : '',
      rating: Number(user?.rating ?? 5.0),
      totalTrips: Math.max(Number(user?.total_trips ?? 0), completedCount),
      completedTripsCount: completedCount,
      completedTripsToday: completedCount,
      walletBalanceUGX: FinancialService.calculateWalletBalance(driverId, activeEnv),
      earningsSummary,
      isApproved,
      approvalStatus,
      isOnline: driver ? Boolean(driver.is_online) : false,
      isAvailable: driver ? Boolean(driver.is_online && !activeTrip && driver.is_available !== false) : false,
      currentLat: Number(driver?.current_lat ?? 0.3136),
      currentLng: Number(driver?.current_lng ?? 32.5811),
      heading: Number(driver?.heading ?? 0),
      lastPing: driver?.updated_at || null,
      todayEarningsUGX,
      acceptanceRate: Number(driver?.acceptance_rate ?? 98.0),
      vehicle: vehicle
        ? {
            id: vehicle.id,
            tier: vehicle.tier,
            make: vehicle.make,
            model: vehicle.model,
            plate: vehicle.registration_plate,
            color: vehicle.color,
          }
        : null,
      activeTrip,
      incomingRequests: activeTrip ? [] : incomingRequests,
      completedTrips: completedTrips.slice(0, 50),
    };
  }

  public static async cashOut(driverId: string, requestedAmountUgx?: number, idempotencyKey?: string) {
    const driver = this.ensureDriverRecord(driverId);
    const user = localStore.users.get(driverId);
    if (!driver || !user) {
      throw new Error('Driver not found.');
    }

    const activeEnv = (ENV.DPO_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
    const summary = PayoutService.getBeneficiaryEarningsSummary(driverId, 'driver', activeEnv);
    const amountUgx = requestedAmountUgx !== undefined ? Math.round(Number(requestedAmountUgx)) : summary.availableEarningsUgx;
    if (amountUgx <= 0) {
      throw new Error('No verified withdrawable earnings available for cashout.');
    }

    const payoutRequest = await PayoutService.requestWithdrawal({
      userId: driverId,
      beneficiaryRole: 'driver',
      amountUgx,
      accountNumber: user.phone || 'Mobile Money',
      accountName: user.full_name || 'Driver',
      environment: activeEnv,
      idempotencyKey: idempotencyKey || `cashout_${driverId}_${Date.now()}`,
    });

    const executed = await PayoutService.executePayout(payoutRequest.id, driverId);
    driver.today_earnings_ugx = PayoutService.getBeneficiaryEarningsSummary(driverId, 'driver', activeEnv).availableEarningsUgx;
    await db.persistDriver(driver).catch(() => {});

    return {
      success: executed.status === 'COMPLETED' || executed.status === 'MANUAL_DISBURSEMENT_REQUIRED',
      payoutRequestId: executed.id,
      status: executed.status,
      amountUGX: executed.amount_ugx,
      targetPhone: user.phone,
      providerReference: executed.provider_tx_ref,
      message:
        executed.status === 'COMPLETED'
          ? `Dispatched UGX ${executed.amount_ugx.toLocaleString()} to ${user.phone}.`
          : `Withdrawal of UGX ${executed.amount_ugx.toLocaleString()} reserved (${executed.status}): ${executed.failure_reason || 'Awaiting payout provider execution.'}`,
    };
  }
}
