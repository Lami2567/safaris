import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/config/remote_config_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/components/safaris_map_view.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../../shared/models/location_model.dart';
import '../models/ride_model.dart';
import '../ride_provider.dart';

class VehicleSelectionScreen extends ConsumerStatefulWidget {
  final LocationModel? initialPickup;
  final LocationModel? initialDestination;

  const VehicleSelectionScreen({
    super.key,
    this.initialPickup,
    this.initialDestination,
  });

  @override
  ConsumerState<VehicleSelectionScreen> createState() => _VehicleSelectionScreenState();
}

class _VehicleSelectionScreenState extends ConsumerState<VehicleSelectionScreen> {
  @override
  void initState() {
    super.initState();
    if (widget.initialPickup != null && widget.initialDestination != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(rideBookingProvider.notifier).setLocations(
              widget.initialPickup!,
              widget.initialDestination!,
            );
      });
    }
  }

  IconData _getTierIcon(VehicleTier tier) {
    switch (tier) {
      case VehicleTier.boda:
        return Icons.two_wheeler_rounded;
      case VehicleTier.go:
        return Icons.directions_car_rounded;
      case VehicleTier.comfort:
        return Icons.car_rental_rounded;
      case VehicleTier.safari4x4:
        return Icons.airport_shuttle_rounded;
      case VehicleTier.tourVan:
        return Icons.rv_hookup_rounded;
    }
  }

  void _showPaymentMethodSelector(BuildContext context, List<AppPaymentMethodConfig> enabledMethods) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        final current = ref.read(rideBookingProvider).paymentMethod;
        return Container(
          decoration: BoxDecoration(
            color: AppColors.surfaceElevated,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusXl)),
          ),
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: AppSpacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Select Payment Method', style: AppTypography.titleMedium),
                  TextButton(
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      context.push('/payments');
                    },
                    child: Text('Manage', style: AppTypography.labelSmall.copyWith(color: AppColors.accent)),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              ...enabledMethods.map((m) {
                final isSelected = current == m.name || current == m.id;
                IconData icon = Icons.payment_rounded;
                if (m.id == 'MTN_MOMO' || m.id == 'AIRTEL_MONEY') {
                  icon = Icons.phone_android_rounded;
                } else if (m.id == 'CARD') {
                  icon = Icons.credit_card_rounded;
                } else if (m.id == 'WALLET') {
                  icon = Icons.account_balance_wallet_rounded;
                } else if (m.id == 'CASH') {
                  icon = Icons.attach_money_rounded;
                }

                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.accent.withValues(alpha: 0.15) : AppColors.surface,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    ),
                    child: Icon(icon, color: isSelected ? AppColors.accent : AppColors.iconPrimary, size: 20),
                  ),
                  title: Text(m.name, style: AppTypography.titleSmall),
                  subtitle: Text(m.description, style: AppTypography.bodySmall),
                  trailing: isSelected
                      ? Icon(Icons.check_circle_rounded, color: AppColors.accent)
                      : Icon(Icons.radio_button_unchecked, color: AppColors.iconSecondary),
                  onTap: () {
                    ref.read(rideBookingProvider.notifier).setPaymentMethod(m.name);
                    Navigator.of(ctx).pop();
                  },
                );
              }),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final rideState = ref.watch(rideBookingProvider);
    final remoteConfig = ref.watch(remoteConfigProvider);
    final vehicleOptions = VehicleOption.getOptionsWithPricing(
      remoteConfig.pricing,
      catalogueVehicles: remoteConfig.catalogueVehicles,
      serviceKey: 'ride_hailing',
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: SafarisAppBar(
        title: 'Select Ride Tier',
        subtitle: '${rideState.distanceKm.toStringAsFixed(1)} km to destination',
      ),
      body: Column(
        children: [
          // Map Canvas Section
          Expanded(
            flex: 5,
            child: SafarisMapView(
              pickupLocation: rideState.pickup,
              destinationLocation: rideState.destination,
              distanceText: '${rideState.distanceKm.toStringAsFixed(1)} km',
              etaText: rideState.formattedDuration,
            ),
          ),

          // Vehicle Selection Bottom Drawer
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusXl)),
              border: Border(top: BorderSide(color: AppColors.border, width: 1)),
            ),
            padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.lg),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Drawer drag handle
                  Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceHigher,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),

                  // Route Summary Tag
                  Row(
                    children: [
                      const Icon(Icons.route_rounded, size: 16, color: AppColors.accent),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          '${rideState.pickup.title} ➔ ${rideState.destination.title}',
                          style: AppTypography.labelSmall.copyWith(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        '${rideState.distanceKm.toStringAsFixed(1)} km',
                        style: AppTypography.bodySmall,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),

                  // List of Vehicle Options
                  SizedBox(
                    height: 220,
                    child: ListView.separated(
                      itemCount: vehicleOptions.length,
                      separatorBuilder: (context, index) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final option = vehicleOptions[index];
                        final isSelected = rideState.selectedVehicle.tier == option.tier;
                        final fare = option.calculateFare(rideState.distanceKm);

                        return Material(
                          color: isSelected
                              ? AppColors.surfaceElevated
                              : AppColors.surface,
                          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                          child: InkWell(
                            onTap: () {
                              ref.read(rideBookingProvider.notifier).selectVehicle(option);
                            },
                            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                                border: Border.all(
                                  color: isSelected ? AppColors.accent : AppColors.border,
                                  width: isSelected ? 1.5 : 1,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: isSelected
                                          ? AppColors.accent.withOpacity(0.15)
                                          : AppColors.surfaceElevated,
                                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                                    ),
                                    child: Icon(
                                      _getTierIcon(option.tier),
                                      color: isSelected ? AppColors.accent : AppColors.iconPrimary,
                                      size: 24,
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
                                              option.title,
                                              style: AppTypography.titleSmall.copyWith(
                                                fontSize: 15,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                            const SizedBox(width: 6),
                                            Icon(Icons.person, size: 12, color: AppColors.textSecondary),
                                            Text(
                                              '${option.capacity}',
                                              style: AppTypography.bodySmall.copyWith(fontSize: 11),
                                            ),
                                          ],
                                        ),
                                        Text(
                                          '~${option.formatTripDuration(rideState.distanceKm)} trip • ${option.etaMinutes} mins pickup',
                                          style: AppTypography.bodySmall.copyWith(fontSize: 11),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ],
                                    ),
                                  ),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                        CurrencyFormatter.formatUGX(fare),
                                        style: AppTypography.titleSmall.copyWith(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w700,
                                          color: isSelected ? AppColors.accent : AppColors.textPrimary,
                                        ),
                                      ),
                                      Text(
                                        'UGX Flat',
                                        style: AppTypography.labelSmall.copyWith(fontSize: 9),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),

                  // Payment Method Bar (Admin-Governed Channels)
                  InkWell(
                    onTap: () => _showPaymentMethodSelector(context, remoteConfig.enabledPaymentMethods),
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        border: Border.all(color: AppColors.border, width: 0.8),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.payment_rounded, size: 18, color: AppColors.accent),
                              const SizedBox(width: 8),
                              Text(
                                rideState.paymentMethod,
                                style: AppTypography.labelMedium.copyWith(
                                  color: AppColors.textPrimary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                          TextButton(
                            onPressed: () => _showPaymentMethodSelector(context, remoteConfig.enabledPaymentMethods),
                            style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(50, 24)),
                            child: Text(
                              'Change',
                              style: AppTypography.labelSmall.copyWith(color: AppColors.accent),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),

                  // Confirm & Request Button
                  SafarisButton(
                    text: 'Request ${rideState.selectedVehicle.title} (${rideState.formattedDuration})',
                    icon: Icon(Icons.check_circle_rounded, size: 18, color: AppColors.backgroundDark),
                    onPressed: () {
                      ref.read(rideBookingProvider.notifier).startSearching();
                      context.push('/rides/searching');
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
