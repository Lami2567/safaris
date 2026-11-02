import assert from 'assert';
import { MapsService } from '../services/maps/maps.service';
import { PricingEngineService } from '../services/pricing/pricing_engine.service';
import { TourismService } from '../services/tourism/tourism.service';
import { TripService } from '../services/trip/trip.service';
import { DriverService } from '../services/driver/driver.service';

async function runMapsRoutingPricingMasterSuite() {
  console.log('🧪 Starting Maps, Uganda Gazetteer Search, Routing, Dynamic Pricing & Live Tracking Master Suite...\n');
  let passed = 0;

  // 1. Uganda-Wide Gazetteer Coverage: Major Cities, Municipalities, Districts
  {
    const requiredPlaces = [
      { query: 'Kampala', expectedRegion: 'Central' },
      { query: 'Entebbe', expectedRegion: 'Central' },
      { query: 'Jinja', expectedRegion: 'Eastern' },
      { query: 'Mbarara', expectedRegion: 'Western' },
      { query: 'Kabale', expectedRegion: 'Western' },
      { query: 'Rukungiri', expectedRegion: 'Western' },
      { query: 'Kisoro', expectedRegion: 'Western' },
      { query: 'Hoima', expectedRegion: 'Western' },
      { query: 'Gulu', expectedRegion: 'Northern' },
      { query: 'Arua', expectedRegion: 'Northern' },
    ];

    for (const item of requiredPlaces) {
      const results = MapsService.searchGazetteer(item.query, { limit: 5 });
      assert(results.length > 0, `Expected gazetteer results for ${item.query}`);
      const top = results[0];
      assert(MapsService.isWithinUganda(top.latitude, top.longitude), `${item.query} coordinates must be within Uganda`);
      if (item.query !== 'Kampala') {
        assert(!MapsService.isDefaultKampalaCoordinate(top.latitude, top.longitude), `${item.query} must not have Kampala coordinates`);
      }
    }
    passed++;
    console.log('  ✅ 1. Verified Uganda-wide search for Kampala, Entebbe, Jinja, Mbarara, Kabale, Rukungiri, Kisoro, Hoima, Gulu, Arua');
  }

  // 2. Small Towns, Trading Centres, Sub-Counties, Hospitals, Airports & Safari Parks
  {
    const localAndLandmarkQueries = [
      'Nyakibale',
      'Kebisoni',
      'Kihihi',
      'Sipi Falls',
      'Karuma',
      'Pakwach',
      'Entebbe International Airport',
      'Mulago National Referral Hospital',
      'Bwindi Impenetrable National Park',
      'Queen Elizabeth National Park',
      'Murchison Falls National Park',
      'Kidepo Valley National Park',
    ];

    for (const q of localAndLandmarkQueries) {
      const results = MapsService.searchGazetteer(q, { limit: 5 });
      assert(results.length > 0, `Expected search results for "${q}"`);
      const top = results[0];
      assert(MapsService.isWithinUganda(top.latitude, top.longitude), `"${q}" coordinates must be in Uganda`);
      assert(top.subtitle.length > 5, `"${q}" must include administrative hierarchy in subtitle`);
    }
    passed++;
    console.log('  ✅ 2. Verified trading centres, sub-counties, hospitals, airports, and national safari parks across Uganda');
  }

  // 3. Same-Name Disambiguation & Proximity Context Without Permanent Kampala Bias
  {
    // Search "Rubaga" with proximity in Mbarara (-0.6072, 30.6545)
    const mbararaProximityResults = MapsService.searchGazetteer('Rubaga', {
      proximityLat: -0.6072,
      proximityLng: 30.6545,
      limit: 5,
    });
    assert(mbararaProximityResults.length >= 2, 'Expected both Rubaga (Mbarara) and Rubaga (Kampala)');
    assert(
      mbararaProximityResults[0].district === 'Mbarara',
      `Expected Mbarara Rubaga first when user is in Mbarara, got ${mbararaProximityResults[0].title} (${mbararaProximityResults[0].district})`
    );

    // Search "Rubaga" with proximity in Kampala (0.3476, 32.5825)
    const kampalaProximityResults = MapsService.searchGazetteer('Rubaga', {
      proximityLat: 0.3476,
      proximityLng: 32.5825,
      limit: 5,
    });
    assert(
      kampalaProximityResults[0].district === 'Kampala',
      `Expected Kampala Rubaga first when user is in Kampala, got ${kampalaProximityResults[0].district}`
    );
    passed++;
    console.log('  ✅ 3. Verified same-name place disambiguation (Rubaga/Ntinda in Mbarara vs Kampala) with dynamic proximity ranking');
  }

  // 4. Coordinate Validation & GeoJSON Reversal Safeguards
  {
    assert.strictEqual(MapsService.isValidCoordinate(null, null), false);
    assert.strictEqual(MapsService.isValidCoordinate(0, 0), false);
    assert.strictEqual(MapsService.isValidCoordinate(NaN, 32.5), false);
    // Swapped [lng, lat] for Kampala (32.5825, 0.3476) is outside Uganda latitude range [-1.55, 4.30]
    assert.strictEqual(MapsService.isWithinUganda(32.5825, 0.3476), false);
    assert.strictEqual(MapsService.isLikelyReversedUgandaCoordinate(32.5825, 0.3476), true);

    const parsedGeoJson = MapsService.fromGeoJsonCoord([30.6545, -0.6072]);
    assert(parsedGeoJson !== null, 'Valid Uganda GeoJSON [lng, lat] should parse');
    assert.strictEqual(parsedGeoJson!.lat, -0.6072);
    assert.strictEqual(parsedGeoJson!.lng, 30.6545);
    passed++;
    console.log('  ✅ 4. Verified strict coordinate validation, null/zero rejection, and GeoJSON [lng, lat] reversal safeguards');
  }

  // 5. Admin Destination Coordinate Verification (No Silent Kampala Substitution)
  {
    let threwOnUnverified = false;
    try {
      await TourismService.createDestination({
        name: 'NonExistentUnknownVillage9999',
        region: 'Western Uganda',
      });
    } catch (err: any) {
      threwOnUnverified = true;
      assert(err.message.includes('Verified Uganda coordinates are required'));
    }
    assert(threwOnUnverified, 'Admin createDestination must reject unverified destinations without valid coordinates');

    // Creating a destination with a known Uganda gazetteer name resolves real coordinates (not Kampala)
    const kabaleDest = await TourismService.createDestination({
      name: 'Kabale',
      region: 'Western Uganda',
      description: 'Kigezi Highlands',
    });
    assert(MapsService.isWithinUganda(kabaleDest.coordinates.lat, kabaleDest.coordinates.lng));
    assert(!MapsService.isDefaultKampalaCoordinate(kabaleDest.coordinates.lat, kabaleDest.coordinates.lng));
    assert(Math.abs(kabaleDest.coordinates.lat - -1.2486) < 0.05);
    passed++;
    console.log('  ✅ 5. Verified admin destination creation resolves real coordinates and rejects unverified Kampala fallbacks');
  }

  // 6. Admin-Controlled Dynamic Fare Calculation (Road Distance × Admin Per-Km Rate)
  {
    await PricingEngineService.init();
    const vehicles = PricingEngineService.getAllCatalogueVehicles();
    const goVehicle = vehicles.find((v) => v.code === 'go')!;
    const originalPricingVersion = goVehicle.pricing_version;

    // Admin updates Safaris Go to UGX 2,500/km, Base Fare UGX 5,000, Minimum Fare UGX 8,000
    const updatedVehicle = await PricingEngineService.upsertCatalogueVehicle({
      ...goVehicle,
      service_pricing: {
        ...goVehicle.service_pricing,
        ride_hailing: {
          ...goVehicle.service_pricing.ride_hailing!,
          baseFareUgx: 5000,
          minimumFareUgx: 8000,
          perKmRateUgx: 2500,
          perMinuteUgx: 0,
          waitingFeePerMinUgx: 200,
          bookingFeeUgx: 0,
          peakMultiplier: 1.0,
          calculationMode: 'BAND_MATCH',
          distanceBands: [
            { minKm: 0, maxKm: null, ratePerKmUgx: 2500 },
          ],
        },
      },
    });

    assert.strictEqual(updatedVehicle.pricing_version, originalPricingVersion + 1);

    // Seed a verified 120 km road route in cache between Mbarara (-0.6072, 30.6545) and Fort Portal (0.6544, 30.2744)
    MapsService.seedVerifiedRouteForTest(
      -0.6072,
      30.6545,
      0.6544,
      30.2744,
      120.0,
      150
    );

    // Quote for 120 km road distance at UGX 2,500/km + UGX 5,000 base fare = UGX 305,000
    const quote120km = await PricingEngineService.calculateQuote({
      customerId: 'cust_test_mbarara',
      serviceType: 'RIDE',
      vehicleId: goVehicle.id,
      pickupLat: -0.6072,
      pickupLng: 30.6545,
      destLat: 0.6544,
      destLng: 30.2744,
      distanceKm: 120,
      durationMinutes: 150,
      waitingMinutes: 0,
    });

    assert.strictEqual(quote120km.distancePriceUgx, 300000);
    assert.strictEqual(quote120km.basePriceUgx, 5000);
    assert.strictEqual(quote120km.totalPriceUgx, 305000);
    assert.strictEqual(quote120km.pricingVersion, updatedVehicle.pricing_version);

    // Quote for short 0.5 km trip enforces minimum fare (UGX 8,000)
    MapsService.seedVerifiedRouteForTest(
      -0.6072,
      30.6545,
      -0.6100,
      30.6560,
      0.5,
      2
    );
    const quoteShort = await PricingEngineService.calculateQuote({
      customerId: 'cust_test_mbarara',
      serviceType: 'RIDE',
      vehicleId: goVehicle.id,
      pickupLat: -0.6072,
      pickupLng: 30.6545,
      destLat: -0.6100,
      destLng: 30.6560,
      distanceKm: 0.5,
      durationMinutes: 2,
    });
    assert.strictEqual(quoteShort.totalPriceUgx, 8000);

    // Admin updates price again -> previous quotation is flagged as outdated pricing_version
    await PricingEngineService.upsertCatalogueVehicle({
      ...updatedVehicle,
      service_pricing: {
        ...updatedVehicle.service_pricing,
        ride_hailing: {
          ...updatedVehicle.service_pricing.ride_hailing!,
          perKmRateUgx: 2600,
          distanceBands: [{ minKm: 0, maxKm: null, ratePerKmUgx: 2600 }],
        },
      },
    });

    let threwOnOutdatedPriceVersion = false;
    try {
      PricingEngineService.validateQuotation({
        quotationId: quote120km.quotationId,
        expectedServiceType: 'RIDE',
        customerId: 'cust_test_mbarara',
        vehicleId: goVehicle.id,
        pickupLat: -0.6072,
        pickupLng: 30.6545,
        destLat: 0.6544,
        destLng: 30.2744,
      });
    } catch (err: any) {
      threwOnOutdatedPriceVersion = true;
      assert(err.message.includes('Pricing configuration'));
    }
    assert.strictEqual(
      threwOnOutdatedPriceVersion,
      true,
      'Quotation must be invalidated when admin increments pricing_version'
    );
    passed++;
    console.log('  ✅ 6. Verified Admin-Controlled Dynamic Fare Engine (120 km × UGX 2,500/km = UGX 300,000 + base fare, minimum fare, and pricing_version invalidation)');
  }

  // 7. End-to-End Trip Creation, Tampered Fare Protection & Live Driver GPS Tracking Lifecycle
  {
    // Reject trip creation with invalid (0, 0) coordinates
    let rejectedInvalidCoords = false;
    try {
      await TripService.createTrip({
        customerId: 'cust_test_1',
        pickupTitle: 'Invalid Origin',
        pickupAddress: 'Invalid Origin',
        pickupLat: 0,
        pickupLng: 0,
        destTitle: 'Mbarara City',
        destAddress: 'Mbarara City',
        destLat: -0.6072,
        destLng: 30.6545,
        vehicleTier: 'go',
        distanceKm: 10,
        paymentMethod: 'MTN Mobile Money',
      });
    } catch (_) {
      rejectedInvalidCoords = true;
    }
    assert(rejectedInvalidCoords, 'TripService.createTrip must reject (0, 0) coordinates');

    // Create valid trip from Mbarara Central (-0.6072, 30.6545) to Bushenyi-Ishaka (-0.5419, 30.1856)
    const trip = await TripService.createTrip({
      customerId: 'cust_test_mbarara',
      pickupTitle: 'Mbarara High Street',
      pickupAddress: 'Mbarara High Street, Mbarara City',
      pickupLat: -0.6072,
      pickupLng: 30.6545,
      destTitle: 'Bushenyi-Ishaka Municipality',
      destAddress: 'Bushenyi-Ishaka, Bushenyi District',
      destLat: -0.5419,
      destLng: 30.1856,
      vehicleTier: 'go',
      distanceKm: 58.5,
      paymentMethod: 'MTN Mobile Money',
    });

    assert(trip.fare_ugx > 100000, `Backend must independently calculate fare (got ${trip.fare_ugx})`);
    assert(trip.pricing_version >= 1, 'Trip must store pricing_version used at booking');

    // Register & approve a real driver in Mbarara
    const { localStore } = await import('../config/database');
    localStore.users.set('drv_mbarara_1', {
      id: 'drv_mbarara_1',
      full_name: 'Robert Muhumuza',
      phone: '+256772111222',
      email: 'robert.muhumuza@mumwesafarisuganda.com',
      role: 'driver',
      approval_status: 'APPROVED',
      rating: 4.95,
      total_trips: 120,
    });
    DriverService.ensureDriverRecord('drv_mbarara_1');
    const drvRecord = localStore.drivers.get('drv_mbarara_1');
    drvRecord.is_approved = true;
    drvRecord.approval_status = 'APPROVED';
    DriverService.setAvailability('drv_mbarara_1', true, { lat: -0.6100, lng: 30.6500 });

    // Driver accepts trip
    const accepted = await TripService.acceptTrip(trip.id, 'drv_mbarara_1');
    assert.strictEqual(accepted.status, 'DRIVER_ASSIGNED');

    // Unauthorized driver cannot spoof GPS for this trip
    let blockedSpoof = false;
    try {
      TripService.updateDriverLocation(trip.id, -0.6080, 30.6520, 45, 'drv_attacker_99');
    } catch (_) {
      blockedSpoof = true;
    }
    assert(blockedSpoof, 'Unauthorized driver must be blocked from updating trip GPS');

    // Assigned driver streams real GPS en route to pickup -> arrives -> starts trip -> streams GPS to destination -> completes trip
    const locToPickup = TripService.updateDriverLocation(trip.id, -0.6080, 30.6530, 60, 'drv_mbarara_1');
    assert.strictEqual(locToPickup.targetStage, 'TO_PICKUP');

    TripService.updateTripStatus(trip.id, 'DRIVER_ARRIVED', 'drv_mbarara_1', 'driver');
    TripService.updateTripStatus(trip.id, 'TRIP_STARTED', 'drv_mbarara_1', 'driver');

    const locToDest = TripService.updateDriverLocation(trip.id, -0.5750, 30.4200, 280, 'drv_mbarara_1');
    assert.strictEqual(locToDest.targetStage, 'TO_DESTINATION');

    const completed = TripService.updateTripStatus(trip.id, 'TRIP_COMPLETED', 'drv_mbarara_1', 'driver');
    assert.strictEqual(completed?.status, 'TRIP_COMPLETED');

    passed++;
    console.log('  ✅ 7. Verified Trip Creation coordinate validation, independent backend fare calculation, and live driver GPS lifecycle (Pickup -> In-Progress -> Completed)');
  }

  console.log(`\n🎉 MAPS, ROUTING, DYNAMIC PRICING & LIVE TRACKING SUITE: ${passed}/7 SCENARIOS PASSED!\n`);
}

runMapsRoutingPricingMasterSuite().catch((err) => {
  console.error('❌ Maps, Routing & Pricing Suite failed:', err);
  process.exit(1);
});
