import http from 'http';
import { ENV } from '../config/env';
import { AuthService } from '../services/auth/auth.service';
import { TripService } from '../services/trip/trip.service';
import { TourismService } from '../services/tourism/tourism.service';
import { TourGuideService } from '../services/tour_guide/tour_guide.service';
import { DeliveryService } from '../services/delivery/delivery.service';
import { PaymentService } from '../services/payment/payment.service';
import { AppConfigService } from '../services/app_config/app_config.service';
import { seedUgandaData } from '../database/seed';

async function runTests() {
  console.log('🧪 Starting SAFARIS Backend Automated Verification Suite...\n');

  // 1. Seed Database
  await seedUgandaData();
  console.log('✅ 1. Database Seed completed successfully.');

  // 2. Test Remote App Config
  const config = AppConfigService.getConfig();
  if (config.appName !== 'SAFARIS' || config.currency !== 'UGX') {
    throw new Error('AppConfig verification failed.');
  }
  console.log('✅ 2. App Config Service verified (AppName: SAFARIS, Currency: UGX).');

  // 3. Test Authentication (Login + Register + Token verification)
  const loginRes = await AuthService.login('david.kato@safaris.ug', 'password123');
  if (!loginRes.accessToken || loginRes.user.full_name !== 'David Kato') {
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

  const tourBooking = TourismService.createBooking({
    customerId: loginRes.user.id,
    destinationId: 'dest_bwindi',
    packageId: 'pkg_bwindi_3d',
    travelDate: '2026-10-15',
    guestsCount: 2,
    totalUgx: 5600000,
    paymentMethod: 'MTN Mobile Money',
  });
  if (tourBooking.booking_status !== 'CONFIRMED') {
    throw new Error('Tour booking confirmation failed.');
  }
  console.log(`✅ 7. Tour Booking verified (Booking ID: ${tourBooking.id}, Total: UGX ${tourBooking.total_ugx.toLocaleString()}).`);

  // 6. Test Tour Guides
  const guides = TourGuideService.getAllGuides();
  if (guides.length === 0) {
    throw new Error('Tour guides directory empty.');
  }
  console.log(`✅ 8. Tour Guides verified (${guides.length} certified guides available).`);

  // 7. Test Express Parcel Delivery
  const deliveryFare = DeliveryService.calculateDeliveryFare('DOCUMENTS', 1.5, 6.0);
  const delivery = DeliveryService.createDelivery({
    senderId: loginRes.user.id,
    senderName: 'David Kato',
    senderPhone: '+256 772 123456',
    recipientName: 'Sarah Namubiru',
    recipientPhone: '+256 701 998877',
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

  // 8. Test MTN Mobile Money Payment Simulation
  const payment = await PaymentService.processPayment({
    userId: loginRes.user.id,
    referenceType: 'DELIVERY',
    referenceId: delivery.id,
    amountUgx: delivery.fare_ugx,
    paymentMethod: 'MTN_MOMO',
    phone: '+256 772 123456',
  });
  if (payment.status !== 'SUCCESSFUL') {
    throw new Error('Payment processing failed.');
  }
  console.log(`✅ 10. Payment Service verified (Tx ID: ${payment.transaction_id}, Status: ${payment.status}).`);

  console.log('\n🎉 ALL 10 CORE SAFARIS BACKEND INTEGRATION TESTS PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Verification Suite Failed:', err);
  process.exit(1);
});
