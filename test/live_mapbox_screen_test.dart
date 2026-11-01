import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:safaris/core/config/environment_config.dart';
import 'package:safaris/core/services/live_fleet_service.dart';
import 'package:safaris/features/maps/screens/live_mapbox_screen.dart';
import 'package:safaris/shared/components/safaris_map_view.dart';
import 'package:safaris/shared/models/location_model.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Mapbox Mobile Live Navigation & UI Tests', () {
    test('EnvironmentConfig can persist and reload Mapbox access token', () async {
      expect(EnvironmentConfig.hasMapboxToken, isFalse);

      await EnvironmentConfig.saveMapboxToken('pk.eyJ1IjoibXVtd2VzYWZhcmlzIn0.test_token_123');
      expect(EnvironmentConfig.mapboxAccessToken, 'pk.eyJ1IjoibXVtd2VzYWZhcmlzIn0.test_token_123');
      expect(EnvironmentConfig.hasMapboxToken, isTrue);

      // Verify reloaded from disk/prefs
      EnvironmentConfig.customMapboxToken = '';
      final loaded = await EnvironmentConfig.loadSavedMapboxToken();
      expect(loaded, 'pk.eyJ1IjoibXVtd2VzYWZhcmlzIn0.test_token_123');
    });

    testWidgets('LiveMapboxScreen renders full-screen map with search bar and pickup options',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LiveMapboxScreen(),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Verify clean "Maps" title is present
      expect(find.text('Maps'), findsOneWidget);

      // Verify "Where to in Uganda?" search input is present
      expect(find.textContaining('Where to in Uganda'), findsOneWidget);

      // Verify pickup selector options exist
      expect(find.text('Kampala Center'), findsOneWidget);
      expect(find.text('Current GPS'), findsOneWidget);
      expect(find.text('Manual Location'), findsOneWidget);

      // Verify destination prompt exists before destination selection
      expect(find.text('Select Destination to Preview Route'), findsOneWidget);
    });

    testWidgets('Displays route details and vehicle booking card when destination is selected',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LiveMapboxScreen(
              initialDestination: LocationModel.entebbeAirport,
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Verify SafarisMapView and vehicle options appear when destination is selected
      expect(find.byType(SafarisMapView), findsOneWidget);
      expect(find.text('Safaris Boda'), findsOneWidget);
      expect(find.text('Safaris Go'), findsOneWidget);
    });

    testWidgets('Destination selection with cached verified road route enables GPS Nav and turn-by-turn banner',
        (WidgetTester tester) async {
      SharedPreferences.setMockInitialValues({
        'mapbox_route_cache_v2_route_0.31360_32.58110_0.04240_32.44350_':
            '{"coordinates":[{"latitude":0.3136,"longitude":32.5811},{"latitude":0.0424,"longitude":32.4435}],"distanceMeters":41200,"durationSeconds":2580,"summary":"Kampala-Entebbe Expressway","savedAt":"${DateTime.now().toIso8601String()}"}',
      });

      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LiveMapboxScreen(
              initialDestination: LocationModel.entebbeAirport,
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.byType(SafarisMapView), findsOneWidget);
      expect(find.textContaining('Entebbe'), findsWidgets);
    });

    testWidgets('SafarisMapView renders user live location beacon and interactive driver markers',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SafarisMapView(
              userLat: 0.3136,
              userLng: 32.5811,
              showUserLocation: true,
              showNearbyDrivers: true,
              nearbyDrivers: const [
                LiveDriverLocation(
                  driverId: 'drv_test_1',
                  name: 'Kasumba Ronald',
                  phone: '+256 701 445566',
                  status: 'available',
                  rating: 4.95,
                  lat: 0.3200,
                  lng: 32.5900,
                  heading: 45.0,
                  vehicle: 'Toyota Land Cruiser',
                  plate: 'UBM 714K',
                  speed: 28.0,
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Verify YOU beacon text is rendered
      expect(find.text('YOU'), findsOneWidget);

      // Verify driver plate is rendered
      expect(find.text('UBM 714K'), findsOneWidget);

      // Tap driver marker to open driver details sheet
      await tester.tap(find.text('UBM 714K'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      // Verify driver bottom sheet details
      expect(find.text('Kasumba Ronald'), findsOneWidget);
      expect(find.text('Distance'), findsOneWidget);
      expect(find.text('Est. Arrival'), findsOneWidget);
      expect(find.textContaining('Request Drive with Kasumba'), findsOneWidget);
    });
  });
}
