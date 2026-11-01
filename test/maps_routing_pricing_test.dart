import 'package:flutter_test/flutter_test.dart';
import 'package:safaris/core/services/mapbox_service.dart';
import 'package:safaris/features/rides/models/ride_model.dart';
import 'package:safaris/shared/models/location_model.dart';

void main() {
  group('Uganda Coordinate Validation & Gazetteer Coverage', () {
    test('Rejects null, NaN, (0,0), and out-of-Uganda coordinates', () {
      expect(LocationModel.isValidCoordinate(null, null), isFalse);
      expect(LocationModel.isValidCoordinate(0.0, 0.0), isFalse);
      expect(LocationModel.isValidCoordinate(double.nan, 32.5811), isFalse);
      expect(LocationModel.isWithinUganda(51.5074, -0.1278), isFalse);
    });

    test('Detects reversed GeoJSON [lng, lat] and converts to [lat, lng]', () {
      expect(LocationModel.isWithinUganda(32.5825, 0.3476), isFalse);
      expect(
        LocationModel.isLikelyReversedUgandaCoordinate(32.5825, 0.3476),
        isTrue,
      );

      final converted =
          LocationModel.fromGeoJsonCoordinate([30.6545, -0.6072]);
      expect(converted, isNotNull);
      expect(converted![0], closeTo(-0.6072, 0.0001));
      expect(converted[1], closeTo(30.6545, 0.0001));
    });

    test('Verified presets include Mbarara, Kabale, Rukungiri, Kisoro, Hoima, Gulu, Arua', () {
      final requiredCities = [
        'Mbarara',
        'Kabale',
        'Rukungiri',
        'Kisoro',
        'Hoima',
        'Gulu',
        'Arua',
      ];

      for (final city in requiredCities) {
        final match = LocationModel.presets.where(
          (p) => p.title.toLowerCase().contains(city.toLowerCase()),
        );
        expect(match, isNotEmpty, reason: 'Preset for $city should exist');
        final loc = match.first;
        expect(loc.hasValidUgandaCoordinates, isTrue);
        expect(
          LocationModel.isDefaultKampalaCoordinate(loc.latitude, loc.longitude),
          isFalse,
        );
      }
    });
  });

  group('Admin-Controlled Dynamic Fare Calculation', () {
    test('Calculates verified road distance × admin per-km rate + base fare', () {
      const adminVehicle = VehicleOption(
        id: 'veh_go_custom',
        tier: VehicleTier.go,
        title: 'Safaris Go',
        subtitle: 'Admin Configured Tier',
        baseFareUGX: 5000,
        perKmUGX: 2500,
        minimumFareUGX: 8000,
        capacity: 4,
        etaMinutes: 4,
        iconName: 'directions_car',
      );

      // 120 km road route × UGX 2,500/km = UGX 300,000 + UGX 5,000 base = UGX 305,000
      final fare120km = adminVehicle.calculateFare(120.0);
      expect(fare120km, equals(305000.0));

      // Short 0.5 km route enforces minimum fare (UGX 8,000)
      final fareShort = adminVehicle.calculateFare(0.5);
      expect(fareShort, equals(8000.0));
    });

    test('Parses backend vehicle catalogue with distance bands and pricing_version', () {
      final vehicle = VehicleOption.fromBackendJson({
        'id': 'veh_safari_4x4',
        'code': 'safari_4x4',
        'name': 'Safari 4x4 Land Cruiser',
        'passenger_capacity': 6,
        'pricing_version': 4,
        'service_pricing': {
          'ride_hailing': {
            'baseFareUgx': 20000,
            'minimumFareUgx': 35000,
            'perKmRateUgx': 4500,
            'calculationMode': 'BAND_MATCH',
            'distanceBands': [
              {'minKm': 0, 'maxKm': 10, 'ratePerKmUgx': 5000},
              {'minKm': 10, 'maxKm': null, 'ratePerKmUgx': 4500},
            ],
          },
        },
      });

      expect(vehicle.pricingVersion, equals(4));
      expect(vehicle.baseFareUGX, equals(20000.0));
      // 20 km matches the 10+ km band at UGX 4,500/km -> 20 * 4,500 + 20,000 = 110,000
      expect(vehicle.calculateFare(20.0), equals(110000.0));
    });
  });

  group('Road Route Result Validation', () {
    test('Route unavailable result reports isValid == false and zero distance', () {
      final unavail =
          MapboxRouteResult.unavailable('Provider timeout');
      expect(unavail.isValid, isFalse);
      expect(unavail.isRouteUnavailable, isTrue);
      expect(unavail.distanceKm, equals(0.0));
    });
  });
}
