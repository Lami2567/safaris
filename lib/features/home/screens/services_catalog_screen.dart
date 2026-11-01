import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/config/remote_config_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/location_model.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_badge.dart';

class ServicesCatalogScreen extends ConsumerWidget {
  const ServicesCatalogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final remoteConfig = ref.watch(remoteConfigProvider);
    final services = remoteConfig.enabledServices;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const SafarisAppBar(
        title: 'All Services',
        subtitle: 'Mobility, Tourism & Logistics Uganda',
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          Text(
            'AVAILABLE PLATFORM OFFERINGS',
            style: AppTypography.labelSmall.copyWith(
              color: AppColors.textTertiary,
              letterSpacing: 1.0,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),

          if (services.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxl),
                child: Column(
                  children: [
                    Icon(Icons.miscellaneous_services_rounded, size: 48, color: AppColors.textDisabled),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      'No services currently available',
                      style: AppTypography.titleSmall.copyWith(color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
            )
          else
            ...services.map((service) {
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                child: Material(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => _handleNav(context, service.type),
                    borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                        border: Border.all(
                          color: AppColors.border,
                          width: 1,
                        ),
                      ),
                      child: service.effectiveImageUrl.isNotEmpty
                          ? Padding(
                              padding: const EdgeInsets.all(10),
                              child: IntrinsicHeight(
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                                      child: Container(
                                        width: 76,
                                        constraints: const BoxConstraints(minHeight: 76),
                                        child: Image.network(
                                          service.effectiveImageUrl,
                                          fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) => Container(
                                            color: AppColors.surfaceHigher,
                                            child: Center(
                                              child: Icon(
                                                _getIcon(service.type),
                                                color: AppColors.accent,
                                                size: 26,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Row(
                                            children: [
                                              Expanded(
                                                child: Text(
                                                  service.title,
                                                  style: AppTypography.titleSmall.copyWith(
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 14,
                                                  ),
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                              ),
                                              if (service.isNew) ...[
                                                const SizedBox(width: 6),
                                                const SafarisBadge(
                                                  text: 'NEW',
                                                  variant: SafarisBadgeVariant.accent,
                                                ),
                                              ],
                                            ],
                                          ),
                                          const SizedBox(height: 3),
                                          Text(
                                            service.subtitle,
                                            style: AppTypography.bodySmall.copyWith(
                                              color: AppColors.textSecondary,
                                              fontSize: 12,
                                            ),
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Center(
                                      child: Icon(Icons.arrow_forward_ios_rounded, size: 14, color: AppColors.iconSecondary),
                                    ),
                                  ],
                                ),
                              ),
                            )
                          : Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                              child: IntrinsicHeight(
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.center,
                                  children: [
                                    Container(
                                      width: 48,
                                      height: 48,
                                      decoration: BoxDecoration(
                                        color: AppColors.surfaceHigher,
                                        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                                      ),
                                      child: Icon(
                                        _getIcon(service.type),
                                        color: AppColors.accent,
                                        size: 24,
                                      ),
                                    ),
                                    const SizedBox(width: AppSpacing.md),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Row(
                                            children: [
                                              Expanded(
                                                child: Text(
                                                  service.title,
                                                  style: AppTypography.titleSmall.copyWith(
                                                    color: AppColors.textPrimary,
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 14,
                                                  ),
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                              ),
                                              if (service.isNew) ...[
                                                const SizedBox(width: 8),
                                                const SafarisBadge(
                                                  text: 'NEW',
                                                  variant: SafarisBadgeVariant.accent,
                                                ),
                                              ],
                                            ],
                                          ),
                                          const SizedBox(height: 3),
                                          Text(
                                            service.subtitle,
                                            style: AppTypography.bodySmall.copyWith(
                                              color: AppColors.textSecondary,
                                              fontSize: 12,
                                            ),
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Icon(
                                      Icons.arrow_forward_ios_rounded,
                                      size: 14,
                                      color: AppColors.iconSecondary,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  void _handleNav(BuildContext context, AppServiceType type) {
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
          const SnackBar(content: Text('This service is managed remotely via Admin config.')),
        );
        break;
    }
  }

  IconData _getIcon(AppServiceType type) {
    switch (type) {
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
}
