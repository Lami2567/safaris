import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../notifications/models/notification_model.dart';
import '../../notifications/notification_provider.dart';
import '../models/ride_model.dart';
import '../ride_provider.dart';

class DriverSearchingScreen extends ConsumerStatefulWidget {
  const DriverSearchingScreen({super.key});

  @override
  ConsumerState<DriverSearchingScreen> createState() => _DriverSearchingScreenState();
}

class _DriverSearchingScreenState extends ConsumerState<DriverSearchingScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Listen for real driver assignment from WebSocket/Backend
    ref.listen<RideBookingState>(rideBookingProvider, (previous, next) {
      if (next.status == RideStatus.driverAssigned && next.driver != null) {
        final driverName = next.driver!.fullName;
        final vehicleModel = next.driver!.vehicleModel;
        final plate = next.driver!.licensePlate;

        ref.read(notificationsProvider.notifier).addIncomingNotification(
          SafarisNotification(
            id: 'notif_driver_${DateTime.now().millisecondsSinceEpoch}',
            userId: 'current_user',
            title: 'Driver Accepted Your Ride!',
            message: '$driverName ($vehicleModel • $plate) has accepted your ride request and is en route.',
            type: NotificationCategory.driver,
            createdAt: DateTime.now(),
            metadata: {
              'tripStatus': 'DRIVER_ASSIGNED',
              'driverName': driverName,
              'plate': plate,
            },
          ),
        );

        if (context.mounted) {
          context.go('/rides/live-trip');
        }
      }
    });

    final ride = ref.watch(rideBookingProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(),

              // Radar Pulse Animation
              AnimatedBuilder(
                animation: _pulseController,
                builder: (context, child) {
                  return Stack(
                    alignment: Alignment.center,
                    children: [
                      // Outer Pulse ring 2
                      Container(
                        width: 140 + (60 * _pulseController.value),
                        height: 140 + (60 * _pulseController.value),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: AppColors.accent.withOpacity((1.0 - _pulseController.value) * 0.4),
                            width: 1.5,
                          ),
                        ),
                      ),
                      // Outer Pulse ring 1
                      Container(
                        width: 110 + (40 * _pulseController.value),
                        height: 110 + (40 * _pulseController.value),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: AppColors.accent.withOpacity((1.0 - _pulseController.value) * 0.7),
                            width: 2.0,
                          ),
                        ),
                      ),
                      // Center Icon
                      Container(
                        width: 90,
                        height: 90,
                        decoration: BoxDecoration(
                          color: AppColors.surfaceElevated,
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.accent, width: 2),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.accent.withOpacity(0.3),
                              blurRadius: 20,
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.directions_car_rounded,
                          size: 44,
                          color: AppColors.accent,
                        ),
                      ),
                    ],
                  );
                },
              ),
              const SizedBox(height: AppSpacing.xxxl),

              Text(
                'Connecting to Nearby Driver...',
                style: AppTypography.displayMedium.copyWith(fontSize: 22),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Searching available verified drivers near ${ride.pickup.title}. You can continue using the app while we search.',
                style: AppTypography.bodyMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.md),

              // Summary Tag
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                child: Text(
                  '${ride.selectedVehicle.title} • ${ride.distanceKm.toStringAsFixed(1)} km',
                  style: AppTypography.labelMedium.copyWith(color: AppColors.accent),
                ),
              ),

              const Spacer(),

              // Keep searching in background button
              SafarisButton(
                text: 'Search in Background',
                variant: SafarisButtonVariant.secondary,
                onPressed: () {
                  // Returns to main app; search remains active in backend/provider
                  Navigator.of(context).pop();
                },
              ),
              const SizedBox(height: AppSpacing.sm),

              // Cancel button
              SafarisButton(
                text: 'Cancel Request',
                variant: SafarisButtonVariant.outline,
                onPressed: () {
                  ref.read(rideBookingProvider.notifier).cancelRide();
                  Navigator.of(context).pop();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
