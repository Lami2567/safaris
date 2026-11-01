import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../models/user_activity_model.dart';
import '../user_activity_provider.dart';

class TripHistoryScreen extends ConsumerWidget {
  const TripHistoryScreen({super.key});

  SafarisBadgeVariant _getBadgeVariant(String status) {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
      case 'DELIVERED':
        return SafarisBadgeVariant.success;
      case 'IN PROGRESS':
      case 'DISPATCHED':
        return SafarisBadgeVariant.accent;
      case 'CONFIRMED':
        return SafarisBadgeVariant.accent;
      case 'CANCELLED':
        return SafarisBadgeVariant.error;
      default:
        return SafarisBadgeVariant.neutral;
    }
  }

  IconData _getCategoryIcon(ActivityCategory category) {
    switch (category) {
      case ActivityCategory.ride:
        return Icons.directions_car_rounded;
      case ActivityCategory.tourism:
        return Icons.terrain_rounded;
      case ActivityCategory.delivery:
        return Icons.local_shipping_rounded;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activities = ref.watch(userActivityProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const SafarisAppBar(
        title: 'Your Activity & Trips',
        subtitle: 'Real rides, safaris & deliveries in Uganda',
      ),
      body: activities.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(22),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.border, width: 1),
                      ),
                      child: Icon(
                        Icons.receipt_long_outlined,
                        size: 46,
                        color: AppColors.textTertiary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      'No Activity Yet',
                      style: AppTypography.titleMedium.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      'You haven\'t booked any rides, tours, or deliveries yet. When you request a service, your activity history will appear here.',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                        height: 1.5,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 12,
                      runSpacing: 10,
                      children: [
                        ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.accent,
                            foregroundColor: Colors.black,
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.radiusMd)),
                          ),
                          icon: const Icon(Icons.directions_car_rounded, size: 18),
                          label: const Text('Find a Ride', style: TextStyle(fontWeight: FontWeight.w700)),
                          onPressed: () => context.push('/rides/search'),
                        ),
                        OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.textPrimary,
                            side: BorderSide(color: AppColors.borderLight),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.radiusMd)),
                          ),
                          icon: const Icon(Icons.explore_rounded, size: 18, color: AppColors.accent),
                          label: const Text('Explore Safaris', style: TextStyle(fontWeight: FontWeight.w600)),
                          onPressed: () => context.push('/tourism'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(AppSpacing.md),
              itemCount: activities.length,
              separatorBuilder: (context, index) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final item = activities[index];
                return Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                    border: Border.all(color: AppColors.border, width: 1),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(6),
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceHigher,
                                  borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                                ),
                                child: Icon(
                                  _getCategoryIcon(item.category),
                                  size: 16,
                                  color: AppColors.accent,
                                ),
                              ),
                              const SizedBox(width: 8),
                              if (item.status.toUpperCase() == 'COMPLETED')
                                Text(
                                  'COMPLETED',
                                  style: AppTypography.labelSmall.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0.5,
                                  ),
                                )
                              else
                                SafarisBadge(
                                  text: item.status,
                                  variant: _getBadgeVariant(item.status),
                                ),
                            ],
                          ),
                          Text(
                            CurrencyFormatter.formatUGX(item.fareUGX),
                            style: AppTypography.titleSmall.copyWith(
                              color: AppColors.accent,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        item.title,
                        style: AppTypography.titleSmall.copyWith(fontSize: 15, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        item.route,
                        style: AppTypography.bodySmall.copyWith(color: AppColors.textPrimary),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              'Provider: ${item.providerName}',
                              style: AppTypography.bodySmall.copyWith(fontSize: 11),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            item.date,
                            style: AppTypography.bodySmall.copyWith(fontSize: 11, color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}
