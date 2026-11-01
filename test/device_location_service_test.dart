import 'package:flutter_test/flutter_test.dart';
import 'package:safaris/core/services/device_location_service.dart';
import 'package:safaris/core/services/user_location_provider.dart';

void main() {
  group('DeviceLocationService Uganda Locality & Positioning Tests', () {
    test('Resolves exact Uganda city and region names from GPS coordinates', () {
      // Entebbe Airport / Town
      final entebbe = DeviceLocationService.getUgandaLocalityName(0.0512, 32.4637);
      expect(entebbe, contains('Entebbe'));

      // Kampala CBD
      final kampala = DeviceLocationService.getUgandaLocalityName(0.3136, 32.5811);
      expect(kampala, contains('Kampala'));

      // Jinja (Source of Nile)
      final jinja = DeviceLocationService.getUgandaLocalityName(0.4479, 33.2026);
      expect(jinja, contains('Jinja'));

      // Mbarara (Western Hub)
      final mbarara = DeviceLocationService.getUgandaLocalityName(-0.6072, 30.6545);
      expect(mbarara, contains('Mbarara'));

      // Fort Portal (Rwenzori / Tourism Capital)
      final fortPortal = DeviceLocationService.getUgandaLocalityName(0.6559, 30.2740);
      expect(fortPortal, contains('Fort Portal'));

      // Gulu (Northern Hub)
      final gulu = DeviceLocationService.getUgandaLocalityName(2.7747, 32.2990);
      expect(gulu, contains('Gulu'));
    });

    test('UserLocationState tracks permission, readiness and coordinate availability', () {
      const initial = UserLocationState();
      expect(initial.isGranted, isFalse);
      expect(initial.hasCoordinates, isFalse);
      expect(initial.isReady, isFalse);

      final withLocation = initial.copyWith(
        latitude: 0.0512,
        longitude: 32.4637,
        locality: 'Entebbe, Uganda',
        permissionStatus: DeviceLocationPermissionStatus.granted,
      );

      expect(withLocation.isGranted, isTrue);
      expect(withLocation.hasCoordinates, isTrue);
      expect(withLocation.isReady, isTrue);
      expect(withLocation.locality, 'Entebbe, Uganda');
    });
  });
}
