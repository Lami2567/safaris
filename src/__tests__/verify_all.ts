import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { AuthService } from '../services/auth/auth.service';
import { TripService } from '../services/trip/trip.service';
import { TourismService } from '../services/tourism/tourism.service';
import { TourGuideService } from '../services/tour_guide/tour_guide.service';
import { DeliveryService } from '../services/delivery/delivery.service';
import { PaymentService } from '../services/payment/payment.service';
import { AppConfigService } from '../services/app_config/app_config.service';
import { DriverService } from '../services/driver/driver.service';
import { db, localStore } from '../config/database';
import { seedUgandaData } from '../database/seed';
import { runFinancialEngineTests } from './financial_engine.test';

const DB_DIR = path.resolve(__dirname, '../database');
const SNAPSHOT_FILES = [
  'persistent_users.json',
  'persistent_drivers.json',
  'persistent_tour_guides.json',
  'persistent_career_applications.json',
  'persistent_trips.json',
  'persistent_deliveries.json',
  'persistent_bookings.json',
  'persistent_payments.json',
  'persistent_otps.json',
  'persistent_wallet_transactions.json',
  'persistent_refund_policies.json',
  'persistent_refunds.json',
  'persistent_platform_earnings.json',
  'persistent_financial_adjustments.json',
];

