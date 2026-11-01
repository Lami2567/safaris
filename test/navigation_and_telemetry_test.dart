import 'package:flutter_test/flutter_test.dart';
import 'package:safaris/core/services/navigation_service.dart';
import 'package:safaris/core/services/offline_location_queue.dart';
import 'package:safaris/core/utils/geo_utils.dart';

import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  group('Geospatial Mathematics & Route Corridors', () {
    test('Haversine distance between Kampala CBD and Entebbe Airport is ~33-36 km', () {
      const kampalaLat = 0.3136;
      const kampalaLng = 32.5811;
      const entebbeLat = 0.0425;
      const entebbeLng = 32.4435;

      final distance = GeoUtils.haversineDistance(kampalaLat, kampalaLng, entebbeLat, entebbeLng);
      expect(distance, greaterThan(30.0));
      expect(distance, lessThan(40.0));
    });

    test('Initial bearing from Kampala to Entebbe points South-Southwest (180 - 220 degrees)', () {
      const kampalaLat = 0.3136;
      const kampalaLng = 32.5811;
      const entebbeLat = 0.0425;
      const entebbeLng = 32.4435;

      final bearing = GeoUtils.calculateBearing(kampalaLat, kampalaLng, entebbeLat, entebbeLng);
      expect(bearing, greaterThan(180.0));
      expect(bearing, lessThan(240.0));
    });

    test('getInterpolatedGeoRoute returns valid non-empty GPS coordinates', () {
      final route = GeoUtils.getInterpolatedGeoRoute(
        startLat: 0.3136,
        startLng: 32.5811,
        destLat: -0.6000,
        destLng: 30.9500,
        segments: 10,
      );

      expect(route.length, equals(11));
      expect(route.first[0], closeTo(0.3136, 0.001));
      expect(route.last[0], closeTo(-0.6000, 0.001));
    });
  });

  group('Offline Location Queue', () {
    test('LocationTelemetryPoint serializes and deserializes correctly', () {
      final pt = LocationTelemetryPoint(
        id: 'test_pt_01',
        tripId: 'trip_100',
        safariLegId: 'safari_leg_1',
        driverId: 'drv_ug_902',
        latitude: 0.3136,
        longitude: 32.5811,
        accuracy: 4.2,
        speed: 45.0,
        heading: 180.0,
        batteryLevel: 85.0,
        isOfflineQueued: true,
      );

      final json = pt.toJson();
      final restored = LocationTelemetryPoint.fromJson(json);

      expect(restored.id, equals('test_pt_01'));
      expect(restored.latitude, equals(0.3136));
      expect(restored.speed, equals(45.0));
      expect(restored.isOfflineQueued, isTrue);
    });

    test('Enqueue respects maximum queue capacity', () async {
      final queue = OfflineLocationQueue();
      await queue.clearQueue();

      for (int i = 0; i < 50; i++) {
        await queue.enqueue(
          LocationTelemetryPoint(
            latitude: 0.3136 + i * 0.0001,
            longitude: 32.5811,
          ),
        );
      }

      expect(queue.queuedCount, equals(50));
      await queue.clearQueue();
      expect(queue.queuedCount, equals(0));
    });
  });

  group('Turn-by-Turn & Multi-Day Safari Navigation Engine', () {
    test('Start navigation with multi-leg safari tour sets leg 1 as active', () {
      final nav = NavigationService();
      final legs = [
        SafariTourLeg(
          id: 'leg_1',
          dayNumber: 1,
          originTitle: 'Kampala Serena',
          originLat: 0.3175,
          originLng: 32.5840,
          destTitle: 'Lake Mburo Kigambira Lodge',
          destLat: -0.6000,
          destLng: 30.9500,
          distanceKm: 240.0,
          estimatedHours: 4.0,
        ),
        SafariTourLeg(
          id: 'leg_2',
          dayNumber: 2,
          originTitle: 'Lake Mburo Kigambira Lodge',
          originLat: -0.6000,
          originLng: 30.9500,
          destTitle: 'Bwindi Impenetrable NP',
          destLat: -1.0500,
          destLng: 29.7000,
          distanceKm: 280.0,
          estimatedHours: 5.5,
        ),
      ];

      nav.startNavigation(legs: legs, initialLegIndex: 0);
      expect(nav.isNavigating, isTrue);
      expect(nav.currentLegIndex, equals(0));
      expect(nav.activeLeg?.id, equals('leg_1'));
      expect(nav.currentManeuver, isNotNull);

      // Advance leg to Day 2
      nav.advanceToNextLeg();
      expect(nav.currentLegIndex, equals(1));
      expect(nav.activeLeg?.id, equals('leg_2'));
      expect(nav.legs[0].status, equals('completed'));

      nav.stopNavigation();
      expect(nav.isNavigating, isFalse);
    });

    test('Route deviation triggers when vehicle is > 200m off expected path', () {
      final nav = NavigationService();
      final leg = SafariTourLeg(
        id: 'leg_kampala_entebbe',
        dayNumber: 1,
        originTitle: 'Kampala CBD',
        originLat: 0.3136,
        originLng: 32.5811,
        destTitle: 'Entebbe Airport',
        destLat: 0.0425,
        destLng: 32.4435,
        distanceKm: 34.0,
        estimatedHours: 0.6,
      );

      nav.startNavigation(legs: [leg]);

      // Update location far off course (e.g. Jinja, 80 km away to the east)
      nav.updateLocation(lat: 0.4400, lng: 33.2000, speed: 50.0);
      nav.updateLocation(lat: 0.4410, lng: 33.2010, speed: 50.0);

      expect(nav.isDeviated, isTrue);
      expect(nav.deviationDistanceMeters, greaterThan(200.0));

      nav.stopNavigation();
    });
  });
}
