import 'package:go_router/go_router.dart';
import '../../features/admin/screens/admin_dashboard_screen.dart';
import '../../features/authentication/screens/login_screen.dart';
import '../../features/authentication/screens/onboarding_screen.dart';
import '../../features/authentication/screens/otp_screen.dart';
import '../../features/authentication/screens/register_screen.dart';
import '../../features/authentication/screens/splash_screen.dart';
import '../../features/delivery/models/delivery_model.dart';
import '../../features/delivery/screens/delivery_home_screen.dart';
import '../../features/delivery/screens/delivery_tracking_screen.dart';
import '../../features/drivers/screens/driver_dashboard_screen.dart';
import '../../features/drivers/screens/driver_earnings_screen.dart';
import '../../features/home/screens/customer_home_screen.dart';
import '../../features/home/screens/services_catalog_screen.dart';
import '../../features/maps/screens/live_mapbox_screen.dart';
import '../../features/messaging/screens/chat_screen.dart';
import '../../features/notifications/screens/notifications_screen.dart';
import '../../features/payments/screens/payment_methods_screen.dart';
import '../../features/profile/screens/profile_screen.dart';
import '../../features/rides/models/ride_model.dart';
import '../../features/rides/screens/driver_searching_screen.dart';
import '../../features/rides/screens/live_trip_screen.dart';
import '../../features/rides/screens/ride_search_screen.dart';
import '../../features/rides/screens/trip_completed_screen.dart';
import '../../features/rides/screens/vehicle_selection_screen.dart';
import '../../features/tour_guides/screens/guide_dashboard_screen.dart';
import '../../features/tourism/models/tourism_model.dart';
import '../../features/tourism/screens/destination_detail_screen.dart';
import '../../features/tourism/screens/package_detail_screen.dart';
import '../../features/tourism/screens/tour_booking_screen.dart';
import '../../features/tourism/screens/tour_guides_list_screen.dart';
import '../../features/tourism/screens/tourism_home_screen.dart';
import '../../features/trips/screens/trip_history_screen.dart';
import '../../shared/models/location_model.dart';

final GoRouter appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    // Splash & Onboarding
    GoRoute(
      path: '/',
      builder: (context, state) => const SplashScreen(),
    ),
    GoRoute(
      path: '/auth/onboarding',
      builder: (context, state) => const OnboardingScreen(),
    ),
    GoRoute(
      path: '/auth/login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/auth/register',
      builder: (context, state) => const RegisterScreen(),
    ),
    GoRoute(
      path: '/auth/otp',
      builder: (context, state) {
        final email = (state.extra as String?) ?? '';
        return OtpVerificationScreen(email: email);
      },
    ),

    // Customer Portal
    GoRoute(
      path: '/customer',
      builder: (context, state) => const CustomerHomeScreen(),
    ),
    GoRoute(
      path: '/services',
      builder: (context, state) => const ServicesCatalogScreen(),
    ),

    // Mapbox Live Exploration & Navigation
    GoRoute(
      path: '/maps/explore',
      builder: (context, state) {
        final dest = state.extra as LocationModel?;
        return LiveMapboxScreen(initialDestination: dest);
      },
    ),

    // Rides Flow
    GoRoute(
      path: '/rides/search',
      builder: (context, state) => const RideSearchScreen(),
    ),
    GoRoute(
      path: '/rides/vehicle-select',
      builder: (context, state) {
        if (state.extra is Map<String, dynamic>) {
          final map = state.extra as Map<String, dynamic>;
          final pickup = map['pickup'] as LocationModel?;
          final destination = map['destination'] as LocationModel?;
          return VehicleSelectionScreen(
            initialPickup: pickup,
            initialDestination: destination,
          );
        }
        return const VehicleSelectionScreen();
      },
    ),
    GoRoute(
      path: '/rides/searching',
      builder: (context, state) => const DriverSearchingScreen(),
    ),
    GoRoute(
      path: '/rides/live-trip',
      builder: (context, state) => const LiveTripScreen(),
    ),
    GoRoute(
      path: '/rides/completed',
      builder: (context, state) => const TripCompletedScreen(),
    ),

    // Tourism Flow
    GoRoute(
      path: '/tourism',
      builder: (context, state) => const TourismHomeScreen(),
    ),
    GoRoute(
      path: '/tourism/destinations',
      builder: (context, state) => const TourismHomeScreen(),
    ),
    GoRoute(
      path: '/tourism/destination-detail',
      builder: (context, state) {
        final dest = (state.extra as DestinationModel?) ?? DestinationModel.sampleDestinations[0];
        return DestinationDetailScreen(destination: dest);
      },
    ),
    GoRoute(
      path: '/tourism/package-detail',
      builder: (context, state) {
        final pkg = (state.extra as TourPackageModel?) ?? TourPackageModel.samplePackages[0];
        return PackageDetailScreen(package: pkg);
      },
    ),
    GoRoute(
      path: '/tourism/book',
      builder: (context, state) {
        final pkg = (state.extra as TourPackageModel?) ?? TourPackageModel.samplePackages[0];
        return TourBookingScreen(package: pkg);
      },
    ),
    GoRoute(
      path: '/tourism/guides',
      builder: (context, state) => const TourGuidesListScreen(),
    ),

    // Delivery Flow
    GoRoute(
      path: '/delivery',
      builder: (context, state) => const DeliveryHomeScreen(),
    ),
    GoRoute(
      path: '/delivery/tracking',
      builder: (context, state) {
        final order = (state.extra as DeliveryOrderModel?) ??
            const DeliveryOrderModel(
              id: 'del_kla_7719',
              pickupAddress: 'Kampala CBD',
              dropoffAddress: 'Ntinda Shopping Centre',
              senderPhone: '+256 772 123456',
              recipientName: 'Grace Nakato',
              recipientPhone: '+256 752 839102',
              category: PackageCategory.documents,
              packageDescription: 'Legal contracts',
              weightKg: 2.0,
              priceUGX: 7000,
            );
        return DeliveryTrackingScreen(order: order);
      },
    ),

    // Driver Flow
    GoRoute(
      path: '/driver',
      builder: (context, state) => const DriverDashboardScreen(),
    ),
    GoRoute(
      path: '/driver/earnings',
      builder: (context, state) => const DriverEarningsScreen(),
    ),

    // Tour Guide Flow
    GoRoute(
      path: '/tour-guide',
      builder: (context, state) => const GuideDashboardScreen(),
    ),

    // Administration Flow
    GoRoute(
      path: '/admin',
      builder: (context, state) => const AdminDashboardScreen(),
    ),

    // Common & Shared Flows
    GoRoute(
      path: '/payments',
      builder: (context, state) => const PaymentMethodsScreen(),
    ),
    GoRoute(
      path: '/notifications',
      builder: (context, state) => const NotificationsScreen(),
    ),
    GoRoute(
      path: '/messaging/driver',
      builder: (context, state) {
        final driver = state.extra as DriverModel?;
        return ChatScreen(driver: driver);
      },
    ),
    GoRoute(
      path: '/trips/history',
      builder: (context, state) => const TripHistoryScreen(),
    ),
    GoRoute(
      path: '/profile',
      builder: (context, state) => const ProfileScreen(),
    ),
    GoRoute(
      path: '/support',
      builder: (context, state) => const ProfileScreen(),
    ),
  ],
);
