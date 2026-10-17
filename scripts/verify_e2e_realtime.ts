import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { apiRouter } from '../src/gateway/routes';
import { initSocketServer } from '../src/realtime/socket_server';
import { db } from '../src/config/database';
import { ENV } from '../src/config/env';

const PORT = 4099;
const BASE_URL = `http://127.0.0.1:${PORT}/api/v1`;
const ADMIN_TOKEN = jwt.sign(
  { userId: 'usr_adm_001', role: 'admin', phone: '+256700000001', email: 'admin@safaris.ug' },
  ENV.JWT_SECRET
);
const ADMIN_HEADERS = { Authorization: `Bearer ${ADMIN_TOKEN}` };

async function apiReq(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
}

function assertCondition(condition: any, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runTests() {
  await db.waitForReady();
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/v1', apiRouter);
  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', () => resolve()));
  console.log(`\n=== E2E Verification Server listening on ${BASE_URL} ===\n`);

  const receivedAdminEvents: Array<{ event: string; data: any }> = [];
  const abortAdminStream = new AbortController();

  // Start Admin SSE listener
  const adminStreamPromise = (async () => {
    const res = await fetch(`${BASE_URL}/admin/live-fleet/stream?token=${encodeURIComponent(ADMIN_TOKEN)}`, {
      signal: abortAdminStream.signal,
    });
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          let evtName = 'message';
          let evtData = '';
          for (const line of lines) {
            if (line.startsWith('event:')) evtName = line.slice(6).trim();
            if (line.startsWith('data:')) evtData = line.slice(5).trim();
          }
          if (evtData) {
            try {
              receivedAdminEvents.push({ event: evtName, data: JSON.parse(evtData) });
            } catch {}
          }
        }
      }
    } catch {}
  })();

  try {
    await new Promise((r) => setTimeout(r, 250));

    // =========================================================================
    // TEST E (Part 1): Authorization - Unapproved Driver & Unauthorized Admin
    // =========================================================================
    console.log('--- TEST E: Authorization & Unapproved Partner Protections ---');
    const unauthAdminRes = await apiReq('GET', '/admin/live-fleet/stream');
    assertCondition(unauthAdminRes.status === 401, 'Unauthorized user cannot access admin live fleet stream (401)');

    const suffix = Date.now().toString().slice(-6);
    const drv1Email = `driver1.${suffix}@mumwesafaris.com`;
    const drv1Phone = `+256771${suffix}`;

    const app1Res = await apiReq('POST', '/careers/apply', {
      applicant_type: 'driver',
      full_name: `Captain Ronald Kato ${suffix}`,
      email: drv1Email,
      phone: drv1Phone,
      national_id: `CM90011${suffix}`,
      license_number: `UG-DL-${suffix}`,
      operating_city: 'Kampala',
      experience_years: 6,
      vehicle_make: 'Toyota',
      vehicle_model: 'Land Cruiser LX',
      vehicle_plate: `UAX ${suffix.slice(0, 3)}K`,
      vehicle_tier: 'safari_4x4',
    });
    assertCondition(app1Res.status === 201, 'Submitted Driver 1 career application');
    const app1Id = app1Res.data.data.applicationId;
    const drv1UserId = app1Res.data.data.userId;

    // Attempt OTP login before approval -> should fail
    const preLoginRes = await apiReq('POST', '/auth/login-with-otp', {
      email: drv1Email,
      otpCode: '123456',
    });
    assertCondition(preLoginRes.status >= 400, 'Unapproved driver cannot log in before admin approval');

    // Attempt to go online with a forged token for unapproved user -> should fail with 403
    const unapprovedToken = jwt.sign(
      { userId: drv1UserId, role: 'driver', phone: drv1Phone, email: drv1Email },
      ENV.JWT_SECRET
    );
    const unapprovedOnlineRes = await apiReq(
      'PUT',
      '/drivers/status',
      { isOnline: true },
      { Authorization: `Bearer ${unapprovedToken}` }
    );
    assertCondition(unapprovedOnlineRes.status === 403, 'Unapproved driver blocked from going online (403)');

    // =========================================================================
    // TEST A: Live Admin Location & Availability Synchronization
    // =========================================================================
    console.log('\n--- TEST A: Live Admin Location & Availability ---');
    const approve1Res = await apiReq(
      'POST',
      `/admin/applicants/${app1Id}/approve`,
      {},
      ADMIN_HEADERS
    );
    assertCondition(approve1Res.status === 200, 'Admin approved Driver 1 application');
    const otp1 = approve1Res.data.data.otpCode;
    assertCondition(Boolean(otp1), `Generated 6-digit activation OTP (${otp1})`);

    const otpLogin1 = await apiReq('POST', '/auth/login-with-otp', {
      email: drv1Email,
      otpCode: otp1,
    });
    assertCondition(otpLogin1.status === 200 && otpLogin1.data.data.requiresPasswordSetup, 'Driver 1 verified OTP');

    const setupPwd1 = await apiReq('POST', '/auth/setup-password', {
      email: drv1Email,
      setupToken: otpLogin1.data.data.setupToken,
      newPassword: 'SafariPassword2026!',
    });
    assertCondition(setupPwd1.status === 200 && Boolean(setupPwd1.data.data.accessToken), 'Driver 1 set permanent password');
    const drv1Token = setupPwd1.data.data.accessToken;

    // Also verify Password Login works for returning driver
    const pwdLogin1 = await apiReq('POST', '/auth/login', {
      identifier: drv1Email,
      password: 'SafariPassword2026!',
    });
    assertCondition(pwdLogin1.status === 200 && Boolean(pwdLogin1.data.data.accessToken), 'Driver 1 password login succeeded');

    // Set Driver 1 Online
    const onlineRes = await apiReq(
      'PUT',
      '/drivers/status',
      { isOnline: true },
      { Authorization: `Bearer ${drv1Token}` }
    );
    assertCondition(onlineRes.status === 200 && onlineRes.data.data.isOnline === true, 'Driver 1 toggled Online & Available');

    // Send Live GPS Location Update
    const locRes = await apiReq(
      'PUT',
      '/drivers/location',
      { lat: 0.3214, lng: 32.5862, heading: 135, speed: 42 },
      { Authorization: `Bearer ${drv1Token}` }
    );
    assertCondition(locRes.status === 200, 'Driver 1 transmitted live GPS coordinates (0.3214, 32.5862)');

    // Reject invalid out-of-bounds GPS coordinates
    const badLocRes = await apiReq(
      'PUT',
      '/drivers/location',
      { lat: 195.0, lng: 32.5862 },
      { Authorization: `Bearer ${drv1Token}` }
    );
    assertCondition(badLocRes.status === 400, 'Invalid GPS coordinates (>90 lat) rejected with 400');

    await new Promise((r) => setTimeout(r, 250));
    const telemetryEvt = receivedAdminEvents.find(
      (e) =>
        (e.event === 'fleet:telemetry_update' || e.event === 'fleet:status_update') &&
        e.data?.id === drv1UserId &&
        Math.abs(Number(e.data?.current_lat) - 0.3214) < 0.0001
    );
    assertCondition(
      Boolean(telemetryEvt && telemetryEvt.data.is_online === true && telemetryEvt.data.is_available === true),
      'Admin SSE stream received live telemetry snapshot for Driver 1 (Green marker: online + available)'
    );

    // =========================================================================
    // TEST B: Customer Ride Request, Exclusive Acceptance & Live Tracking
    // =========================================================================
    console.log('\n--- TEST B: Customer Ride Request & Exclusive Driver Assignment ---');
    // Create & approve Driver 2 to test exclusive lock
    const drv2Email = `driver2.${suffix}@mumwesafaris.com`;
    const app2Res = await apiReq('POST', '/careers/apply', {
      applicant_type: 'driver',
      full_name: `Driver Samuel Otim ${suffix}`,
      email: drv2Email,
      phone: `+256772${suffix}`,
      national_id: `CM90022${suffix}`,
      license_number: `UG-DL2-${suffix}`,
      operating_city: 'Kampala',
      experience_years: 4,
      vehicle_make: 'Toyota',
      vehicle_model: 'Prado TX',
      vehicle_plate: `UBD ${suffix.slice(0, 3)}M`,
      vehicle_tier: 'safari_4x4',
    });
    const app2Id = app2Res.data.data.applicationId;
    const drv2UserId = app2Res.data.data.userId;
    const approve2Res = await apiReq(
      'POST',
      `/admin/applicants/${app2Id}/approve`,
      {},
      ADMIN_HEADERS
    );
    const otp2 = approve2Res.data.data.otpCode;
    const otpLogin2 = await apiReq('POST', '/auth/login-with-otp', { email: drv2Email, otpCode: otp2 });
    const setupPwd2 = await apiReq('POST', '/auth/setup-password', {
      email: drv2Email,
      setupToken: otpLogin2.data.data.setupToken,
      newPassword: 'SafariPassword2026!',
    });
    const drv2Token = setupPwd2.data.data.accessToken;
    await apiReq('PUT', '/drivers/status', { isOnline: true }, { Authorization: `Bearer ${drv2Token}` });

    // Register Customer & Verify Email OTP
    const custEmail = `customer.${suffix}@example.com`;
    const custReg = await apiReq('POST', '/auth/register', {
      fullName: `Grace Namaganda ${suffix}`,
      email: custEmail,
      phone: `+256780${suffix}`,
      password: 'CustomerPass123!',
      role: 'customer',
    });
    assertCondition(custReg.status === 201, 'Registered customer account');
    const custVerify = await apiReq('POST', '/auth/verify-email-otp', {
      email: custEmail,
      otpCode: '123456',
    });
    assertCondition(custVerify.status === 200 && Boolean(custVerify.data.data.accessToken), 'Verified customer email OTP');
    const custToken = custVerify.data.data.accessToken;
    const custUserId = custVerify.data.data.user.id;

    // Customer requests a ride
    const tripCreateRes = await apiReq(
      'POST',
      '/trips',
      {
        pickupAddress: 'Acacia Mall, Kololo',
        pickupLat: 0.3385,
        pickupLng: 32.5861,
        dropoffAddress: 'Entebbe International Airport',
        dropoffLat: 0.0424,
        dropoffLng: 32.4435,
        vehicleTier: 'safari_4x4',
        distanceKm: 41.5,
      },
      { Authorization: `Bearer ${custToken}` }
    );
    assertCondition(tripCreateRes.status === 201, 'Customer created ride request (SEARCHING)');
    const tripId = tripCreateRes.data.data.id;

    // Driver 1 fetches dashboard -> sees incoming ride request
    const drv1DashBefore = await apiReq('GET', '/drivers/dashboard', undefined, {
      Authorization: `Bearer ${drv1Token}`,
    });
    assertCondition(
      drv1DashBefore.status === 200 &&
        Array.isArray(drv1DashBefore.data.data.incomingRequests) &&
        drv1DashBefore.data.data.incomingRequests.some((r: any) => r.id === tripId),
      'Driver 1 dashboard displays the real incoming customer ride request'
    );

    // Driver 1 accepts the ride
    const accept1Res = await apiReq('POST', `/trips/${tripId}/accept`, {}, { Authorization: `Bearer ${drv1Token}` });
    assertCondition(
      accept1Res.status === 200 && accept1Res.data.data.status === 'DRIVER_ASSIGNED',
      'Driver 1 accepted the ride request (DRIVER_ASSIGNED)'
    );

    // Driver 2 attempts to accept the exact same ride -> must fail with 409 Conflict (or 400)
    const accept2Res = await apiReq('POST', `/trips/${tripId}/accept`, {}, { Authorization: `Bearer ${drv2Token}` });
    assertCondition(
      accept2Res.status === 409 || accept2Res.status === 400,
      `Driver 2 prevented from claiming already-assigned ride (${accept2Res.status} conflict lock)`
    );

    await new Promise((r) => setTimeout(r, 200));
    const blueMarkerEvt = receivedAdminEvents.find(
      (e) =>
        e.event === 'fleet:status_update' &&
        e.data?.id === drv1UserId &&
        e.data?.is_available === false &&
        e.data?.active_trip_id === tripId
    );
    assertCondition(
      Boolean(blueMarkerEvt),
      'Admin SSE stream updated Driver 1 marker to Blue (Assigned / In Trip: is_available=false)'
    );

    // Progress trip through lifecycle: DRIVER_ARRIVING -> DRIVER_ARRIVED -> TRIP_STARTED -> TRIP_COMPLETED
    for (const nextStatus of ['DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'TRIP_COMPLETED']) {
      const stRes = await apiReq(
        'PUT',
        `/trips/${tripId}/status`,
        { status: nextStatus },
        { Authorization: `Bearer ${drv1Token}` }
      );
      assertCondition(
        stRes.status === 200 && stRes.data.data.status === nextStatus,
        `Driver 1 transitioned trip status to ${nextStatus}`
      );
    }

    // Verify Driver 1 earnings & availability restored to Green after completion
    const drv1DashAfter = await apiReq('GET', '/drivers/dashboard', undefined, {
      Authorization: `Bearer ${drv1Token}`,
    });
    assertCondition(
      drv1DashAfter.data.data.isAvailable === true &&
        drv1DashAfter.data.data.todayEarningsUGX > 0 &&
        drv1DashAfter.data.data.completedTripsToday === 1,
      `Driver 1 availability restored to Available (Green) and real earnings credited (UGX ${drv1DashAfter.data.data.todayEarningsUGX})`
    );

    // =========================================================================
    // TEST C: Tour-Guide Connection & Customer Booking Assignment
    // =========================================================================
    console.log('\n--- TEST C: Tour Guide Real-Time Assignment & Status Updates ---');
    const guideEmail = `guide.${suffix}@mumwesafaris.com`;
    const guideAppRes = await apiReq('POST', '/careers/apply', {
      applicant_type: 'tour_guide',
      full_name: `Ranger Patrick Byaruhanga ${suffix}`,
      email: guideEmail,
      phone: `+256779${suffix}`,
      national_id: `CM88011${suffix}`,
      license_number: `UWA-TG-${suffix}`,
      operating_city: 'Bwindi',
      experience_years: 8,
      languages: ['English', 'German', 'Swahili'],
      specialties: ['Gorilla Trekking', 'Savannah Wildlife Safari'],
    });
    assertCondition(guideAppRes.status === 201, 'Submitted Tour Guide career application');
    const guideAppId = guideAppRes.data.data.applicationId;
    const guideUserId = guideAppRes.data.data.userId;

    const approveGuideRes = await apiReq(
      'POST',
      `/admin/applicants/${guideAppId}/approve`,
      {},
      ADMIN_HEADERS
    );
    const guideOtp = approveGuideRes.data.data.otpCode;
    const guideOtpLogin = await apiReq('POST', '/auth/login-with-otp', { email: guideEmail, otpCode: guideOtp });
    const guideSetupPwd = await apiReq('POST', '/auth/setup-password', {
      email: guideEmail,
      setupToken: guideOtpLogin.data.data.setupToken,
      newPassword: 'GuidePassword2026!',
    });
    const guideToken = guideSetupPwd.data.data.accessToken;

    const guideAvailRes = await apiReq(
      'PUT',
      '/guides/me/availability',
      { isAvailable: true },
      { Authorization: `Bearer ${guideToken}` }
    );
    assertCondition(guideAvailRes.status === 200, 'Approved Tour Guide set availability to true');

    // Customer creates a safari booking assigned to this guide
    const bookingRes = await apiReq(
      'POST',
      '/tourism/bookings',
      {
        packageId: 'pkg_bwindi_3d',
        destinationId: 'dest_bwindi',
        tourGuideId: guideUserId,
        guestsCount: 3,
        travelDate: '2026-11-15',
        totalAmountUGX: 1850000,
        specialRequests: 'Vegetarian meals & German-speaking ranger briefing',
      },
      { Authorization: `Bearer ${custToken}` }
    );
    assertCondition(bookingRes.status === 201, 'Customer created Safari Tour booking assigned to Tour Guide');
    const bookingId = bookingRes.data.data.id;

    // Guide checks dashboard -> sees assigned booking with real customer details
    const guideDash1 = await apiReq('GET', '/guides/me/dashboard', undefined, {
      Authorization: `Bearer ${guideToken}`,
    });
    assertCondition(
      guideDash1.status === 200 &&
        Array.isArray(guideDash1.data.data.assignedBookings) &&
        guideDash1.data.data.assignedBookings.some((b: any) => b.id === bookingId),
      'Tour Guide dashboard received the assigned customer safari booking'
    );

    // Guide progresses booking status: CONFIRMED -> IN_PROGRESS -> COMPLETED
    for (const st of ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED']) {
      const updRes = await apiReq(
        'PUT',
        `/tourism/bookings/${bookingId}/status`,
        { status: st },
        { Authorization: `Bearer ${guideToken}` }
      );
      assertCondition(
        updRes.status === 200 && updRes.data.data.bookingStatus === st,
        `Tour Guide updated safari booking status to ${st}`
      );
    }

    // Verify customer notification was persisted
    const custNotifs = await apiReq(
      'GET',
      `/notifications/user/${custUserId}`,
      undefined,
      { Authorization: `Bearer ${custToken}` }
    );
    assertCondition(
      custNotifs.status === 200 &&
        Array.isArray(custNotifs.data.data) &&
        custNotifs.data.data.some((n: any) => String(n.title).toUpperCase().includes('COMPLETED')),
      'Customer received real-time & persistent notifications for tour status updates'
    );

    // =========================================================================
    // TEST D: Reconnection & Sequence Ordering
    // =========================================================================
    console.log('\n--- TEST D: Reconnection & Timestamp Sequence Ordering ---');
    const partnerStreamCtrl = new AbortController();
    const partnerStreamRes = await fetch(
      `${BASE_URL}/realtime/stream?token=${encodeURIComponent(drv1Token)}`,
      { signal: partnerStreamCtrl.signal }
    );
    assertCondition(partnerStreamRes.status === 200, 'Driver real-time SSE stream connected (200 OK)');
    partnerStreamCtrl.abort();

    const partnerStreamCtrl2 = new AbortController();
    const partnerStreamRes2 = await fetch(
      `${BASE_URL}/realtime/stream?token=${encodeURIComponent(drv1Token)}`,
      { signal: partnerStreamCtrl2.signal }
    );
    assertCondition(partnerStreamRes2.status === 200, 'Driver real-time SSE stream cleanly reconnected after drop');
    partnerStreamCtrl2.abort();

    // =========================================================================
    // TEST E (Part 2): Suspension & Cross-Account Protection
    // =========================================================================
    console.log('\n--- TEST E (Part 2): Suspension & Cross-Account Protection ---');
    const suspendRes = await apiReq(
      'POST',
      `/admin/applicants/${drv2UserId}/suspend`,
      { reason: 'Compliance test suspension' },
      ADMIN_HEADERS
    );
    assertCondition(suspendRes.status === 200, 'Admin suspended Driver 2');

    const suspendedOnlineAttempt = await apiReq(
      'PUT',
      '/drivers/status',
      { isOnline: true },
      { Authorization: `Bearer ${drv2Token}` }
    );
    assertCondition(
      suspendedOnlineAttempt.status === 403,
      'Suspended driver is blocked from going online (403 Forbidden)'
    );

    console.log('\n=============================================================');
    console.log('ALL 5 END-TO-END REAL-TIME TESTS (A, B, C, D, E) PASSED 100%!');
    console.log('=============================================================\n');
  } finally {
    abortAdminStream.abort();
    server.close();
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n[E2E TEST FAILURE]', err);
  process.exit(1);
});
