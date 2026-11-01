import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../services/tourism_api_service.dart';

class TourGuidesListScreen extends ConsumerWidget {
  const TourGuidesListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final guidesAsync = ref.watch(guidesListProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const SafarisAppBar(
        title: 'Certified Tour Guides',
        subtitle: 'Vetted Uganda Wildlife Authority Guides',
      ),
      body: guidesAsync.when(
        data: (guides) {
          return ListView.separated(
            padding: const EdgeInsets.all(AppSpacing.md),
            itemCount: guides.length,
            separatorBuilder: (context, index) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final guide = guides[index];

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
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: AppColors.accent,
                      child: Text(
                        guide.fullName[0],
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
                                guide.fullName,
                                style: AppTypography.titleSmall.copyWith(fontSize: 16, fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(width: 6),
                              const Icon(Icons.verified, size: 16, color: AppColors.success),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            guide.title,
                            style: AppTypography.bodySmall.copyWith(color: AppColors.accentLight),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Icon(Icons.star_rounded, size: 14, color: AppColors.accent),
                              const SizedBox(width: 4),
                              Text(
                                '${guide.rating} (${guide.reviewsCount} reviews)',
                                style: AppTypography.labelSmall.copyWith(color: AppColors.textPrimary),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '• ${guide.expeditionsCount} trips',
                                style: AppTypography.bodySmall.copyWith(fontSize: 11),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  guide.bio,
                  style: AppTypography.bodySmall.copyWith(height: 1.4),
                ),
                const SizedBox(height: AppSpacing.sm),

                // Language and specialty tags
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ...guide.languages.map((l) => SafarisBadge(text: l, variant: SafarisBadgeVariant.neutral)),
                    ...guide.specialties.map((s) => SafarisBadge(text: s, variant: SafarisBadgeVariant.accent)),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                Divider(color: AppColors.divider),
                const SizedBox(height: AppSpacing.sm),

                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Daily Guiding Rate', style: AppTypography.labelSmall),
                        Text(
                          CurrencyFormatter.formatUGX(guide.dailyRateUGX),
                          style: AppTypography.titleSmall.copyWith(
                            color: AppColors.accent,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                    SafarisButton(
                      text: 'Hire Guide',
                      width: 130,
                      height: 42,
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Selected guide ${guide.fullName} for next safari booking')),
                        );
                      },
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      );
    },
    loading: () => const Center(child: CircularProgressIndicator()),
    error: (err, _) => Center(
      child: Text('Error loading guides: $err', style: AppTypography.bodySmall),
    ),
  ),
);
  }
}

