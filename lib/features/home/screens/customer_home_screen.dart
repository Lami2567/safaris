import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/config/remote_config_service.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/services/live_fleet_service.dart';
import '../../../core/services/user_location_provider.dart';
import '../../../shared/components/safaris_map_view.dart';
import '../../../shared/components/role_drawer.dart';
import '../../../shared/models/location_model.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../../authentication/session_provider.dart';
import '../../notifications/notification_provider.dart';
import '../../tourism/models/tourism_model.dart';
import '../../tourism/services/tourism_api_service.dart';
import '../../../core/theme/theme_provider.dart';

class CustomerHomeScreen extends ConsumerStatefulWidget {
  const CustomerHomeScreen({super.key});

  @override
  ConsumerState<CustomerHomeScreen> createState() => _CustomerHomeScreenState();
}

class _CustomerHomeScreenState extends ConsumerState<CustomerHomeScreen> {
  int _bottomNavIndex = 0;
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final userLoc = ref.watch(userLocationProvider);
    final double? userLat = userLoc.latitude;
    final double? userLng = userLoc.longitude;
    final String userLocality = userLoc.hasCoordinates ? userLoc.locality : 'Uganda';
    final remoteConfig = ref.watch(remoteConfigProvider);
    final services = remoteConfig.enabledServices;
    final fleetState = ref.watch(liveFleetProvider);
    final nearbyDrivers = fleetState.drivers;
    final destinationsAsync = ref.watch(destinationsListProvider);
    final liveDestinations = destinationsAsync.value ?? [];
    final unreadNotifs = ref.watch(unreadNotificationsCountProvider);

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.background,
      drawer: const SafarisDrawer(),
      body: SafeArea(
        child: Column(
          children: [
            // Top App Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
              child: Row(
                children: [
                  IconButton(
                    icon: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        border: Border.all(color: AppColors.border, width: 0.8),
                      ),
                      child: Icon(Icons.menu_rounded, size: 20, color: AppColors.iconPrimary),
                    ),
                    onPressed: () => _scaffoldKey.currentState?.openDrawer(),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              AppConstants.appName,
                              style: AppTypography.titleMedium.copyWith(
                                letterSpacing: 2,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(width: 8),
                            const SafarisBadge(
                              text: 'UGANDA',
                              variant: SafarisBadgeVariant.accent,
                            ),
                          ],
                        ),
                        Text(
                          'Hello, ${user.fullName.split(" ").first} • $userLocality',
                          style: AppTypography.bodySmall.copyWith(fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  Consumer(
                    builder: (context, ref, _) {
                      final themeMode = ref.watch(themeModeProvider);
                      final isDark = themeMode == ThemeMode.dark;
                      return IconButton(
                        tooltip: isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode',
                        icon: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceElevated,
                            borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                            border: Border.all(color: AppColors.border, width: 0.8),
                          ),
                          child: Icon(
                            isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded,
                            size: 20,
                            color: AppColors.accent,
                          ),
                        ),
                        onPressed: () => ref.read(themeModeProvider.notifier).toggleTheme(),
                      );
                    },
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    icon: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceElevated,
                            borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                            border: Border.all(color: AppColors.border, width: 0.8),
                          ),
                          child: Icon(
                            Icons.notifications_none_rounded,
                            size: 20,
                            color: AppColors.iconPrimary,
                          ),
                        ),
                        if (unreadNotifs > 0)
                          Positioned(
                            right: -2,
                            top: -2,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                              decoration: BoxDecoration(
                                color: AppColors.accent,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: AppColors.background, width: 1.5),
                              ),
                              constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                              child: Text(
                                unreadNotifs > 99 ? '99+' : '$unreadNotifs',
                                textAlign: TextAlign.center,
                                style: AppTypography.labelSmall.copyWith(
                                  color: AppColors.backgroundDark,
                                  fontSize: 9,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    onPressed: () => context.push('/notifications'),
                  ),
                ],
              ),
            ),

