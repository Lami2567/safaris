import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:safaris/core/utils/geo_utils.dart';

void main() {
  group('GeoUtils Unit Tests for Uganda Coordinates', () {
    test('Haversine distance between Kampala CBD and Entebbe Airport is approximately 34-42km', () {
      const kampalaLat = 0.3136;
      const kampalaLng = 32.5811;
      const entebbeLat = 0.0424;
      const entebbeLng = 32.4435;

      final distance = GeoUtils.haversineDistance(
        kampalaLat,
        kampalaLng,
        entebbeLat,
        entebbeLng,
      );

      // Great circle distance is ~33.8 km (driving road distance ~42km)
      expect(distance, greaterThan(30.0));
      expect(distance, lessThan(36.0));
    });

    test('Bearing calculation from Kampala to Entebbe points South-Southwest (between 180 and 240 degrees)', () {
      const kampalaLat = 0.3136;
      const kampalaLng = 32.5811;
      const entebbeLat = 0.0424;
      const entebbeLng = 32.4435;

      final bearing = GeoUtils.calculateBearing(
        kampalaLat,
        kampalaLng,
        entebbeLat,
        entebbeLng,
      );

      expect(bearing, greaterThan(180.0));
      expect(bearing, lessThan(240.0));
    });

    test('Project and Unproject roundtrip preserves coordinate within high accuracy', () {
      const testLat = 0.3354; // Acacia Mall
      const testLng = 32.5886;
      const centerLat = 0.3136;
      const centerLng = 32.5811;
      const zoom = 1.2;
      const screenSize = Size(400, 800);

      final screenPoint = GeoUtils.projectToScreen(
        lat: testLat,
        lng: testLng,
        centerLat: centerLat,
        centerLng: centerLng,
        zoom: zoom,
        screenSize: screenSize,
      );

      final unprojected = GeoUtils.unprojectToGeo(
        screenPoint: screenPoint,
        centerLat: centerLat,
        centerLng: centerLng,
        zoom: zoom,
        screenSize: screenSize,
      );

      expect(unprojected['latitude']!, closeTo(testLat, 0.0001));
      expect(unprojected['longitude']!, closeTo(testLng, 0.0001));
    });
  });
}
