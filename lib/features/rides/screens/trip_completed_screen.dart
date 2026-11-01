import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../models/ride_model.dart';
import '../ride_provider.dart';
import '../../trips/models/user_activity_model.dart';
import '../../trips/user_activity_provider.dart';

class TripCompletedScreen extends ConsumerStatefulWidget {
  const TripCompletedScreen({super.key});

  @override
  ConsumerState<TripCompletedScreen> createState() => _TripCompletedScreenState();
}

class _TripCompletedScreenState extends ConsumerState<TripCompletedScreen> {
  int _selectedRating = 5;
  int _selectedTip = 5000;
  final List<String> _selectedCompliments = [];

  final List<String> _complimentOptions = [
    'Clean Vehicle',
    'Safe Driving',
    'Knew the Routes',
    'Great Conversation',
    'AC working well',
  ];

  @override
  Widget build(BuildContext context) {
    final ride = ref.watch(rideBookingProvider);
    final driver = ride.driver ?? DriverModel.sampleDriver;
    final totalFare = ride.estimatedFareUGX;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: AppSpacing.md),
              // Success Icon
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.success.withOpacity(0.15),
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.success, width: 1.5),
                ),
                child: const Icon(
                  Icons.check_rounded,
                  size: 40,
                  color: AppColors.success,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                'Trip Completed!',
                style: AppTypography.displayMedium.copyWith(fontSize: 24),
              ),
              const SizedBox(height: 4),
              Text(
                'Hope you enjoyed your journey to ${ride.destination.title}',
                style: AppTypography.bodyMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.xl),

              // Receipt Card
              Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Base Fare', style: AppTypography.bodyMedium),
                        Text(
                          CurrencyFormatter.formatUGX(ride.selectedVehicle.baseFareUGX),
                          style: AppTypography.labelMedium.copyWith(color: AppColors.textPrimary),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Distance (${ride.distanceKm.toStringAsFixed(1)} km)',
                          style: AppTypography.bodyMedium,
                        ),
                        Text(
                          CurrencyFormatter.formatUGX(totalFare - ride.selectedVehicle.baseFareUGX),
                          style: AppTypography.labelMedium.copyWith(color: AppColors.textPrimary),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Divider(color: AppColors.divider),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Total Paid',
                          style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          CurrencyFormatter.formatUGX(totalFare),
                          style: AppTypography.titleLarge.copyWith(
                            color: AppColors.accent,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        const Icon(Icons.check_circle, size: 12, color: AppColors.success),
                        const SizedBox(width: 4),
                        Text(
                          'Paid via ${ride.paymentMethod}',
                          style: AppTypography.labelSmall.copyWith(color: AppColors.textSecondary),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),

              // Rate Driver
              Text(
                'Rate ${driver.fullName}',
                style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '${driver.vehicleModel} • ${driver.licensePlate}',
                style: AppTypography.bodySmall,
              ),
              const SizedBox(height: AppSpacing.md),

              // 5 Star Row
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (index) {
                  final starVal = index + 1;
                  return IconButton(
                    icon: Icon(
                      starVal <= _selectedRating ? Icons.star_rounded : Icons.star_outline_rounded,
                      size: 36,
                      color: starVal <= _selectedRating ? AppColors.accent : AppColors.iconSecondary,
                    ),
                    onPressed: () => setState(() => _selectedRating = starVal),
                  );
                }),
              ),
              const SizedBox(height: AppSpacing.md),

              // Compliments
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: _complimentOptions.map((c) {
                  final isSelected = _selectedCompliments.contains(c);
                  return FilterChip(
                    label: Text(c),
                    selected: isSelected,
                    onSelected: (selected) {
                      setState(() {
                        if (selected) {
                          _selectedCompliments.add(c);
                        } else {
                          _selectedCompliments.remove(c);
                        }
                      });
                    },
                    backgroundColor: AppColors.surfaceElevated,
                    selectedColor: AppColors.accent.withOpacity(0.2),
                    checkmarkColor: AppColors.accent,
                    labelStyle: AppTypography.bodySmall.copyWith(
                      color: isSelected ? AppColors.accent : AppColors.textSecondary,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                      side: BorderSide(
                        color: isSelected ? AppColors.accent : AppColors.border,
                        width: 1,
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: AppSpacing.lg),

              // Tip Selector
              Text(
                'Add Driver Tip (Optional)',
                style: AppTypography.titleSmall.copyWith(fontSize: 15),
              ),
              const SizedBox(height: AppSpacing.xs),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [0, 2000, 5000, 10000].map((tip) {
                  final isSelected = _selectedTip == tip;
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChoiceChip(
                      label: Text(tip == 0 ? 'No tip' : CurrencyFormatter.formatShort(tip)),
                      selected: isSelected,
                      onSelected: (selected) {
                        if (selected) setState(() => _selectedTip = tip);
                      },
                      backgroundColor: AppColors.surfaceElevated,
                      selectedColor: AppColors.accent,
                      labelStyle: AppTypography.labelSmall.copyWith(
                        color: isSelected ? AppColors.backgroundDark : AppColors.textPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        side: BorderSide(color: isSelected ? AppColors.accent : AppColors.border),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: AppSpacing.xxl),

              // Done Button
              SafarisButton(
                text: 'Submit & Return Home',
                onPressed: () {
                  final now = DateTime.now();
                  final timeStr = 'Today at ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
                  ref.read(userActivityProvider.notifier).addActivity(
                    UserActivityItem(
                      id: 'trip_${now.millisecondsSinceEpoch}',
                      category: ActivityCategory.ride,
                      title: '${ride.selectedVehicle.title} • ${ride.selectedVehicle.subtitle}',
                      route: '${ride.pickup.title} ➔ ${ride.destination.title}',
                      date: timeStr,
                      fareUGX: totalFare,
                      status: 'COMPLETED',
                      providerName: driver.fullName,
                      timestamp: now,
                    ),
                  );
                  ref.read(rideBookingProvider.notifier).reset();
                  context.go('/customer');
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
