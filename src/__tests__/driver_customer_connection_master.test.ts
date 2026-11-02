process.env.NODE_ENV = 'test';
import jwt from 'jsonwebtoken';
import { db, localStore } from '../config/database';
import { ENV } from '../config/env';
import { TripService } from '../services/trip/trip.service';
import { DriverService } from '../services/driver/driver.service';
import { validateAuthSession } from '../gateway/auth_middleware';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed++;
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passed++;
  console.log(`  ✅ PASSED: ${message}`);
}

async function runDriverCustomerConnectionMasterSuite() {
  console.log('\n===================================================================');
  console.log('🚘 MASTER TEST SUITE: DRIVER-CUSTOMER CONNECTION & REALTIME RELIABILITY');
  console.log('===================================================================\n');

  const jwtSecret = ENV.JWT_SECRET || 'test_jwt_secret_safaris_super_secure_32chars_min';
  const customerId = `cust_real_${Date.now()}`;
  const driver1Id = `drv_real_1_${Date.now()}`;
  const driver2Id = `drv_real_2_${Date.now()}`;
  const hackerId = `user_hacker_${Date.now()}`;

  // 1. Seed users
  const customerUser = {
    id: customerId,
    full_name: 'Grace Namubiru',
    phone: '+256770112233',
    email: 'grace.namubiru@example.com',
    role: 'customer',
    rating: 4.9,
    total_trips: 12,
    is_verified: true,
  };
  const driver1User = {
    id: driver1Id,
    full_name: 'David Kato',
    phone: '+256771445566',
    email: 'david.kato@mumwesafarisuganda.com',
    role: 'driver',
    approval_status: 'APPROVED',
    rating: 4.95,
    total_trips: 45,
    is_verified: true,
  };
  const driver2User = {
    id: driver2Id,
    full_name: 'Samuel Ssemwogerere',
    phone: '+256772778899',
    email: 'samuel.s@mumwesafarisuganda.com',
    role: 'driver',
    approval_status: 'APPROVED',
    rating: 4.88,
    total_trips: 80,
    is_verified: true,
  };
  localStore.users.set(customerId, customerUser);
  localStore.users.set(driver1Id, driver1User);
  localStore.users.set(driver2Id, driver2User);
  await db.persistUser(customerUser);
  await db.persistUser(driver1User);
  await db.persistUser(driver2User);

  // Seed vehicles
  localStore.vehicles.set(`veh_${driver1Id}`, {
    id: `veh_${driver1Id}`,
    driver_id: driver1Id,
    make: 'Toyota',
    model: 'Land Cruiser Safari 4x4',
    tier: 'safari4x4',
    registration_plate: 'UBK 101S',
    color: 'Safari Green',
  });
  localStore.vehicles.set(`veh_${driver2Id}`, {
    id: `veh_${driver2Id}`,
    driver_id: driver2Id,
    make: 'Toyota',
    model: 'Corolla Cross',
    tier: 'go',
    registration_plate: 'UBM 202G',
    color: 'White',
  });

  // Seed drivers
  localStore.drivers.set(driver1Id, {
    id: driver1Id,
    vehicle_id: `veh_${driver1Id}`,
    is_online: true,
    is_available: true,
    is_approved: true,
    approval_status: 'APPROVED',
    current_lat: 0.3150,
    current_lng: 32.5820,
    heading: 90,
    speed: 0,
    updated_at: new Date().toISOString(),
  });
  localStore.drivers.set(driver2Id, {
    id: driver2Id,
    vehicle_id: `veh_${driver2Id}`,
    is_online: true,
    is_available: true,
    is_approved: true,
    approval_status: 'APPROVED',
    current_lat: 0.3200,
    current_lng: 32.5850,
    heading: 180,
    speed: 0,
    updated_at: new Date().toISOString(),
  });

  // -------------------------------------------------------------------------
  // TEST 1: JWT Socket Handshake Authentication & Identity Derivation
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Socket Authentication & Identity Verification ---');
  const validToken = jwt.sign({ userId: customerId, role: 'customer', scope: 'access' }, jwtSecret, { expiresIn: '1h' });
  const authResValid = await validateAuthSession(validToken);
  assert(authResValid.valid === true, 'Valid JWT handshake token is verified');
  assert(authResValid.payload?.userId === customerId, 'Extracted userId matches token payload');
  assert(authResValid.payload?.role === 'customer', 'Extracted role matches customer');

  const authResEmpty = await validateAuthSession('');
  assert(authResEmpty.valid === false, 'Empty or omitted token is rejected');

  const authResTampered = await validateAuthSession(validToken + '_corrupted');
  assert(authResTampered.valid === false, 'Tampered token signature is rejected');

  // -------------------------------------------------------------------------
  // TEST 2: Real Trip Creation with Verified Uganda Coordinates
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Real Trip Creation & Searching Status ---');
  const trip = await TripService.createTrip({
    customerId,
    pickupTitle: 'Kampala Sheraton Hotel',
    pickupAddress: 'Ternan Avenue, Kampala Central',
    pickupLat: 0.31628,
    pickupLng: 32.58219,
    destTitle: 'Entebbe International Airport',
    destAddress: 'Airport Road, Entebbe Municipality',
    destLat: 0.0424,
    destLng: 32.4435,
    vehicleTier: 'go',
    serviceType: 'RIDE',
    paymentMethod: 'MTN Mobile Money',
    distanceKm: 42.5,
  });

  assert(trip.id.startsWith('trp_'), 'Trip ID generated with trp_ prefix');
  assert(trip.status === 'SEARCHING', 'Trip starts in SEARCHING status');
  assert(trip.customer_id === customerId, 'Customer ID linked correctly');
  assert(trip.driver_id === null || trip.driver_id === undefined, 'Trip begins without assigned driver');

  // -------------------------------------------------------------------------
  // TEST 3: Atomic Driver Acceptance & Concurrency Race Condition Safety
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Atomic Driver Acceptance & Anti-Double-Booking ---');
  
  // Driver 1 accepts the trip
  const acceptResult = await TripService.acceptTrip(trip.id, driver1Id);
  assert(acceptResult.status === 'DRIVER_ASSIGNED', 'Driver 1 successfully accepted trip');
  assert(acceptResult.driver.driverId === driver1Id, 'Assigned driver matches Driver 1');
  assert(acceptResult.driver.vehicleModel.includes('Land Cruiser'), 'Vehicle model enriched');
  assert(localStore.trips.get(trip.id).status === 'DRIVER_ASSIGNED', 'LocalStore trip status updated to DRIVER_ASSIGNED');
  assert(localStore.drivers.get(driver1Id).is_available === false, 'Driver 1 marked unavailable while on trip');

  // Driver 2 attempts to accept the SAME trip concurrently
  let driver2Rejected = false;
  try {
    await TripService.acceptTrip(trip.id, driver2Id);
  } catch (err: any) {
    driver2Rejected = true;
    assert(
      err.message.includes('no longer searching') || err.message.includes('accepted'),
      `Driver 2 rejected with conflict error: "${err.message}"`
    );
  }
  assert(driver2Rejected, 'Second driver cannot accept an already assigned trip');

  // Busy driver cannot accept another request
  const trip2 = await TripService.createTrip({
    customerId,
    pickupTitle: 'Acacia Mall',
    pickupAddress: 'Kisementi, Kololo',
    pickupLat: 0.3345,
    pickupLng: 32.5890,
    destTitle: 'Lugogo Cricket Oval',
    destAddress: 'Lugogo Bypass',
    destLat: 0.3270,
    destLng: 32.6020,
    vehicleTier: 'go',
    distanceKm: 3.5,
  });

  let busyDriverBlocked = false;
  try {
    await TripService.acceptTrip(trip2.id, driver1Id);
  } catch (err: any) {
    busyDriverBlocked = true;
    assert(err.message.includes('already have an active trip'), `Busy driver blocked: "${err.message}"`);
  }
  assert(busyDriverBlocked, 'Driver currently on active trip cannot accept concurrent second trip');

  // Clean up trip2
  localStore.trips.delete(trip2.id);

  // -------------------------------------------------------------------------
  // TEST 4: Telemetry Location Streaming & Remaining Distance / ETA
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Driver GPS Telemetry Stream & ETA Calculation ---');
  const telemetry = TripService.updateDriverLocation(
    trip.id,
    0.3160,
    32.5820,
    180,
    driver1Id
  );
  assert(telemetry.tripId === trip.id, 'Telemetry tripId matched');
  assert(telemetry.driverId === driver1Id, 'Telemetry driverId matched');
  assert(telemetry.remainingDistanceKm >= 0, `Remaining distance calculated: ${telemetry.remainingDistanceKm} km`);
  assert(telemetry.etaMinutes >= 1, `ETA minutes calculated: ${telemetry.etaMinutes} mins`);
  assert(telemetry.targetStage === 'TO_PICKUP', 'Telemetry targets pickup before trip start');

  // Third-party driver cannot push location to another driver's trip
  let unauthorizedTelemetryBlocked = false;
  try {
    TripService.updateDriverLocation(trip.id, 0.3160, 32.5820, 180, driver2Id);
  } catch (err: any) {
    unauthorizedTelemetryBlocked = true;
    assert(err.message.includes('Unauthorized'), 'Unauthorized driver blocked from updating trip location');
  }
  assert(unauthorizedTelemetryBlocked, 'Third-party driver location rejected');

  // -------------------------------------------------------------------------
  // TEST 5: Complete Trip Lifecycle Progression & Status Validation
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Step-by-Step Trip Progression ---');
  // 1. DRIVER_ASSIGNED -> DRIVER_ARRIVING
  const s1 = TripService.updateTripStatus(trip.id, 'DRIVER_ARRIVING', driver1Id, 'driver');
  assert(s1.status === 'DRIVER_ARRIVING', 'Transitioned to DRIVER_ARRIVING');

  // 2. DRIVER_ARRIVING -> DRIVER_ARRIVED
  const s2 = TripService.updateTripStatus(trip.id, 'DRIVER_ARRIVED', driver1Id, 'driver');
  assert(s2.status === 'DRIVER_ARRIVED', 'Transitioned to DRIVER_ARRIVED');
  assert(Boolean(localStore.trips.get(trip.id).driver_arrived_at), 'Driver arrived timestamp recorded');

  // 3. DRIVER_ARRIVED -> TRIP_STARTED
  const s3 = TripService.updateTripStatus(trip.id, 'TRIP_STARTED', driver1Id, 'driver');
  assert(s3.status === 'TRIP_STARTED', 'Transitioned to TRIP_STARTED');

  // In-transit telemetry now targets DESTINATION
  const inTransitTelemetry = TripService.updateDriverLocation(trip.id, 0.2500, 32.5400, 200, driver1Id);
  assert(inTransitTelemetry.targetStage === 'TO_DESTINATION', 'Telemetry targets destination during TRIP_STARTED');

  // Invalid transition rejection (e.g. attempting to jump back to DRIVER_ARRIVING)
  let invalidTransitionBlocked = false;
  try {
    TripService.updateTripStatus(trip.id, 'DRIVER_ARRIVING', driver1Id, 'driver');
  } catch (err: any) {
    invalidTransitionBlocked = true;
    assert(err.message.includes('Invalid trip status transition'), 'Illegal status regression prevented');
  }
  assert(invalidTransitionBlocked, 'Invalid lifecycle transition rejected');

  // 4. TRIP_STARTED -> TRIP_COMPLETED
  const s4 = TripService.updateTripStatus(trip.id, 'TRIP_COMPLETED', driver1Id, 'driver');
  assert(s4.status === 'TRIP_COMPLETED', 'Transitioned to TRIP_COMPLETED');
  assert(localStore.drivers.get(driver1Id).is_available === true, 'Driver marked available again after trip completion');

  // -------------------------------------------------------------------------
  // TEST 6: Emergency SOS Incident Dispatch & Ownership
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Emergency SOS Event Dispatch ---');
  // Customer triggers SOS
  const customerSos = await TripService.triggerSos(
    trip.id,
    customerId,
    'customer',
    'Customer pressed emergency button',
    { lat: 0.2500, lng: 32.5400 }
  );
  assert(customerSos.success === true, 'Customer SOS triggered successfully');
  assert(customerSos.incidentId.startsWith('sos_'), 'Incident ID generated');
  assert(customerSos.sosPayload.role === 'customer', 'Role logged as customer');

  // Driver triggers SOS
  const driverSos = await TripService.triggerSos(
    trip.id,
    driver1Id,
    'driver',
    'Driver report road incident'
  );
  assert(driverSos.success === true, 'Driver SOS triggered successfully');
  assert(driverSos.sosPayload.role === 'driver', 'Role logged as driver');

  // Unrelated user cannot trigger SOS on this trip
  let hackerSosBlocked = false;
  try {
    await TripService.triggerSos(trip.id, hackerId, 'customer', 'Unauthorized SOS trigger');
  } catch (err: any) {
    hackerSosBlocked = true;
    assert(err.message.includes('Unauthorized'), 'Unauthorized third-party SOS trigger blocked');
  }
  assert(hackerSosBlocked, 'Non-participant blocked from triggering SOS');

  // -------------------------------------------------------------------------
  // TEST 7: Driver Dashboard Real-Time Statistics & No Fake Kampala Coordinates
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 7: Driver Dashboard Stats & Clean Telemetry Defaults ---');
  // New uninitialized driver record has NULL coordinates, not fake Kampala (0.3136, 32.5811)
  const newDriverId = `drv_fresh_${Date.now()}`;
  localStore.users.set(newDriverId, {
    id: newDriverId,
    full_name: 'Fresh Driver',
    phone: '+256770000999',
    email: 'fresh@safaris.ug',
    role: 'driver',
    approval_status: 'APPROVED',
  });
  const freshRecord = DriverService.ensureDriverRecord(newDriverId);
  assert(freshRecord.current_lat === null, 'Initial driver record has NULL current_lat (no fake Kampala coords)');
  assert(freshRecord.current_lng === null, 'Initial driver record has NULL current_lng (no fake Kampala coords)');

  const freshDashboard = DriverService.getDriverDashboard(newDriverId);
  assert(freshDashboard.currentLat === null, 'Dashboard currentLat is null when no GPS recorded');
  assert(freshDashboard.currentLng === null, 'Dashboard currentLng is null when no GPS recorded');
  assert(freshDashboard.completedTripsToday === 0, 'Fresh driver has 0 completed trips today');
  assert(freshDashboard.todayEarningsUGX === 0, 'Fresh driver has 0 earnings today');

  // Driver 1 completed 1 trip today
  const d1Dashboard = DriverService.getDriverDashboard(driver1Id);
  assert(d1Dashboard.completedTripsCount >= 1, `Driver 1 completedTripsCount is ${d1Dashboard.completedTripsCount}`);
  assert(d1Dashboard.completedTripsToday >= 1, `Driver 1 completedTripsToday is ${d1Dashboard.completedTripsToday}`);
  assert(d1Dashboard.rating === 4.95, `Driver 1 rating reflects actual user rating: ${d1Dashboard.rating}`);

  // -------------------------------------------------------------------------
  // TEST 8: Data Integrity — Absolute Absence of Stale Test Fixtures
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 8: Data Integrity & Absence of Stale Test Records ---');
  const persistentFiles = [
    'persistent_bookings.json',
    'persistent_payments.json',
    'persistent_platform_earnings.json',
    'persistent_refunds.json',
    'persistent_wallet_transactions.json',
  ];
  const forbiddenIds = ['usr_cust_test_1', 'usr_drv_test_1', 'usr_gd_test_1', 'usr_race_test'];

  for (const pf of persistentFiles) {
    const fullPath = path.resolve(__dirname, '../../', pf);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const fid of forbiddenIds) {
        assert(!content.includes(fid), `${pf} contains NO occurrence of stale fixture "${fid}"`);
      }
      assert(!/usr_stress_/.test(content), `${pf} contains NO occurrence of sandbox stress test records`);
    }
  }

  // Clean up test records
  localStore.trips.delete(trip.id);
  localStore.drivers.delete(driver1Id);
  localStore.drivers.delete(driver2Id);
  localStore.drivers.delete(newDriverId);
  localStore.users.delete(customerId);
  localStore.users.delete(driver1Id);
  localStore.users.delete(driver2Id);
  localStore.users.delete(newDriverId);

  console.log('\n===================================================================');
  console.log(`🎉 ALL ${passed} VERIFICATION ASSERTIONS PASSED WITH ZERO FAILURES!`);
  console.log('===================================================================\n');
}

runDriverCustomerConnectionMasterSuite().catch((err) => {
  console.error('Fatal error in driver-customer connection test suite:', err);
  process.exit(1);
});
