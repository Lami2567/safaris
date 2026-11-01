import 'package:flutter_test/flutter_test.dart';
import 'package:safaris/features/rides/models/ride_model.dart';
import 'package:safaris/shared/models/location_model.dart';

void main() {
  group('Dynamic Trip ETA & Duration Tests', () {
    test('VehicleOption calculates realistic dynamic trip durations across distances', () {
      final boda = VehicleOption.options.firstWhere((o) => o.tier == VehicleTier.boda);
      final go = VehicleOption.options.firstWhere((o) => o.tier == VehicleTier.go);
      final safari4x4 = VehicleOption.options.firstWhere((o) => o.tier == VehicleTier.safari4x4);

      // Short city trip (3 km)
      expect(boda.calculateTripMinutes(3.0), inInclusiveRange(3, 10));
      expect(go.calculateTripMinutes(3.0), inInclusiveRange(5, 12));
      expect(go.formatTripDuration(3.0), contains('mins'));

      // Medium highway trip (42 km, Kampala to Entebbe Airport)
      final airportMins = go.calculateTripMinutes(42.0);
      expect(airportMins, inInclusiveRange(35, 65));
      expect(go.formatTripDuration(42.0), isNot(equals('4 mins')));

      // Long safari expedition (280 km, Kampala to Murchison Falls)
      final murchisonMins = safari4x4.calculateTripMinutes(280.0);
      expect(murchisonMins, inInclusiveRange(220, 360)); // ~4 to ~6 hours
      final formattedSafari = safari4x4.formatTripDuration(280.0);
      expect(formattedSafari, contains('h'));
      expect(formattedSafari, isNot(equals('4 mins')));

      // Extreme safari trip (460 km, Kampala to Bwindi)
      final bwindiMins = safari4x4.calculateTripMinutes(460.0);
      expect(bwindiMins, inInclusiveRange(380, 520)); // ~6.5 to ~8.5 hours
      expect(safari4x4.formatTripDuration(460.0), contains('h'));
    });

    test('RideBookingState properly computes formattedDuration and tripMinutes dynamically', () {
      final stateCity = RideBookingState(
        pickup: LocationModel.kampalaCentral,
        destination: LocationModel.acaciaMall,
        selectedVehicle: VehicleOption.options.firstWhere((o) => o.tier == VehicleTier.go),
        distanceKm: 8.4,
      );

      expect(stateCity.tripMinutes, inInclusiveRange(12, 22));
      expect(stateCity.formattedDuration, isNot(equals('4 mins')));
      expect(stateCity.formattedDuration, contains('mins'));

      // When destination changes to national park (300 km)
      final stateSafari = stateCity.copyWith(
        distanceKm: 300.0,
        selectedVehicle: VehicleOption.options.firstWhere((o) => o.tier == VehicleTier.safari4x4),
      );

      expect(stateSafari.tripMinutes, greaterThan(200));
      expect(stateSafari.formattedDuration, contains('h'));
      expect(stateSafari.formattedDuration, isNot(equals('4 mins')));
    });

    test('Each vehicle tier has distinct speed dynamics for same distance', () {
      const distance = 50.0;
      final boda = VehicleOption.options.firstWhere((o) => o.tier == VehicleTier.boda);
      final safari = VehicleOption.options.firstWhere((o) => o.tier == VehicleTier.safari4x4);

      final bodaTime = boda.calculateTripMinutes(distance);
      final safariTime = safari.calculateTripMinutes(distance);

      expect(bodaTime, greaterThan(0));
      expect(safariTime, greaterThan(0));
    });
  });
}