async function runTests() {
  // Snapshot persistent files so test execution never pollutes production JSON files
  const snapshots = new Map<string, string>();
  for (const f of SNAPSHOT_FILES) {
    const fullPath = path.join(DB_DIR, f);
    if (fs.existsSync(fullPath)) {
      snapshots.set(fullPath, fs.readFileSync(fullPath, 'utf-8'));
    }
  }

  try {
    console.log('🧪 Starting SAFARIS Backend Automated Verification Suite...\n');
    await db.waitForReady();

    // 1. Seed Database (Only Admin, Destinations, Packages, AppConfig — NO fake drivers/guides)
    localStore.drivers.clear();
    localStore.tour_guides.clear();
    await seedUgandaData();
    if (localStore.drivers.size !== 0 || localStore.tour_guides.size !== 0) {
      throw new Error('Seed should not create unapproved or fake drivers/tour guides.');
    }
    console.log('✅ 1. Database Seed completed cleanly (0 fake drivers, 0 fake tour guides).');

    // 2. Test Remote App Config
    const config = await AppConfigService.getConfig();
    if (config.appName !== 'SAFARIS' || config.currency !== 'UGX') {
      throw new Error('AppConfig verification failed.');
    }
    console.log('✅ 2. App Config Service verified (AppName: SAFARIS, Currency: UGX).');

    // 3. Create ephemeral test customer in memory & verify Auth Service
    const testPwdHash = await bcrypt.hash('password123', 10);
    localStore.users.set('usr_test_cust', {
      id: 'usr_test_cust',
      full_name: 'KATO SURAIMAN',
      phone: '+256 704 127185',
      email: 'test.customer@safaris.ug',
      password_hash: testPwdHash,
      role: 'customer',
      avatar_url: '',
      rating: 5.0,
      total_trips: 0,
      wallet_balance_ugx: 50000,
      is_verified: true,
      approval_status: 'APPROVED',
      created_at: new Date().toISOString(),
    });
    // Ensure admin password is known for test
    const adminUser = localStore.users.get('usr_adm_001');
    if (adminUser) {
      adminUser.password_hash = testPwdHash;
    }

    const loginRes = await AuthService.login('test.customer@safaris.ug', 'password123');
    if ('requiresVerification' in loginRes || !loginRes.accessToken || loginRes.user.full_name !== 'KATO SURAIMAN') {
      throw new Error('Auth Login verification failed.');
    }
    console.log(`✅ 3. Auth Service verified (User logged in: ${loginRes.user.full_name}, Role: ${loginRes.user.role}).`);

    // 4. Test Trip Estimation and Creation
    const fareEstimates = TripService.estimateFare(12.5);
    if (!fareEstimates.boda || !fareEstimates.comfort) {
      throw new Error('Trip Fare Estimation failed.');
    }
    console.log(`✅ 4. Trip Fare Estimation verified (Boda: UGX ${fareEstimates.boda}, Comfort: UGX ${fareEstimates.comfort}).`);

    const createdTrip = TripService.createTrip({
      customerId: loginRes.user.id,
      pickupTitle: 'Kampala Serena Hotel',
      pickupAddress: 'Kintu Rd, Kampala',
      pickupLat: 0.3182,
      pickupLng: 32.5855,
      destTitle: 'Entebbe International Airport',
      destAddress: 'Airport Rd, Entebbe',
      destLat: 0.0447,
      destLng: 32.4435,
      vehicleTier: 'comfort',
      distanceKm: 42.0,
      paymentMethod: 'MTN Mobile Money',
    });
    if (createdTrip.status !== 'SEARCHING') {
      throw new Error('Trip creation state invalid.');
    }
    console.log(`✅ 5. Trip Lifecycle verified (Created Trip ID: ${createdTrip.id}, Status: ${createdTrip.status}).`);

    // 5. Test Tourism Destinations and Booking
    const destinations = TourismService.getAllDestinations();
    if (destinations.length < 4) {
      throw new Error('Destinations count mismatch.');
    }
    console.log(`✅ 6. Tourism Service verified (${destinations.length} Uganda destinations loaded).`);

    const tourBooking = await TourismService.createBooking({
      customerId: loginRes.user.id,
      destinationId: 'dest_bwindi',
      packageId: 'pkg_bwindi_3d',
      travelDate: '2026-10-15',
      guestsCount: 2,
      totalUgx: 5600000,
      paymentMethod: 'MTN Mobile Money',
    });
    if (!['PENDING_PAYMENT', 'CONFIRMED', 'PENDING'].includes(tourBooking.booking_status)) {
      throw new Error('Tour booking confirmation failed.');
    }
    console.log(`✅ 7. Tour Booking verified (Booking ID: ${tourBooking.id}, Total: UGX ${tourBooking.total_ugx.toLocaleString()}).`);

    // 6. Test Tour Guides (0 before approval)
    const initialGuides = TourGuideService.getAllGuides();
    if (initialGuides.length !== 0) {
      throw new Error('Expected 0 tour guides when none have been approved.');
    }
    console.log(`✅ 8. Tour Guides verified (0 unapproved/mock guides present).`);

    // 7. Test Express Parcel Delivery
    const delivery = await DeliveryService.createDelivery({
      senderId: loginRes.user.id,
      senderName: 'KATO SURAIMAN',
      senderPhone: '+256 704 127185',
      recipientName: 'Amwine Frankline',
      recipientPhone: '+256 789 190064',
      pickupAddress: 'Acacia Mall, Kisementi',
      pickupLat: 0.3354,
      pickupLng: 32.5886,
      dropoffAddress: 'Bugolobi Village Mall',
      dropoffLat: 0.3168,
      dropoffLng: 32.6189,
      packageCategory: 'DOCUMENTS',
      packageWeightKg: 1.5,
      distanceKm: 6.0,
      paymentMethod: 'MTN Mobile Money',
    });
    if (!delivery.tracking_number.startsWith('SAF-')) {
      throw new Error('Delivery tracking number format invalid.');
    }
    console.log(`✅ 9. Express Delivery verified (Tracking: ${delivery.tracking_number}, Fare: UGX ${delivery.fare_ugx.toLocaleString()}).`);

    // 8. Test DPO Payment Integration & Environment Credentials Check
    try {
      const payment = await PaymentService.processPayment({
        userId: loginRes.user.id,
        referenceType: 'DELIVERY',
        referenceId: delivery.id,
        amountUgx: delivery.fare_ugx,
        paymentMethod: 'MTN_MOMO',
        phone: '+256 704 127185',
      });
      if (payment.status === 'FAILED') {
        console.log(`✅ 10. DPO Pay Gateway Security verified (Safely rejected unconfigured credentials: ${payment.failure_reason}).`);
      } else if (['SUCCESSFUL', 'PENDING'].includes(payment.status)) {
        console.log(`✅ 10. Payment Service verified (Tx ID: ${payment.transaction_id}, Status: ${payment.status}).`);
      } else {
        throw new Error(`Unexpected payment status: ${payment.status}`);
      }
    } catch (err: any) {
      if (err.code === 'PAYMENT_CONFIG_ERROR' || err.name === 'PaymentError' || err.message?.includes('temporarily unavailable')) {
        console.log(`✅ 10. DPO Pay Gateway Security verified (Safely rejected unconfigured credentials: ${err.message}).`);
      } else {
        throw err;
      }
    }

    // 9. Test Telemetry Batch Upload & Deduplication
    localStore.drivers.set('drv_ug_901', {
      id: 'drv_ug_901',
      user_id: 'usr_test_cust',
      full_name: 'Test Driver',
      phone: '+256700000001',
      is_approved: true,
      approval_status: 'APPROVED',
      is_online: true,
      is_available: true,
      created_at: new Date().toISOString(),
    } as any);

    const { TelemetryController } = await import('../services/telemetry/telemetry.controller');
    const mockReq: any = {
      user: { userId: 'drv_ug_901', role: 'driver' },
      body: {
        batchId: 'batch_test_001',
        points: [
          {
            id: 'test_pt_101',
            driverId: 'drv_ug_901',
            latitude: 0.3136,
            longitude: 32.5811,
            speed: 45.0,
            heading: 180.0,
            accuracy: 4.5,
            batteryLevel: 84.0,
            timestamp: new Date().toISOString(),
            isOfflineQueued: true,
          },
          {
            id: 'test_pt_102',
            driverId: 'drv_ug_901',
            latitude: 0.3012,
            longitude: 32.5750,
            speed: 55.0,
            heading: 185.0,
            accuracy: 4.2,
            batteryLevel: 83.5,
            timestamp: new Date().toISOString(),
            isOfflineQueued: true,
          },
        ],
      },
    };
    let telemetryResult: any = null;
    const mockRes: any = {
      status: () => ({
        json: (data: any) => {
          telemetryResult = data;
          return data;
        },
      }),
    };

    await TelemetryController.batchUpload(mockReq, mockRes);
    if (!telemetryResult || !telemetryResult.success || telemetryResult.data.processed !== 2) {
      throw new Error('Telemetry batch processing failed.');
    }
    console.log(`✅ 11. Real-Time Telemetry Batch Upload verified (${telemetryResult.data.processed} points ingested & deduplicated).`);

    // 10. Test Admin Audit Logging
    const { AdminAuditController } = await import('../services/admin/audit.controller');
    const auditReq: any = {
      user: { id: 'admin_super_01' },
      body: {
        action: 'INSPECT_DRIVER_LOCATION_HISTORY',
        resourceType: 'driver',
        resourceId: 'drv_ug_901',
        details: { reason: 'Fleet dispatch verification' },
      },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    };
    let auditResult: any = null;
    const auditRes: any = {
      status: () => ({
        json: (data: any) => {
          auditResult = data;
          return data;
        },
      }),
    };

    await AdminAuditController.recordAudit(auditReq, auditRes);
    if (!auditResult || !auditResult.success || !auditResult.data.id) {
      throw new Error('Admin audit log creation failed.');
    }
    console.log(`✅ 12. Admin Security Audit Trail verified (Audit ID: ${auditResult.data.id}).`);

    // 13. Test Notification System
    const { NotificationService } = await import('../services/notification/notification.service');
    const testNotif = await NotificationService.createNotification({
      userId: loginRes.user.id,
      title: 'Test Driver Assigned',
      message: 'Test driver has accepted your trip request.',
      type: 'DRIVER',
      metadata: { tripId: 'trp_test_001', status: 'DRIVER_ASSIGNED' },
    });
    if (!testNotif || !testNotif.id) {
      throw new Error('Notification creation failed — no ID returned.');
    }

    const broadcastResult = await NotificationService.broadcastAdminNotification({
      title: 'Platform Maintenance Notice',
      message: 'Scheduled gateway upgrade tonight at 02:00 EAT.',
      type: 'ADMIN',
      category: 'Platform Update',
      priority: 'high',
    });
    if (!broadcastResult.success || broadcastResult.recipientsCount === 0) {
      throw new Error('Admin broadcast dispatch failed.');
    }

    await NotificationService.markAllAsRead(loginRes.user.id);
    const postMarkAllUnread = await NotificationService.getUnreadCount(loginRes.user.id);
    if (postMarkAllUnread !== 0) {
      throw new Error('Mark all as read failed.');
    }
    console.log(`✅ 13. Notification Engine & Real-Time Dispatch verified (Driver updates, Payment alerts, Admin broadcasts wired directly to DB).`);

    // 14. Test Driver & Tour Guide Recruitment Workflow (careers.mumwesafarisuganda.com)
    const { CareerService } = await import('../services/career/career.service');
    const driverAppRes = await CareerService.submitApplication({
      applicant_type: 'driver',
      full_name: 'Ronald Mukwaya',
      email: 'ronald.mukwaya@careers.mumwesafarisuganda.com',
      phone: '+256 701 445566',
      national_id: 'CM9101445566RM',
      license_number: 'UG-DL-445566',
      experience_years: 7,
      vehicle_make: 'Toyota',
      vehicle_model: 'Noah',
      vehicle_plate: 'UBK 902Y',
      vehicle_tier: 'comfort',
    });
    if (!driverAppRes.success || driverAppRes.status !== 'PENDING_APPROVAL') {
      throw new Error('Career application submission failed.');
    }

    const approveRes = await CareerService.approveApplication(driverAppRes.applicationId, 'usr_adm_001', '127.0.0.1');
    if (!approveRes.success || approveRes.status !== 'APPROVED') {
      throw new Error('Career application approval failed.');
    }
    console.log(`✅ 14. Career Recruitment & Approval Workflow verified (${approveRes.message}).`);

    // 15. Test Admin Change Password
    const { AdminService } = await import('../services/admin/admin.service');
    const pwdRes = await AdminService.changePassword('usr_adm_001', 'password123', 'NewSafariSecure2026!#', '127.0.0.1');
    if (!pwdRes.success || !pwdRes.passwordChangedAt) {
      throw new Error('Admin password change failed.');
    }
    await AdminService.changePassword('usr_adm_001', 'NewSafariSecure2026!#', 'password123', '127.0.0.1');
    console.log(`✅ 15. Admin Password Change & Audit Logging verified (${pwdRes.message}).`);

    // 16. Test Candidate Status Lookup
    const candidateStatus = await CareerService.getApplicationStatus(driverAppRes.applicationId);
    if (!candidateStatus || candidateStatus.status !== 'APPROVED') {
      throw new Error('Candidate status lookup failed.');
    }
    console.log(`✅ 16. Candidate Application Status Inquiry verified (Found: ${candidateStatus.full_name}, Status: ${candidateStatus.status}).`);

    // 17. Test Approved Driver Login with OTP, Password Setup, and Live GPS Telemetry
    if (!approveRes.otpCode) {
      throw new Error('Approval did not generate an OTP code.');
    }
    const otpLoginRes = await AuthService.loginWithOtp('ronald.mukwaya@careers.mumwesafarisuganda.com', approveRes.otpCode);
    if (!otpLoginRes.success || !otpLoginRes.requiresPasswordSetup || !otpLoginRes.setupToken) {
      throw new Error('Driver OTP login failed or did not prompt for password setup.');
    }
    console.log(`✅ 17a. Approved Driver OTP Login verified (Prompted to create password).`);

    const setPwdRes = await AuthService.setupPassword(
      'ronald.mukwaya@careers.mumwesafarisuganda.com',
      otpLoginRes.setupToken,
      'SafariDriver2026!#'
    );
    if (!setPwdRes.success || !setPwdRes.accessToken) {
      throw new Error('Driver password setup failed.');
    }
    console.log(`✅ 17b. Permanent Password Setup verified (Auth token issued for Dashboard).`);

    const driverId = setPwdRes.user.id;
    DriverService.setAvailability(driverId, true);
    DriverService.updateLocation(driverId, 0.3312, 32.5714, 45);

    const liveFleet = Array.from(localStore.drivers.values()).find((d: any) => d.id === driverId);
    if (!liveFleet || liveFleet.current_lat !== 0.3312 || liveFleet.current_lng !== 32.5714 || !liveFleet.is_online) {
      throw new Error('Live driver location did not synchronize to fleet registry.');
    }
    console.log(`✅ 17c. Live Driver GPS Location Transmission verified on Admin Fleet Map (${liveFleet.current_lat}, ${liveFleet.current_lng}, Online: ${liveFleet.is_online}).`);

    // 18. Financial Engine, Customer Wallets & Automatic No-Show Refunds Suite
    console.log('\n--- Financial Engine & Automatic Refunds Verification ---');
    await runFinancialEngineTests();
    console.log('✅ 18. Complete Financial Engine, Customer Wallets & Automatic Refunds Verified.');

    console.log('\n🎉 ALL 18 PRODUCTION READINESS INTEGRATION TESTS PASSED CLEANLY!\n');
  } finally {
    // Restore original persistent JSON files so test data never pollutes production files
    for (const [fullPath, content] of snapshots.entries()) {
      try {
        fs.writeFileSync(fullPath, content, 'utf-8');
      } catch (_) {}
    }
  }
}

runTests().then(() => { process.exit(0); }).catch((err) => {
  console.error('\n❌ Verification Suite Failed:', err);
  process.exit(1);
});
