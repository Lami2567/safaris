import 'package:flutter_test/flutter_test.dart';
import 'package:safaris/core/services/mapbox_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Mapbox Service & Routing Tests', () {
    test('MapboxCoordinate serializes and deserializes correctly', () {
      const coord = MapboxCoordinate(0.3476, 32.5825);
      final json = coord.toJson();
      expect(json['latitude'], 0.3476);
      expect(json['longitude'], 32.5825);

      final fromJson = MapboxCoordinate.fromJson(json);
      expect(fromJson.latitude, 0.3476);
      expect(fromJson.longitude, 32.5825);
    });

    test('MapboxRouteResult formats distance and duration cleanly', () {
      const resultShort = MapboxRouteResult(
        coordinates: [MapboxCoordinate(0.31, 32.58), MapboxCoordinate(0.32, 32.59)],
        distanceMeters: 850,
        durationSeconds: 120,
        maneuvers: [],
      );
      expect(resultShort.formattedDistance, '850 m');
      expect(resultShort.formattedDuration, '2 mins');

      const resultLong = MapboxRouteResult(
        coordinates: [],
        distanceMeters: 245300,
        durationSeconds: 16200,
        maneuvers: [],
      );
      expect(resultLong.formattedDistance, '245.3 km');
      expect(resultLong.formattedDuration, '4h 30m');
    });

    test('getDirections returns cached verified route when available and route unavailable when uncached offline', () async {
      final service = MapboxService();
      // When completely offline and uncached, must not fabricate a 1.35x straight line:
      final uncachedRoute = await service.getDirections(
        originLat: 0.3136,
        originLng: 32.5811,
        destLat: -0.6066,
        destLng: 30.9328,
      );
      expect(uncachedRoute.isRouteUnavailable, isTrue);

      // Seed a verified road route in SharedPreferences cache and verify retrieval:
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'mapbox_route_cache_v2_route_0.31360_32.58110_-0.60660_30.93280_',
        '{"coordinates":[{"latitude":0.3136,"longitude":32.5811},{"latitude":-0.6066,"longitude":30.9328}],"distanceMeters":232400,"durationSeconds":12600,"summary":"Kampala-Masaka-Mbarara Highway","savedAt":"${DateTime.now().toIso8601String()}"}',
      );

      final route = await service.getDirections(
        originLat: 0.3136,
        originLng: 32.5811,
        destLat: -0.6066,
        destLng: 30.9328,
      );

      expect(route.isRouteUnavailable, isFalse);
      expect(route.coordinates.isNotEmpty, isTrue);
      expect(route.distanceMeters, greaterThan(150000)); // > 150 km
      expect(route.durationSeconds, greaterThan(7200));   // > 2 hours
      expect(route.isFromCache, isTrue);
    });

    test('downloadOfflineSafariRegion stores region in SharedPreferences', () async {
      final service = MapboxService();
      final success = await service.downloadOfflineSafariRegion(
        regionName: 'Western Uganda Gorilla Route',
        minLat: -1.4,
        minLng: 29.5,
        maxLat: 0.5,
        maxLng: 31.5,
      );
      expect(success, isTrue);

      final regions = await service.getOfflineSafariRegions();
      expect(regions.length, 1);
      expect(regions.first['name'], 'Western Uganda Gorilla Route');
    });
  });
}
