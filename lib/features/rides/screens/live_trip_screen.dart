import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/network/api_client.dart';
import '../../../core/services/offline_location_queue.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/components/safaris_map_view.dart';
import '../../../shared/models/location_model.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../models/ride_model.dart';
import '../ride_provider.dart';

class LiveTripScreen extends ConsumerWidget {
  const LiveTripScreen({super.key});

  Future<void> _makePhoneCall(BuildContext context, String phoneNumber) async {
    final clean = phoneNumber.replaceAll(RegExp(r'[^\d+]'), '');
    if (clean.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Driver phone number not available.')),
      );
      return;
    }
    final uri = Uri.parse('tel:$clean');
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        await launchUrl(uri);
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open phone dialer: $e')),
        );
      }
    }
  }

  Future<void> _triggerSos(BuildContext context, String? tripId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        title: const Row(
          children: [
            Icon(Icons.shield_rounded, color: AppColors.error),
            SizedBox(width: 8),
            Text('Mumwe Safaris SOS'),
          ],
        ),
        content: const Text(
          'Do you need immediate emergency assistance?\n\nThis alerts Mumwe Safaris 24/7 Security Operations and records your live GPS coordinates.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('DISPATCH SOS NOW', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      if (tripId != null && tripId.isNotEmpty) {
        final res = await ApiClient().post('/trips/$tripId/sos', body: {
          'reason': 'Customer triggered live SOS alert',
        });
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                res.message ?? 'Emergency SOS dispatched to Mumwe Safaris response team.',
              ),
              backgroundColor: AppColors.error,
              duration: const Duration(seconds: 5),
            ),
          );
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Emergency alert sent: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  String _statusBannerText(RideStatus status) {
    switch (status) {
      case RideStatus.driverAssigned:
      case RideStatus.driverArriving:
        return 'DRIVER EN ROUTE TO PICKUP';
      case RideStatus.driverArrived:
        return 'DRIVER HAS ARRIVED AT PICKUP';
      case RideStatus.inProgress:
        return 'ON THE WAY TO DESTINATION';
      case RideStatus.completed:
        return 'TRIP COMPLETED';
      default:
        return 'ACTIVE TRIP TRACKING';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<RideBookingState>(rideBookingProvider, (previous, next) {
      if (next.status == RideStatus.completed && context.mounted) {
        context.go('/rides/completed');
      } else if (next.status == RideStatus.cancelled && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Trip was cancelled.'),
            backgroundColor: AppColors.error,
          ),
        );
        context.go('/customer');
      }
    });

    final ride = ref.watch(rideBookingProvider);
    final driver = ride.driver;
    final isApproachingPickup = ride.status == RideStatus.driverAssigned ||
        ride.status == RideStatus.driverArriving ||
        ride.status == RideStatus.driverArrived;

    // Before pickup: route from Driver's real GPS -> Pickup.
    // After pickup: route from Driver's real GPS (or Pickup) -> Destination.
    final LocationModel mapOrigin = (ride.driverLat != null &&
            ride.driverLng != null &&
            LocationModel.isValidCoordinate(ride.driverLat, ride.driverLng))
        ? LocationModel(
            id: 'driver_live_pos',
            title: driver?.fullName ?? 'Assigned Driver',
            address: 'Live GPS Position',
            latitude: ride.driverLat!,
            longitude: ride.driverLng!,
          )
        : ride.pickup;

    final LocationModel mapTarget =
        isApproachingPickup ? ride.pickup : ride.destination;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: SafarisAppBar(
        title: isApproachingPickup ? 'Driver Approaching' : 'Active Trip',
        subtitle: isApproachingPickup
            ? 'Pickup at ${ride.pickup.title}'
            : 'Heading to ${ride.destination.title}',
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
            onPressed: () => _triggerSos(context, ride.tripId),
          ),
        ],
      ),
      body: Column(
        children: [
          // Live Animated Map Canvas
          Expanded(
            flex: 5,
            child: SafarisMapView(
              pickupLocation: mapOrigin,
              destinationLocation: mapTarget,
              showDriver: true,
              isLiveTrip: true,
              driverLat: ride.driverLat,
              driverLng: ride.driverLng,
              driverHeading: ride.driverHeading,
              etaText: '${ride.formattedDuration} remaining',
              distanceText: '${ride.distanceKm.toStringAsFixed(1)} km',
              connectionState: OfflineLocationQueue().connectionState,
              onRouteResolved: (route) {
                ref.read(rideBookingProvider.notifier).onRouteResolved(route);
              },
            ),
          ),

          // Bottom Driver & Trip Information Card
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.vertical(
                top: Radius.circular(AppSpacing.radiusXl),
              ),
              border: Border(top: BorderSide(color: AppColors.border, width: 1)),
            ),
            padding: const EdgeInsets.all(AppSpacing.md),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Status Pill + Verified Fare
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: ride.isDriverLocationStale
                                  ? Colors.orange
                                  : AppColors.success,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _statusBannerText(ride.status),
                            style: AppTypography.labelSmall.copyWith(
                              color: ride.isDriverLocationStale
                                  ? Colors.orange
                                  : AppColors.success,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        CurrencyFormatter.formatUGX(
                          ride.totalFareUGX.toDouble(),
                        ),
                        style: AppTypography.titleSmall.copyWith(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  if (ride.isDriverLocationStale) ...[
                    const SizedBox(height: 4),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Driver GPS signal delayed — showing last verified position',
                        style: AppTypography.bodySmall.copyWith(
                          color: Colors.orange,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.sm),
                  Divider(color: AppColors.divider),
                  const SizedBox(height: AppSpacing.sm),

                  // Driver Details Row
                  if (driver != null)
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 26,
                          backgroundColor: AppColors.accent,
                          child: Text(
                            driver.fullName.isNotEmpty ? driver.fullName[0] : 'D',
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
                                    style: AppTypography.titleSmall
                                        .copyWith(fontSize: 16),
                                  ),
                                  const SizedBox(width: 6),
                                  const Icon(
                                    Icons.star_rounded,
                                    size: 14,
                                    color: AppColors.accent,
                                  ),
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
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: AppColors.surfaceElevated,
                                      borderRadius: BorderRadius.circular(4),
                                      border: Border.all(
                                        color: AppColors.borderLight,
                                        width: 0.8,
                                      ),
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
                                  if (ride.driverLat != null &&
                                      ride.driverLng != null) ...[
                                    const SizedBox(width: 8),
                                    Text(
                                      'GPS ${ride.driverLat!.toStringAsFixed(4)}, ${ride.driverLng!.toStringAsFixed(4)}',
                                      style: AppTypography.bodySmall
                                          .copyWith(fontSize: 10),
                                    ),
                                  ],
                                ],
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
                                  border: Border.all(
                                    color: AppColors.border,
                                    width: 0.8,
                                  ),
                                ),
                                child: Icon(
                                  Icons.phone_rounded,
                                  size: 18,
                                  color: AppColors.iconPrimary,
                                ),
                              ),
                              onPressed: () => _makePhoneCall(context, driver.phone),
                            ),
                            IconButton(
                              icon: Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceElevated,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: AppColors.border,
                                    width: 0.8,
                                  ),
                                ),
                                child: Icon(
                                  Icons.chat_bubble_outline_rounded,
                                  size: 18,
                                  color: AppColors.iconPrimary,
                                ),
                              ),
                              onPressed: () =>
                                  context.push('/messaging/driver', extra: driver),
                            ),
                          ],
                        ),
                      ],
                    )
                  else
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        children: [
                          const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.accent,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Synchronizing assigned driver telemetry from server...',
                              style: AppTypography.bodySmall,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: AppSpacing.md),

                  // Real Trip Actions (Sync status or Cancel if before pickup)
                  Row(
                    children: [
                      Expanded(
                        child: SafarisButton(
                          text: 'Sync Live Trip Status',
                          variant: SafarisButtonVariant.secondary,
                          onPressed: () {
                            ref
                                .read(rideBookingProvider.notifier)
                                .checkActiveTrip();
                          },
                        ),
                      ),
                      if (isApproachingPickup) ...[
                        const SizedBox(width: 8),
                        SafarisButton(
                          text: 'Cancel',
                          variant: SafarisButtonVariant.outline,
                          isFullWidth: false,
                          onPressed: () {
                            ref.read(rideBookingProvider.notifier).cancelRide();
                            context.go('/customer');
                          },
                        ),
                      ],
                    ],
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
