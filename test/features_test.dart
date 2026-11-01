import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:safaris/core/config/remote_config_service.dart';
import 'package:safaris/core/utils/currency_formatter.dart';
import 'package:safaris/features/authentication/session_provider.dart';
import 'package:safaris/features/rides/models/ride_model.dart';
import 'package:safaris/shared/models/user_model.dart';

void main() {
  group('SAFARIS Unit & Feature Tests', () {
    test('CurrencyFormatter accurately formats Uganda UGX', () {
      expect(CurrencyFormatter.formatUGX(15000), 'UGX 15,000');
      expect(CurrencyFormatter.formatUGX(2800000), 'UGX 2,800,000');
      expect(CurrencyFormatter.formatShort(1500000), '1.5M UGX');
      expect(CurrencyFormatter.formatShort(85000), '85K UGX');
    });

    test('VehicleOption calculates correct trip fare based on distance', () {
      final boda = VehicleOption.options.firstWhere((o) => o.tier == VehicleTier.boda);
      // baseFare: 3000, perKm: 1200 => 3000 + (10 * 1200) = 15000 UGX
      expect(boda.calculateFare(10.0), 15000.0);

      final comfort = VehicleOption.options.firstWhere((o) => o.tier == VehicleTier.comfort);
      // baseFare: 10000, perKm: 3200 => 10000 + (42 * 3200) = 144400 UGX (Entebbe Airport run)
      expect(comfort.calculateFare(42.0), 144400.0);
    });

    test('RemoteConfigNotifier toggles services and feature flags dynamically', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final state = container.read(remoteConfigProvider);

      // Initially hotel booking is disabled
      final initialHotel = state.services.firstWhere((s) => s.id == 'hotel_booking');
      expect(initialHotel.isEnabled, isFalse);

      // Admin enables Hotel Booking remotely
      container.read(remoteConfigProvider.notifier).toggleService('hotel_booking', true);
      final updatedState = container.read(remoteConfigProvider);
      final updatedHotel = updatedState.services.firstWhere((s) => s.id == 'hotel_booking');
      expect(updatedHotel.isEnabled, isTrue);

      // Toggle maintenance mode
      container.read(remoteConfigProvider.notifier).updateMaintenanceMode(true);
      expect(container.read(remoteConfigProvider).versionConfig.maintenanceMode, isTrue);
    });

    test('SessionNotifier manages user roles and wallet transactions', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final initialUser = container.read(currentUserProvider);
      expect(initialUser.role, UserRole.customer);

      // Switch to Driver Portal
      container.read(currentUserProvider.notifier).setRole(UserRole.driver);
      expect(container.read(currentUserProvider).role, UserRole.driver);

      // Verified balance check
      final balance = container.read(currentUserProvider).walletBalanceUGX;
      expect(balance, isA<double>());
    });
  });
}
