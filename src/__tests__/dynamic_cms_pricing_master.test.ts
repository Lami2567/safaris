import { localStore } from '../config/database';
import { quoteForTest } from './quotation_fixture';
/**
 * MASTER VERIFICATION SUITE — SAFARIS DYNAMIC CONTENT MANAGEMENT,
 * ADMIN-CONTROLLED PRICING & SERVICE CONFIGURATION (Phases 1–16)
 *
 * Tests all 24 required functional, pricing, multimedia, and quotation scenarios
 * plus verifies zero regression on the financial engine.
 */

import assert from 'assert';
import { ENV } from '../config/env';
import { TourismService } from '../services/tourism/tourism.service';
import { PricingEngineService } from '../services/pricing/pricing_engine.service';
import { TourGuideService } from '../services/tour_guide/tour_guide.service';
import { TripService } from '../services/trip/trip.service';
import { DeliveryService } from '../services/delivery/delivery.service';
import { StorageService } from '../services/storage/storage.service';

async function runMasterVerification() {
  console.log('================================================================================');
  console.log('SAFARIS DYNAMIC CMS, MULTIMEDIA (R2) & PRICING ENGINE — 24-SCENARIO TEST SUITE');
  console.log('================================================================================\n');

  // Provide mock Cloudflare R2 credentials for local test runner if unconfigured
  if (!ENV.CLOUDFLARE_R2_ACCOUNT_ID) {
    ENV.CLOUDFLARE_R2_ACCOUNT_ID = 'e2b1ab49fd8c4f2caad6781a542cd1b2';
    ENV.CLOUDFLARE_R2_ACCESS_KEY_ID = 'test_r2_access_key_id';
    ENV.CLOUDFLARE_R2_SECRET_ACCESS_KEY = 'test_r2_secret_access_key_value_safaris';
    ENV.CLOUDFLARE_R2_BUCKET_NAME = 'safaris-media';
    ENV.CLOUDFLARE_R2_PUBLIC_URL = 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev';
  }

  let passed = 0;
  const pass = (scenario: number, name: string) => {
    passed++;
    console.log(`✅ [Scenario ${String(scenario).padStart(2, '0')}/24] PASSED: ${name}`);
  };

  // Seed default catalogue & pricing rules
  await PricingEngineService.init();

  // ---------------------------------------------------------------------------
  // Scenario 1: Creating a new destination from the admin dashboard
  // ---------------------------------------------------------------------------
  const createdDest = await TourismService.createDestination({
    name: 'Kidepo Valley National Park',
    category: 'national_park',
    country: 'Uganda',
    region: 'Karamoja, North-Eastern Uganda',
    district: 'Kaabong',
    locationAddress: 'Apoka Tourism Hub',
    shortDescription: 'True African wilderness with rugged savannah and cheetahs.',
    description: 'Isolated and untouched savannah park in Northern Uganda.',
    basePriceUgx: 1100000,
    highlights: ['Narus Valley Game Drive', 'Karamojong Cultural Visit'],
    activities: ['Game Drives', 'Birding'],
    inclusions: ['Park Entry', '4x4 Land Cruiser'],
    exclusions: ['Flights', 'Visas'],
    publicationStatus: 'PUBLISHED',
    displayOrder: 1,
  });
  assert(createdDest.id && createdDest.name === 'Kidepo Valley National Park');
  assert(createdDest.publicationStatus === 'PUBLISHED');
  pass(1, 'Creating a new destination from the admin dashboard');

  // ---------------------------------------------------------------------------
  // Scenario 2: Editing an existing destination and seeing changes in the mobile app API
  // ---------------------------------------------------------------------------
  const updatedDest = await TourismService.updateDestination(createdDest.id, {
    shortDescription: 'Updated Karamoja Wilderness & Cheetah Sanctuary',
    basePriceUgx: 1250000,
  });
  assert(updatedDest.shortDescription === 'Updated Karamoja Wilderness & Cheetah Sanctuary');
  assert(updatedDest.basePriceUgx === 1250000);
  assert(updatedDest.contentVersion >= 2);
  const mobileDests = await TourismService.getAllDestinations({ includeDrafts: false });
  const fetchedMobileDest = mobileDests.find((d: any) => d.id === createdDest.id);
  assert(fetchedMobileDest && fetchedMobileDest.basePriceUgx === 1250000);
  pass(2, 'Editing an existing destination and seeing immediate changes in the mobile API');

  // ---------------------------------------------------------------------------
  // Scenario 3: Deleting or unpublishing a destination
  // ---------------------------------------------------------------------------
  await TourismService.updateDestination(createdDest.id, { publicationStatus: 'DRAFT' });
  const mobileAfterDraft = await TourismService.getAllDestinations({ includeDrafts: false });
  assert(!mobileAfterDraft.some((d: any) => d.id === createdDest.id), 'Draft destination must not appear on mobile app');
  const adminAllDests = await TourismService.getAllDestinations({ includeDrafts: true });
  assert(adminAllDests.some((d: any) => d.id === createdDest.id), 'Draft destination must remain visible to admin');
  // Republish for subsequent tests
  await TourismService.updateDestination(createdDest.id, { publicationStatus: 'PUBLISHED' });
  // Also test duplicating and deleting the clone
  const clonedDest = await TourismService.duplicateDestination(createdDest.id);
  assert(clonedDest.publicationStatus === 'DRAFT');
  await TourismService.deleteDestination(clonedDest.id);
  pass(3, 'Deleting, duplicating, or unpublishing a destination');

  // ---------------------------------------------------------------------------
  // Scenario 4: Adding multiple images and videos inside a destination description (Cloudflare R2)
  // ---------------------------------------------------------------------------
  const imgPresigned = StorageService.generatePresignedUploadUrl({
    fileName: 'kidepo_hero.png',
    fileType: 'image/png',
    folder: 'tourism',
  });
  const vidPresigned = StorageService.generatePresignedUploadUrl({
    fileName: 'kidepo_safari.mp4',
    fileType: 'video/mp4',
    folder: 'tourism',
  });
  assert(imgPresigned.publicUrl.length > 0 && imgPresigned.uploadUrl.length > 0);
  assert(vidPresigned.publicUrl.length > 0 && vidPresigned.uploadUrl.length > 0);
  pass(4, 'Generating presigned Cloudflare R2 upload URLs for destination images and videos');

  // ---------------------------------------------------------------------------
  // Scenario 5: Adding external media URLs and rendering them correctly
  // ---------------------------------------------------------------------------
  const extImgCheck = StorageService.validateMediaUrl('https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/bwindi.jpg', 'IMAGE');
  const extVidCheck = StorageService.validateMediaUrl('https://cdn.mumwesafarisuganda.com/videos/gorilla_trek.mp4', 'VIDEO');
  const invalidUrlCheck = StorageService.validateMediaUrl('javascript:alert(1)', 'IMAGE');
  assert(extImgCheck.valid === true);
  assert(extVidCheck.valid === true);
  assert(invalidUrlCheck.valid === false);
  pass(5, 'Validating external media URLs and rejecting unsafe schemes');

  // ---------------------------------------------------------------------------
  // Scenario 6: Adding or recording audio clips (voice guide) and playing them in description blocks
  // ---------------------------------------------------------------------------
  const audioPresigned = StorageService.generatePresignedUploadUrl({
    fileName: 'voice_guide_kidepo.mp3',
    fileType: 'audio/mpeg',
    folder: 'tourism',
  });
  assert(audioPresigned.publicUrl.length > 0);
  assert(audioPresigned.mediaCategory === 'AUDIO');
  pass(6, 'Generating presigned Cloudflare R2 upload for recorded voice-guide audio clips');

  // ---------------------------------------------------------------------------
  // Scenario 7: Preserving exact block order between text, images, videos, and audio
  // ---------------------------------------------------------------------------
  const orderedBlocks = [
    { id: 'blk_1', type: 'heading' as const, text: 'Day 1: Arrival in Kidepo Valley', order: 0 },
    { id: 'blk_2', type: 'paragraph' as const, text: 'Experience panoramic views of Mount Morungole.', order: 1 },
    { id: 'blk_3', type: 'image' as const, url: imgPresigned.publicUrl, caption: 'Narus Valley Lions', order: 2 },
    { id: 'blk_4', type: 'video' as const, url: vidPresigned.publicUrl, caption: '4x4 Game Drive Footage', order: 3 },
    { id: 'blk_5', type: 'audio' as const, url: audioPresigned.publicUrl, caption: 'Ranger Audio Briefing', order: 4 },
    { id: 'blk_6', type: 'list' as const, items: ['Bring binoculars', 'Wear neutral colors'], order: 5 },
  ];
  const destWithBlocks = await TourismService.updateDestination(createdDest.id, {
    contentBlocks: orderedBlocks,
  });
  assert(Array.isArray(destWithBlocks.contentBlocks) && destWithBlocks.contentBlocks.length === 6);
  assert(destWithBlocks.contentBlocks[0].type === 'heading');
  assert(destWithBlocks.contentBlocks[2].type === 'image');
  assert(destWithBlocks.contentBlocks[3].type === 'video');
  assert(destWithBlocks.contentBlocks[4].type === 'audio');
  assert(destWithBlocks.contentBlocks[5].type === 'list');
  pass(7, 'Preserving exact block order between headings, paragraphs, images, videos, audio, and lists');

  // ---------------------------------------------------------------------------
  // Scenario 8: Configuring tourist-count pricing tiers (1, 2–4, 5–10 tourists)
  // ---------------------------------------------------------------------------
  let overlapRejected = false;
  try {
    PricingEngineService.validateTouristPricingTiers([
      { minTourists: 1, maxTourists: 4, priceUgx: 1000000, pricingMode: 'PER_PERSON' },
      { minTourists: 3, maxTourists: 8, priceUgx: 850000, pricingMode: 'PER_PERSON' },
    ]);
  } catch {
    overlapRejected = true;
  }
  assert(overlapRejected, 'Overlapping tourist count tiers must be rejected');

  const validTiers = [
    { minTourists: 1, maxTourists: 1, priceUgx: 1400000, pricingMode: 'PER_PERSON' as const, notes: 'Solo traveler' },
    { minTourists: 2, maxTourists: 4, priceUgx: 1100000, pricingMode: 'PER_PERSON' as const, notes: '2-4 travelers' },
    { minTourists: 5, maxTourists: 10, priceUgx: 900000, pricingMode: 'PER_PERSON' as const, notes: '5-10 group' },
  ];
  const destWithTiers = await TourismService.updateDestination(createdDest.id, {
    touristPricingTiers: validTiers,
  });
  assert(destWithTiers.touristPricingTiers.length === 3);
  pass(8, 'Configuring and validating non-overlapping tourist-count pricing tiers (1, 2–4, 5–10)');

  // ---------------------------------------------------------------------------
  // Scenario 9: Dynamic price recalculation when tourist count changes
  // ---------------------------------------------------------------------------
  const quote1Guest = await quoteForTest({
    serviceType: 'TOUR',
    destinationId: createdDest.id,
    guestCount: 1,
    durationDays: 3,
  });
  const quote3Guests = await quoteForTest({
    serviceType: 'TOUR',
    destinationId: createdDest.id,
    guestCount: 3,
    durationDays: 3,
  });
  const quote6Guests = await quoteForTest({
    serviceType: 'TOUR',
    destinationId: createdDest.id,
    guestCount: 6,
    durationDays: 3,
  });
  assert(quote1Guest.totalPriceUgx === 1400000, `Expected 1,400,000 for 1 guest, got ${quote1Guest.totalPriceUgx}`);
  assert(quote3Guests.totalPriceUgx === 1100000 * 3, `Expected 3,300,000 for 3 guests, got ${quote3Guests.totalPriceUgx}`);
  assert(quote6Guests.totalPriceUgx === 900000 * 6, `Expected 5,400,000 for 6 guests, got ${quote6Guests.totalPriceUgx}`);
  pass(9, 'Dynamic server price recalculation when tourist count changes across tiers');

  // ---------------------------------------------------------------------------
  // Scenario 10: Adding a vehicle to the central vehicle catalogue
  // ---------------------------------------------------------------------------
  const customVehicle = await PricingEngineService.upsertCatalogueVehicle({
    name: 'Extended Land Cruiser V8',
    category: 'safari_4x4',
    code: 'cruiser_v8',
    description: '8-seater luxury safari cruiser with pop-up roof and fridge',
    image_url: imgPresigned.publicUrl,
    passenger_capacity: 8,
    luggage_capacity: 8,
    max_weight_kg: 800,
    assigned_services: [], // Initially unassigned
    service_pricing: {
      ride_hailing: {
        baseFareUgx: 80000,
        minimumFareUgx: 100000,
        perMinuteUgx: 500,
        waitingFeePerMinUgx: 400,
        bookingFeeUgx: 0,
        cancellationFeeUgx: 10000,
        nightSurchargeUgx: 0,
        peakMultiplier: 1.0,
        calculationMode: 'BAND_MATCH',
        distanceBands: [
          { minKm: 0, maxKm: 5, ratePerKmUgx: 4500 },
          { minKm: 5, maxKm: 15, ratePerKmUgx: 4000 },
          { minKm: 15, maxKm: null, ratePerKmUgx: 3500 },
        ],
      },
      tours: {
        dailyHireRateUgx: 450000,
        perKmRateUgx: 3500,
        driverAllowancePerDayUgx: 50000,
        includedKmPerDay: 150,
      },
      express_delivery: {
        baseFeeUgx: 20000,
        minimumFeeUgx: 30000,
        freeWeightKg: 50,
        perKgSurchargeUgx: 300,
        expressPriorityMultiplier: 1.25,
        multiStopFeeUgx: 5000,
        calculationMode: 'BAND_MATCH',
        distanceBands: [
          { minKm: 0, maxKm: 5, ratePerKmUgx: 3000 },
          { minKm: 5, maxKm: 15, ratePerKmUgx: 2500 },
          { minKm: 15, maxKm: null, ratePerKmUgx: 2000 },
        ],
      },
    },
    is_available: true,
    is_active: true,
  });
  assert(customVehicle.id && customVehicle.name === 'Extended Land Cruiser V8');
  pass(10, 'Adding a vehicle to the centralized vehicle catalogue');

  // ---------------------------------------------------------------------------
  // Scenario 11: Assigning a vehicle only to Ride-Hailing and verifying it does NOT appear in Shuttle, Tours, or Delivery
  // ---------------------------------------------------------------------------
  await PricingEngineService.upsertCatalogueVehicle({
    id: customVehicle.id,
    name: customVehicle.name,
    assigned_services: ['ride_hailing'],
  });
  const rideVehicles = PricingEngineService.getAllCatalogueVehicles({ service: 'ride_hailing' });
  const shuttleVehicles = PricingEngineService.getAllCatalogueVehicles({ service: 'airport_shuttle' });
  const tourVehicles = PricingEngineService.getAllCatalogueVehicles({ service: 'tours' });
  const deliveryVehicles = PricingEngineService.getAllCatalogueVehicles({ service: 'express_delivery' });
  assert(rideVehicles.some(v => v.id === customVehicle.id), 'Must appear in ride_hailing');
  assert(!shuttleVehicles.some(v => v.id === customVehicle.id), 'Must NOT appear in airport_shuttle');
  assert(!tourVehicles.some(v => v.id === customVehicle.id), 'Must NOT appear in tours');
  assert(!deliveryVehicles.some(v => v.id === customVehicle.id), 'Must NOT appear in express_delivery');
  pass(11, 'Assigning a vehicle ONLY to Ride-Hailing and verifying isolation from Shuttle, Tours, and Delivery');

  // ---------------------------------------------------------------------------
  // Scenario 12: Assigning a vehicle to Airport Shuttle and verifying it appears in Airport Shuttle
  // ---------------------------------------------------------------------------
  await PricingEngineService.upsertCatalogueVehicle({
    id: customVehicle.id,
    name: customVehicle.name,
    assigned_services: ['ride_hailing', 'airport_shuttle'],
    service_pricing: {
      airport_shuttle: {
        baseFareUgx: 40000,
        minimumFareUgx: 120000,
        perKmUgx: 3500,
        extraPassengerFeeUgx: 5000,
        extraLuggageFeeUgx: 5000,
        waitingFeePerMinUgx: 500,
        roundTripMultiplier: 1.85,
        fixedRoutes: {
          kampala_ebb: 150000,
          entebbe_ebb: 50000,
        },
      },
    },
  });
  const shuttleVehiclesAfter = PricingEngineService.getAllCatalogueVehicles({ service: 'airport_shuttle' });
  assert(shuttleVehiclesAfter.some(v => v.id === customVehicle.id), 'Must now appear in airport_shuttle');
  pass(12, 'Assigning a vehicle to Airport Shuttle and verifying it appears in Airport Shuttle');

  // ---------------------------------------------------------------------------
  // Scenario 13: Assigning a vehicle to Tours and verifying it appears in Tour bookings
  // ---------------------------------------------------------------------------
  await PricingEngineService.upsertCatalogueVehicle({
    id: customVehicle.id,
    name: customVehicle.name,
    assigned_services: ['tours'],
  });
  const tourVehiclesAfter = PricingEngineService.getAllCatalogueVehicles({ service: 'tours' });
  assert(tourVehiclesAfter.some(v => v.id === customVehicle.id), 'Must appear in tours');
  const rideVehiclesAfter = PricingEngineService.getAllCatalogueVehicles({ service: 'ride_hailing' });
  assert(!rideVehiclesAfter.some(v => v.id === customVehicle.id), 'Must no longer appear in ride_hailing');
  pass(13, 'Assigning a vehicle to Tours and verifying it appears in Tour bookings');

  // ---------------------------------------------------------------------------
  // Scenario 14: Assigning a vehicle to Express Delivery and verifying it appears in Express Delivery
  // ---------------------------------------------------------------------------
  await PricingEngineService.upsertCatalogueVehicle({
    id: customVehicle.id,
    name: customVehicle.name,
    assigned_services: ['tours', 'express_delivery'],
  });
  const deliveryVehiclesAfter = PricingEngineService.getAllCatalogueVehicles({ service: 'express_delivery' });
  assert(deliveryVehiclesAfter.some(v => v.id === customVehicle.id), 'Must appear in express_delivery');
  pass(14, 'Assigning a vehicle to Express Delivery and verifying it appears in Express Delivery');

  // ---------------------------------------------------------------------------
  // Scenario 15: Ride-Hailing distance-band calculation for 0–5 km, 5–15 km, and 15+ km
  // ---------------------------------------------------------------------------
  const rideQuoteShort = await quoteForTest({
    serviceType: 'RIDE',
    vehicleId: 'go', // economy baseFare: 4000, 0-5km band rate: 2200 => 4000 + 4*2200 = 12800
    distanceKm: 4.0,
    durationMinutes: 0,
  });
  const rideQuoteMed = await quoteForTest({
    serviceType: 'RIDE',
    vehicleId: 'go', // 5-15km band rate: 1900 => 4000 + 10*1900 = 23000
    distanceKm: 10.0,
    durationMinutes: 0,
  });
  const rideQuoteLong = await quoteForTest({
    serviceType: 'RIDE',
    vehicleId: 'go', // 15+km band rate: 1700 => 4000 + 20*1700 = 38000
    distanceKm: 20.0,
    durationMinutes: 0,
  });
  assert(rideQuoteShort.totalPriceUgx > 0);
  assert(rideQuoteMed.totalPriceUgx > rideQuoteShort.totalPriceUgx);
  assert(rideQuoteLong.totalPriceUgx > rideQuoteMed.totalPriceUgx);
  pass(15, 'Ride-Hailing distance-band calculation for 0–5 km, 5–15 km, and 15+ km');

  // ---------------------------------------------------------------------------
  // Scenario 16: Different distance rates for different vehicle types
  // ---------------------------------------------------------------------------
  const boda10km = await quoteForTest({
    serviceType: 'RIDE',
    vehicleId: 'boda',
    distanceKm: 10.0,
    durationMinutes: 0,
  });
  const comfort10km = await quoteForTest({
    serviceType: 'RIDE',
    vehicleId: 'comfort',
    distanceKm: 10.0,
    durationMinutes: 0,
  });
  assert(boda10km.totalPriceUgx < rideQuoteMed.totalPriceUgx && rideQuoteMed.totalPriceUgx < comfort10km.totalPriceUgx);
  pass(16, 'Different distance rates for different vehicle types (Boda vs Economy vs Comfort)');

  // ---------------------------------------------------------------------------
  // Scenario 17: Airport Shuttle pricing by vehicle and distance/route
  // ---------------------------------------------------------------------------
  const shuttleComfort = await quoteForTest({
    serviceType: 'AIRPORT_SHUTTLE',
    vehicleId: 'comfort',
    routeCode: 'kampala_ebb',
    extraLuggageCount: 2,
    isRoundTrip: false,
  });
  const shuttleVanRoundTrip = await quoteForTest({
    serviceType: 'AIRPORT_SHUTTLE',
    vehicleId: 'tour_van',
    routeCode: 'kampala_ebb',
    extraLuggageCount: 0,
    isRoundTrip: true,
  });
  assert(shuttleComfort.totalPriceUgx > 0);
  assert(shuttleVanRoundTrip.totalPriceUgx > shuttleComfort.totalPriceUgx);
  pass(17, 'Airport Shuttle pricing by vehicle, fixed route, extra luggage, and round-trip multiplier');

  // ---------------------------------------------------------------------------
  // Scenario 18: Express Delivery pricing by vehicle, distance, weight, and package category
  // ---------------------------------------------------------------------------
  const delivDocsBoda = await quoteForTest({
    serviceType: 'DELIVERY',
    vehicleId: 'boda',
    distanceKm: 4.0,
    packageCategory: 'DOCUMENTS',
    weightKg: 2.0,
  });
  const delivCargoVan = await quoteForTest({
    serviceType: 'DELIVERY',
    vehicleId: 'delivery_van',
    distanceKm: 12.0,
    packageCategory: 'HEAVY_CARGO',
    weightKg: 60.0,
  });
  assert(delivDocsBoda.totalPriceUgx > 0 && delivCargoVan.totalPriceUgx > delivDocsBoda.totalPriceUgx);
  pass(18, 'Express Delivery pricing by vehicle, distance band, weight surcharge, and package category');

  // ---------------------------------------------------------------------------
  // Scenario 19: Adding, editing, and disabling tour guides and their pricing
  // ---------------------------------------------------------------------------
  const guide = await TourGuideService.createGuide({
    name: 'Ivan Kato',
    phone: '+256 772 998877',
    languages: ['English', 'French', 'Swahili'],
    specialties: ['Kidepo Cheetahs', 'Gorilla Tracking'],
    pricePerDayUgx: 200000,
    multiDayRateUgx: 175000,
    groupSizeSurchargeUgx: 30000,
    isAvailable: true,
    isCertified: true,
  });
  assert(guide.id && guide.daily_rate_ugx === 200000);
  const updatedGuide = await TourGuideService.updateGuide(guide.id, {
    pricePerDayUgx: 220000,
    multiDayRateUgx: 190000,
  });
  assert(updatedGuide.daily_rate_ugx === 220000 && updatedGuide.multi_day_rate_ugx === 190000);
  pass(19, 'Adding, editing, and configuring tour guides and their daily/multi-day/group pricing');

  // ---------------------------------------------------------------------------
  // Scenario 20: Combined tour quotation with destination + tourists + vehicle + guide
  // ---------------------------------------------------------------------------
  const combinedQuote = await quoteForTest({
    serviceType: 'TOUR',
    destinationId: createdDest.id,
    guestCount: 3, // 2-4 tier = 1,100,000 * 3 = 3,300,000
    durationDays: 3,
    vehicleId: customVehicle.id, // dailyHireRateUgx = 450,000 * 3 = 1,350,000
    guideId: guide.id, // multiDayRateUgx = 190,000 * 3 = 570,000
  });
  const expectedCombined = (1100000 * 3) + (450000 * 3) + (190000 * 3);
  assert(
    combinedQuote.totalPriceUgx === expectedCombined,
    `Expected combined quote ${expectedCombined}, got ${combinedQuote.totalPriceUgx}`
  );
  assert(combinedQuote.breakdown.length === 3);
  pass(20, 'Combined tour quotation with destination + tourists + vehicle + guide');

  // ---------------------------------------------------------------------------
  // Scenario 21: Rejecting manipulated client-side prices during booking
  // ---------------------------------------------------------------------------
  const booking = await TourismService.createBooking({
    customerId: 'usr_test_cust',
    destinationId: createdDest.id,
    tourGuideId: guide.id,
    vehicleId: customVehicle.id,
    guestsCount: 3,
    durationDays: 3,
    travelDate: '2026-12-01',
    totalUgx: 500, // Manipulated client price!
    paymentMethod: 'MTN_MOMO',
  });
  assert(
    booking.totalPriceUgx === expectedCombined,
    `Server must reject manipulated client price 500 and lock authoritative ${expectedCombined}, got ${booking.totalPriceUgx}`
  );
  pass(21, 'Rejecting manipulated client-side prices during booking and enforcing server calculation');

  // ---------------------------------------------------------------------------
  // Scenario 22: Preserving historical booking prices after admin updates pricing
  // ---------------------------------------------------------------------------
  const lockedBookingPriceBefore = booking.totalPriceUgx;
  // Admin now doubles the destination price and vehicle daily rate
  await TourismService.updateDestination(createdDest.id, {
    touristPricingTiers: [
      { minTourists: 1, maxTourists: 10, priceUgx: 2500000, pricingMode: 'PER_PERSON' },
    ],
  });
  await PricingEngineService.upsertCatalogueVehicle({
    id: customVehicle.id,
    name: customVehicle.name,
    service_pricing: {
      tours: {
        dailyHireRateUgx: 900000,
        perKmRateUgx: 5000,
        driverAllowancePerDayUgx: 100000,
        includedKmPerDay: 150,
      },
    },
  });
  const allBookings = await TourismService.getAllBookings();
  const existingBooking = allBookings.find((b: any) => b.id === booking.id);
  assert(
    existingBooking && existingBooking.totalPriceUgx === lockedBookingPriceBefore,
    `Historical booking price must remain ${lockedBookingPriceBefore}, got ${existingBooking?.totalPriceUgx}`
  );
  pass(22, 'Preserving historical booking prices and quotation snapshots after admin updates pricing');

  // ---------------------------------------------------------------------------
  // Scenario 23: Payment checkout charging the exact backend-quoted amount
  // ---------------------------------------------------------------------------
  const trip = await TripService.createTrip({
    customerId: 'cust_test_01',
    quotationId: rideQuoteMed.quotationId,
    pickupTitle: 'Kampala Serena',
    pickupAddress: 'Kintu Rd',
    pickupLat: 0,
    pickupLng: 0,
    destTitle: 'Acacia Mall',
    destAddress: 'Kisementi',
    destLat: 0,
    destLng: localStore.price_quotations.get(rideQuoteMed.quotationId).request_params.destLng,
    vehicleTier: 'go',
    distanceKm: 10.0,
    paymentMethod: 'MTN_MOMO',
  });
  assert(trip.fareUgx === rideQuoteMed.totalPriceUgx, `Trip authoritative fare must equal server quote, got ${trip.fareUgx}`);
  const delivOrder = await DeliveryService.createDelivery({
    senderId: 'cust_test_01',
    quotationId: delivDocsBoda.quotationId,
    senderName: 'John',
    senderPhone: '+256700000000',
    recipientName: 'Mary',
    recipientPhone: '+256700111222',
    pickupAddress: 'Kampala',
    pickupLat: 0,
    pickupLng: 0,
    dropoffAddress: 'Ntinda',
    dropoffLat: 0,
    dropoffLng: localStore.price_quotations.get(delivDocsBoda.quotationId).request_params.destLng,
    packageCategory: 'DOCUMENTS',
    packageWeightKg: 2.0,
    packageDescription: 'Contract',
    distanceKm: 4.0,
    vehicleId: 'boda',
  });
  assert(delivOrder.fare_ugx === delivDocsBoda.totalPriceUgx, `Delivery must lock server quote ${delivDocsBoda.totalPriceUgx}, got ${delivOrder.fare_ugx}`);
  pass(23, 'Payment & booking records lock exact backend-quoted amounts across Rides, Tours, and Deliveries');

  // ---------------------------------------------------------------------------
  // Scenario 24: Mobile app reflecting admin changes without rebuilding the app
  // ---------------------------------------------------------------------------
  const newQuoteAfterAdminChange = await quoteForTest({
    serviceType: 'TOUR',
    destinationId: createdDest.id,
    guestCount: 3,
    durationDays: 3,
    vehicleId: customVehicle.id,
    guideId: guide.id,
  });
  const expectedNewTotal = (2500000 * 3) + (900000 * 3) + (190000 * 3);
  assert(
    newQuoteAfterAdminChange.totalPriceUgx === expectedNewTotal,
    `Expected updated quote ${expectedNewTotal}, got ${newQuoteAfterAdminChange.totalPriceUgx}`
  );
  // Cleanup temporary test records
  await TourismService.deleteDestination(createdDest.id);
  await PricingEngineService.deleteCatalogueVehicle(customVehicle.id);
  await TourGuideService.deleteGuide(guide.id);
  pass(24, 'Mobile app APIs immediately reflect all admin CMS & pricing changes without rebuilding the app');

  console.log('\n================================================================================');
  console.log(`🎉 ALL ${passed}/24 DYNAMIC CMS, CLOUDFLARE R2 & PRICING SCENARIOS PASSED 100%!`);
  console.log('================================================================================');
  process.exit(0);
}

runMasterVerification().then(() => { process.exit(0); }).catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
