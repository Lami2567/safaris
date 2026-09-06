import { localStore } from '../../config/database';

export class DriverService {
  public static setAvailability(driverId: string, isOnline: boolean) {
    let driver = localStore.drivers.get(driverId);
    if (!driver) {
      driver = {
        id: driverId,
        vehicle_id: null,
        is_online: isOnline,
        is_available: true,
        current_lat: 0.3136,
        current_lng: 32.5811,
        heading: 0,
        license_number: 'UG-DL-NEW',
        license_expiry: '2028-01-01',
        acceptance_rate: 100.0,
        today_earnings_ugx: 0,
      };
      localStore.drivers.set(driverId, driver);
    } else {
      driver.is_online = isOnline;
      if (!isOnline) {
        driver.is_available = false;
      } else {
        driver.is_available = true;
      }
    }

    return {
      driverId,
      isOnline: driver.is_online,
      isAvailable: driver.is_available,
    };
  }

  public static updateLocation(driverId: string, lat: number, lng: number, heading = 0) {
    const driver = localStore.drivers.get(driverId);
    if (driver) {
      driver.current_lat = lat;
      driver.current_lng = lng;
      driver.heading = heading;
    }
    return { driverId, lat, lng, heading };
  }

  public static getNearbyDrivers(lat = 0.3136, lng = 32.5811, radiusKm = 10) {
    const activeDrivers: any[] = [];

    for (const d of localStore.drivers.values()) {
      if (d.is_online) {
        const user = localStore.users.get(d.id);
        const vehicle = d.vehicle_id ? localStore.vehicles.get(d.vehicle_id) : null;

        activeDrivers.push({
          driverId: d.id,
          name: user ? user.full_name : 'Safaris Driver',
          rating: user ? user.rating : 4.9,
          lat: d.current_lat,
          lng: d.current_lng,
          heading: d.heading,
          vehicle: vehicle ? `${vehicle.make} ${vehicle.model}` : 'Vehicle',
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
