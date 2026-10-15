import { db, localStore } from '../../config/database';
import { FleetMovementEngine } from './fleet_movement_engine';

export class DriverService {
  public static setAvailability(driverId: string, isOnline: boolean) {
    const driver = localStore.drivers.get(driverId);
    if (!driver) {
      throw new Error('Driver account not found. Please apply via careers.mumwesafarisuganda.com.');
    }

    if (driver.approval_status !== 'APPROVED' || !driver.is_approved) {
      throw new Error('Driver account is pending admin approval or has been suspended. Please contact Mumwe Safaris dispatch.');
    }

    driver.is_online = isOnline;
    driver.is_available = isOnline;
    driver.updated_at = new Date().toISOString();

    db.persistDriver(driver).catch((err) => console.error('[DriverService.setAvailability persist error]', err));

    return {
      driverId,
      isOnline: driver.is_online,
      isAvailable: driver.is_available,
      approvalStatus: driver.approval_status,
    };
  }

  public static updateLocation(driverId: string, lat: number, lng: number, heading = 0) {
    const driver = localStore.drivers.get(driverId);
    if (!driver) {
      throw new Error('Driver not found.');
    }

    if (driver.approval_status !== 'APPROVED' || !driver.is_approved) {
      throw new Error('Driver account is not approved to transmit live telemetry.');
    }

    driver.current_lat = lat;
    driver.current_lng = lng;
    driver.heading = heading;
    driver.updated_at = new Date().toISOString();

    db.persistDriver(driver).catch((err) => console.error('[DriverService.updateLocation persist error]', err));

    return { driverId, lat, lng, heading };
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

    // Genuine drivers registered, approved, online and available in localStore
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
          plate: vehicle ? vehicle.registration_plate : 'UBM 714K',
        });
      }
    }

    return activeDrivers;
  }

  public static getDriverDashboard(driverId: string) {
    const user = localStore.users.get(driverId);
    const driver = localStore.drivers.get(driverId);
    const vehicle = driver?.vehicle_id ? localStore.vehicles.get(driver.vehicle_id) : null;

    return {
      driverId,
      name: user ? user.full_name : 'Driver',
      phone: user ? user.phone : '',
      rating: user ? user.rating : 4.96,
      totalTrips: user ? user.total_trips : 0,
      isOnline: driver ? driver.is_online : false,
      todayEarningsUGX: driver ? driver.today_earnings_ugx : 0,
      acceptanceRate: driver ? driver.acceptance_rate : 98.0,
      vehicle: vehicle
        ? {
            tier: vehicle.tier,
            make: vehicle.make,
            model: vehicle.model,
            plate: vehicle.registration_plate,
            color: vehicle.color,
          }
        : null,
    };
  }

  public static cashOut(driverId: string) {
    const driver = localStore.drivers.get(driverId);
    const user = localStore.users.get(driverId);
    if (!driver || !user) {
      throw new Error('Driver not found.');
    }

    const payoutAmount = driver.today_earnings_ugx;
    if (payoutAmount <= 0) {
      throw new Error('No earnings available for cashout.');
    }

    driver.today_earnings_ugx = 0;
    user.wallet_balance_ugx += payoutAmount;

    return {
      success: true,
      amountUGX: payoutAmount,
      targetPhone: user.phone,
      message: `Dispatched UGX ${payoutAmount.toLocaleString()} to ${user.phone} via Mobile Money.`,
    };
  }
}
