import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/services/offline_location_queue.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/components/safaris_map_view.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../models/ride_model.dart';
import '../ride_provider.dart';

class LiveTripScreen extends ConsumerWidget {
  const LiveTripScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ride = ref.watch(rideBookingProvider);
    final driver = ride.driver ?? DriverModel.sampleDriver;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: SafarisAppBar(
        title: 'Active Trip',
        subtitle: 'Heading to ${ride.destination.title}',
        showBack: false,
        actions: [
          IconButton(
            icon: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.errorMuted,
                borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                border: Border.all(color: AppColors.error, width: 1),
              ),
              child: Row(
                children: [
                  const Icon(Icons.shield_rounded, size: 14, color: AppColors.error),
                  const SizedBox(width: 4),
                  Text(
                    'SOS',
                    style: AppTypography.labelSmall.copyWith(
                      color: AppColors.error,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Safaris 24/7 Security & Uganda Police Emergency Hotline notified'),
                  backgroundColor: AppColors.error,
                ),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Live Animated Map Canvas
          Expanded(
            flex: 5,
            child: SafarisMapView(
              pickupLocation: ride.pickup,
              destinationLocation: ride.destination,
              showDriver: true,
              isLiveTrip: true,
              driverLat: ride.driverLat,
              driverLng: ride.driverLng,
              driverHeading: ride.driverHeading,
              etaText: '${ride.formattedDuration} remaining',
              distanceText: '${ride.distanceKm.toStringAsFixed(1)} km',
              connectionState: OfflineLocationQueue().connectionState,
            ),
          ),

          // Bottom Driver & Trip Information Card
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusXl)),
              border: Border(top: BorderSide(color: AppColors.border, width: 1)),
            ),
            padding: const EdgeInsets.all(AppSpacing.md),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Status Pill
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: AppColors.success,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'ON THE WAY TO DESTINATION',
                            style: AppTypography.labelSmall.copyWith(
                              color: AppColors.success,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        CurrencyFormatter.formatUGX(ride.estimatedFareUGX),
                        style: AppTypography.titleSmall.copyWith(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Divider(color: AppColors.divider),
                  const SizedBox(height: AppSpacing.sm),

                  // Driver Details Row
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 26,
                        backgroundColor: AppColors.accent,
                        child: Text(
                          driver.fullName[0],
                          style: AppTypography.titleMedium.copyWith(
                            color: AppColors.backgroundDark,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  driver.fullName,
                                  style: AppTypography.titleSmall.copyWith(fontSize: 16),
                                ),
                                const SizedBox(width: 6),
                                const Icon(Icons.star_rounded, size: 14, color: AppColors.accent),
                                Text(
                                  driver.rating.toStringAsFixed(2),
                                  style: AppTypography.bodySmall.copyWith(
                                    color: AppColors.textPrimary,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${driver.vehicleModel} • ${driver.vehicleColor}',
                              style: AppTypography.bodySmall,
                            ),
                            const SizedBox(height: 2),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceElevated,
                                borderRadius: BorderRadius.circular(4),
                                border: Border.all(color: AppColors.borderLight, width: 0.8),
                              ),
                              child: Text(
                                driver.licensePlate,
                                style: AppTypography.labelSmall.copyWith(
                                  color: AppColors.accent,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 1.0,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Action Icons
                      Row(
                        children: [
                          IconButton(
                            icon: Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceElevated,
                                shape: BoxShape.circle,
                                border: Border.all(color: AppColors.border, width: 0.8),
                              ),
                              child: Icon(Icons.phone_rounded, size: 18, color: AppColors.iconPrimary),
                            ),
                            onPressed: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Calling driver ${driver.phone}...')),
                              );
                            },
                          ),
                          IconButton(
                            icon: Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceElevated,
                                shape: BoxShape.circle,
                                border: Border.all(color: AppColors.border, width: 0.8),
                              ),
                              child: Icon(Icons.chat_bubble_outline_rounded, size: 18, color: AppColors.iconPrimary),
                            ),
                            onPressed: () => context.push('/messaging/driver', extra: driver),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),

                  // Actions
                  SafarisButton(
                    text: 'Complete Trip (Simulate Arrival)',
                    variant: SafarisButtonVariant.primary,
                    onPressed: () {
                      ref.read(rideBookingProvider.notifier).completeTrip();
                      context.go('/rides/completed');
                    },
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