            // Scrollable Content
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                children: [
                  const SizedBox(height: AppSpacing.xs),

                  // "Where to?" Search Bar (Uber style)
                  GestureDetector(
                    onTap: () => context.push('/rides/search'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 14),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                        border: Border.all(color: AppColors.borderLight, width: 1),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.3),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.search_rounded, color: AppColors.accent, size: 24),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Text(
                              'Where to in Uganda?',
                              style: AppTypography.titleSmall.copyWith(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceHigher,
                              borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                            ),
                            child: Row(
                              children: [
                                Icon(Icons.access_time_rounded, size: 14, color: AppColors.textSecondary),
                                const SizedBox(width: 4),
                                Text(
                                  'Now',
                                  style: AppTypography.labelSmall.copyWith(color: AppColors.textPrimary),
                                ),
                                Icon(Icons.keyboard_arrow_down_rounded, size: 14, color: AppColors.textSecondary),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),

                  // Map section header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Map',
                        style: AppTypography.titleSmall.copyWith(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      TextButton.icon(
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        icon: const Icon(Icons.open_in_full_rounded, size: 13, color: AppColors.accent),
                        label: Text(
                          'Full Map',
                          style: AppTypography.labelMedium.copyWith(color: AppColors.accent, fontSize: 13),
                        ),
                        onPressed: () => context.push('/maps/explore'),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xs),

                  // Expanded 340px Live Mapbox Preview Hero Card
                  Container(
                    height: 340,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceElevated,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                      border: Border.all(color: AppColors.border, width: 1),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.35),
                          blurRadius: 16,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Stack(
                      children: [
                        SafarisMapView(
                          showNearbyDrivers: true,
                          nearbyDrivers: nearbyDrivers,
                          showExpandButton: true,
                          onExpand: () => context.push('/maps/explore'),
                          etaText: nearbyDrivers.isNotEmpty ? '3 mins to pickup' : null,
                          distanceText: nearbyDrivers.isNotEmpty ? '${nearbyDrivers.length} Online' : null,
                          userLat: userLat,
                          userLng: userLng,
                          showUserLocation: true,
                          onDriverSelected: (driver) {
                            context.push('/maps/explore');
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),

                  // Quick Destination Route Shortcuts (Configured from Admin Dashboard)
                  SizedBox(
                    height: 42,
                    child: Builder(
                      builder: (context) {
                        final adminPlaces = remoteConfig.quickPlaces;
                        final count = adminPlaces.isNotEmpty
                            ? adminPlaces.length
                            : (liveDestinations.isNotEmpty ? liveDestinations.length : LocationModel.presets.length);

                        return ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: count,
                          separatorBuilder: (_, __) => const SizedBox(width: 8),
                          itemBuilder: (context, index) {
                            final LocationModel place;
                            if (adminPlaces.isNotEmpty) {
                              place = adminPlaces[index].toLocationModel();
                            } else if (liveDestinations.isNotEmpty) {
                              place = liveDestinations[index].toLocationModel();
                            } else {
                              place = LocationModel.presets[index];
                            }

                            return _QuickMapChip(
                              label: place.title.split(',').first,
                              onTap: () => context.push('/maps/explore', extra: place),
                            );
                          },
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),

                  // Dynamic Services Grid (from Remote Configuration)
                  if (services.isNotEmpty) ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Services',
                          style: AppTypography.titleSmall.copyWith(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        TextButton(
                          onPressed: () => context.push('/services'),
                          child: Text(
                            'View all',
                            style: AppTypography.labelMedium.copyWith(color: AppColors.accent),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.xs),

                    // Primary Service Cards
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        mainAxisExtent: 215.0,
                      ),
                      itemCount: services.take(4).length,
                      itemBuilder: (context, index) {
                        final s = services[index];
                        return _ServiceTile(
                          service: s,
                          onTap: () => _handleServiceNavigation(context, s.type),
                        );
                      },
                    ),
                    const SizedBox(height: AppSpacing.xl),
                  ],

                  // Promotional Uganda Tourism Safaris Banners (Figma style)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Special Expeditions',
                        style: AppTypography.titleSmall.copyWith(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      GestureDetector(
                        onTap: () => context.push('/tourism'),
                        child: Text(
                          'Explore Safaris',
                          style: AppTypography.labelMedium.copyWith(color: AppColors.accent),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),

                  SizedBox(
                    height: 155,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: remoteConfig.banners.length,
                      separatorBuilder: (context, index) => const SizedBox(width: 12),
                      itemBuilder: (context, index) {
                        final banner = remoteConfig.banners[index];
                        return _PromoBannerCard(
                          banner: banner,
                          onTap: () => context.push('/tourism/destinations'),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),

                  // Saved / Frequent Destinations (From Admin Dashboard)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Frequent Destinations',
                        style: AppTypography.titleSmall.copyWith(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      GestureDetector(
                        onTap: () => context.push('/tourism/destinations'),
                        child: Text(
                          'View all',
                          style: AppTypography.labelMedium.copyWith(color: AppColors.accent),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),

                  ...(liveDestinations.isNotEmpty
                          ? liveDestinations.take(3)
                          : DestinationModel.sampleDestinations.take(3))
                      .map((dest) {
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: Material(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: () {
                            context.push(
                              '/tourism/destination-detail',
                              extra: dest,
                            );
                          },
                          borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                          child: Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                              border: Border.all(color: AppColors.border, width: 1),
                            ),
                            child: IntrinsicHeight(
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.center,
                                children: [
                                  // Image First
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                                    child: Container(
                                      width: 72,
                                      constraints: const BoxConstraints(minHeight: 72),
                                      child: dest.effectiveImageUrl.isNotEmpty
                                          ? Image.network(
                                              dest.effectiveImageUrl,
                                              fit: BoxFit.cover,
                                              errorBuilder: (_, __, ___) => Container(
                                                color: AppColors.surfaceHigher,
                                                child: const Center(
                                                  child: Icon(Icons.landscape_rounded, color: AppColors.accent, size: 28),
                                                ),
                                              ),
                                            )
                                          : Container(
                                              color: AppColors.surfaceHigher,
                                              child: const Center(
                                                child: Icon(Icons.landscape_rounded, color: AppColors.accent, size: 28),
                                              ),
                                            ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  // Details in front of the image
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          dest.title,
                                          style: AppTypography.titleSmall.copyWith(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w700,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          dest.region.isNotEmpty ? dest.region : dest.subtitle,
                                          style: AppTypography.bodySmall.copyWith(
                                            fontSize: 11,
                                            color: AppColors.textSecondary,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 4),
                                        Row(
                                          children: [
                                            const Icon(Icons.near_me_outlined, size: 12, color: AppColors.accent),
                                            const SizedBox(width: 4),
                                            Expanded(
                                              child: Text(
                                                '${dest.distanceHoursFromKampala}h drive from Kampala',
                                                style: AppTypography.labelSmall.copyWith(
                                                  fontSize: 10,
                                                  color: AppColors.accent,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Icon(Icons.arrow_forward_ios_rounded, size: 14, color: AppColors.iconSecondary),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                  const SizedBox(height: AppSpacing.xxl),
                ],
              ),
            ),

            // Bottom Navigation Bar matching Figma Uber style
            Container(
              decoration: BoxDecoration(
                color: AppColors.surface,
                border: Border(top: BorderSide(color: AppColors.border, width: 1)),
              ),
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _BottomNavItem(
                    icon: Icons.home_filled,
                    label: 'Home',
                    isSelected: _bottomNavIndex == 0,
                    onTap: () => setState(() => _bottomNavIndex = 0),
                  ),
                  _BottomNavItem(
                    icon: Icons.map_rounded,
                    label: 'Maps',
                    isSelected: _bottomNavIndex == 1,
                    onTap: () {
                      setState(() => _bottomNavIndex = 1);
                      context.push('/maps/explore');
                    },
                  ),
                  _BottomNavItem(
                    icon: Icons.grid_view_rounded,
                    label: 'Services',
                    isSelected: _bottomNavIndex == 2,
                    onTap: () {
                      setState(() => _bottomNavIndex = 2);
                      context.push('/services');
                    },
                  ),
                  _BottomNavItem(
                    icon: Icons.history_rounded,
                    label: 'Activity',
                    isSelected: _bottomNavIndex == 3,
                    onTap: () {
                      setState(() => _bottomNavIndex = 3);
                      context.push('/trips/history');
                    },
                  ),
                  _BottomNavItem(
                    icon: Icons.person_outline_rounded,
                    label: 'Account',
                    isSelected: _bottomNavIndex == 4,
                    onTap: () {
                      setState(() => _bottomNavIndex = 4);
                      context.push('/profile');
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _handleServiceNavigation(BuildContext context, AppServiceType type) {
    switch (type) {
      case AppServiceType.rides:
        context.push('/rides/search');
        break;
      case AppServiceType.airportPickup:
        context.push(
          '/rides/vehicle-select',
          extra: {
            'pickup': LocationModel.kampalaCentral,
            'destination': LocationModel.entebbeAirport,
          },
        );
        break;
      case AppServiceType.tourism:
        context.push('/tourism');
        break;
      case AppServiceType.tourGuides:
        context.push('/tourism/guides');
        break;
      case AppServiceType.delivery:
        context.push('/delivery');
        break;
      case AppServiceType.hotelBooking:
      case AppServiceType.carRental:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Configured remotely - launching booking engine')),
        );
        break;
    }
  }
}

class _BottomNavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _BottomNavItem({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 22,
            color: isSelected ? AppColors.accent : AppColors.iconSecondary,
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: AppTypography.labelSmall.copyWith(
              color: isSelected ? AppColors.accent : AppColors.textSecondary,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _ServiceTile extends StatelessWidget {
  final RemoteServiceConfig service;
  final VoidCallback onTap;

  const _ServiceTile({required this.service, required this.onTap});

  IconData _getIcon() {
    switch (service.type) {
      case AppServiceType.rides:
        return Icons.directions_car_rounded;
      case AppServiceType.airportPickup:
        return Icons.flight_takeoff_rounded;
      case AppServiceType.tourism:
        return Icons.terrain_rounded;
      case AppServiceType.tourGuides:
        return Icons.hiking_rounded;
      case AppServiceType.delivery:
        return Icons.local_shipping_rounded;
      case AppServiceType.hotelBooking:
        return Icons.hotel_rounded;
      case AppServiceType.carRental:
        return Icons.key_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceElevated,
      borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
            border: Border.all(color: AppColors.border, width: 1),
          ),
          child: service.effectiveImageUrl.isNotEmpty
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Clean, high-impact hero image with subtle bottom gradient scrim
                    Expanded(
                      child: ClipRRect(
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusLg)),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.network(
                              service.effectiveImageUrl,
                              fit: BoxFit.cover,
                              width: double.infinity,
                              loadingBuilder: (context, child, loadingProgress) {
                                if (loadingProgress == null) return child;
                                return Container(
                                  color: AppColors.surfaceHigher,
                                  child: const Center(
                                    child: SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        valueColor: AlwaysStoppedAnimation<Color>(AppColors.accent),
                                      ),
                                    ),
                                  ),
                                );
                              },
                              errorBuilder: (_, __, ___) => Container(
                                color: AppColors.surfaceHigher,
                                child: Center(
                                  child: Icon(_getIcon(), size: 28, color: AppColors.accent),
                                ),
                              ),
                            ),
                            Positioned(
                              top: 8,
                              right: 8,
                              child: Container(
                                padding: const EdgeInsets.all(4),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.45),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.arrow_forward_rounded,
                                  size: 13,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            service.title,
                            style: AppTypography.titleSmall.copyWith(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            service.subtitle,
                            style: AppTypography.bodySmall.copyWith(
                              fontSize: 10.5,
                              color: AppColors.textSecondary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ],
                )
              : Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceHigher,
                              borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                            ),
                            child: Icon(_getIcon(), size: 22, color: AppColors.accent),
                          ),
                          Icon(Icons.arrow_forward_rounded, size: 16, color: AppColors.iconSecondary),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            service.title,
                            style: AppTypography.titleSmall.copyWith(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            service.subtitle,
                            style: AppTypography.bodySmall.copyWith(
                              fontSize: 10.5,
                              color: AppColors.textSecondary,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }
}

class _PromoBannerCard extends StatelessWidget {
  final PromoBannerConfig banner;
  final VoidCallback onTap;

  const _PromoBannerCard({required this.banner, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final hasImage = banner.effectiveImageUrl.trim().isNotEmpty;

    // High-contrast, crystal-clear color palette for both Light and Dark modes
    final Color cardBackground = isDark ? AppColors.darkSurfaceElevated : AppColors.lightSurfaceElevated;
    final Color cardBorderColor = isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0);

    // When a photo image is present with dark scrim, typography must always be bright white
    final Color tagBackground = hasImage
        ? Colors.black.withValues(alpha: 0.50)
        : (isDark ? AppColors.darkSurfaceHigher : const Color(0xFFF1F5F9));
    final Color tagBorderColor = hasImage
        ? Colors.white.withValues(alpha: 0.30)
        : (isDark ? AppColors.darkBorderLight : const Color(0xFFCBD5E1));
    final Color tagTextColor = hasImage
        ? Colors.white
        : (isDark ? AppColors.darkTextPrimary : const Color(0xFF0F172A));

    final Color headlineColor = hasImage
        ? Colors.white
        : (isDark ? AppColors.darkTextPrimary : const Color(0xFF0F172A));

    final Color discountColor = hasImage
        ? Colors.white.withValues(alpha: 0.95)
        : (isDark ? const Color(0xFFCBD5E1) : const Color(0xFF1E293B));

    final Color iconColor = hasImage
        ? Colors.white.withValues(alpha: 0.90)
        : (isDark ? AppColors.darkIconSecondary : const Color(0xFF0F172A));

    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        child: Container(
          width: 280,
          decoration: BoxDecoration(
            color: cardBackground,
            borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
            border: Border.all(color: cardBorderColor, width: isDark ? 1.0 : 1.2),
            boxShadow: isDark
                ? null
                : [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (hasImage) ...[
                Image.network(
                  banner.effectiveImageUrl,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  height: double.infinity,
                  errorBuilder: (_, __, ___) => Container(
                    color: cardBackground,
                  ),
                ),
                // Dark gradient scrim overlay so typography is crystal clear over photography
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Colors.black.withValues(alpha: 0.35),
                        Colors.black.withValues(alpha: 0.78),
                      ],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                ),
              ] else
                // Single solid background color (no gradient, no orange)
                Container(
                  color: cardBackground,
                ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: tagBackground,
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: tagBorderColor, width: 0.8),
                          ),
                          child: Text(
                            banner.tag,
                            style: AppTypography.labelSmall.copyWith(
                              color: tagTextColor,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                              fontSize: 10.5,
                            ),
                          ),
                        ),
                        Icon(Icons.arrow_outward_rounded, size: 16, color: iconColor),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          banner.headline,
                          style: AppTypography.titleSmall.copyWith(
                            fontWeight: FontWeight.w700,
                            fontSize: 15.5,
                            color: headlineColor,
                            letterSpacing: -0.2,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 3),
                        Text(
                          banner.discountText,
                          style: AppTypography.bodySmall.copyWith(
                            color: discountColor,
                            fontWeight: FontWeight.w600,
                            fontSize: 12.5,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickMapChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _QuickMapChip({
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.surfaceElevated,
            borderRadius: BorderRadius.circular(8), // smaller rounded corners as requested
            border: Border.all(
              color: AppColors.borderLight.withValues(alpha: 0.8),
              width: 1.0,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 4,
                offset: const Offset(0, 1.5),
              ),
            ],
          ),
          child: Center(
            child: Text(
              label,
              style: AppTypography.labelSmall.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w600,
                fontSize: 12.5,
                letterSpacing: 0.2,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
      ),
    );
  }
}
