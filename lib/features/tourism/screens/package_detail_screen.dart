import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../models/tourism_model.dart';
import '../widgets/rich_content_blocks_widget.dart';

class PackageDetailScreen extends StatelessWidget {
  final TourPackageModel package;

  const PackageDetailScreen({super.key, required this.package});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: SafarisAppBar(
        title: package.title,
        subtitle: '${package.durationDays} Days • ${package.groupType}',
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          // Header Card
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
              border: Border.all(color: AppColors.border, width: 1),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (package.effectiveImageUrl.isNotEmpty)
                  SizedBox(
                    height: 160,
                    width: double.infinity,
                    child: Image.network(
                      package.effectiveImageUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Flexible(
                            child: SafarisBadge(
                              text: '${package.durationDays} DAYS / ${package.durationDays - 1} NIGHTS',
                              variant: SafarisBadgeVariant.accent,
                            ),
                          ),
                          const SizedBox(width: 8),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              CurrencyFormatter.formatUGX(package.pricePerPersonUGX),
                              style: AppTypography.titleMedium.copyWith(
                                color: AppColors.accent,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        package.title,
                        style: AppTypography.titleLarge.copyWith(fontSize: 20, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Per person sharing • All mandatory Uganda park fees included',
                        style: AppTypography.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          if (package.description.isNotEmpty) ...[
            Text(
              'Package Overview',
              style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              package.description,
              style: AppTypography.bodyMedium.copyWith(color: AppColors.textPrimary, height: 1.5),
            ),
            const SizedBox(height: AppSpacing.md),
          ],

          if (package.contentBlocks.isNotEmpty) ...[
            RichContentBlocksWidget(blocks: package.contentBlocks),
            const SizedBox(height: AppSpacing.md),
          ],

          if (package.touristPricingTiers.isNotEmpty) ...[
            Text(
              'Group & Tourist Pricing Tiers',
              style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: AppSpacing.xs),
            ...package.touristPricingTiers.map((tier) {
              return Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${tier.minTourists}–${tier.maxTourists} Travelers ${tier.notes.isNotEmpty ? '(${tier.notes})' : ''}',
                      style: AppTypography.bodySmall.copyWith(color: AppColors.textPrimary, fontWeight: FontWeight.w600),
                    ),
                    Text(
                      '${CurrencyFormatter.formatUGX(tier.priceUgx)} ${tier.pricingMode == 'GROUP_TOTAL' ? 'total' : '/ person'}',
                      style: AppTypography.labelSmall.copyWith(color: AppColors.accent, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: AppSpacing.lg),
          ],

          // Day-by-day Itinerary
          Text(
            'Expedition Itinerary',
            style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.sm),

          ...package.itinerarySummary.map((step) {
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: const BoxDecoration(
                      color: AppColors.accentMuted,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.explore_rounded, size: 16, color: AppColors.accent),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      step,
                      style: AppTypography.bodyMedium.copyWith(
                        color: AppColors.textPrimary,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
          const SizedBox(height: AppSpacing.lg),

          // Package Inclusions
          Text(
            'What is Included',
            style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.sm),

          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              border: Border.all(color: AppColors.border, width: 1),
            ),
            child: Column(
              children: package.inclusions.map((inc) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle_rounded, size: 18, color: AppColors.success),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          inc,
                          style: AppTypography.bodyMedium.copyWith(color: AppColors.textPrimary),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
          if (package.exclusions.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Text(
              'What is Excluded',
              style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: AppSpacing.sm),
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.surfaceElevated,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              child: Column(
                children: package.exclusions.map((exc) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        const Icon(Icons.remove_circle_outline_rounded, size: 18, color: AppColors.error),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            exc,
                            style: AppTypography.bodyMedium.copyWith(color: AppColors.textPrimary),
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.xxl),

          // Book Button
          SafarisButton(
            text: 'Customize & Book Expedition',
            onPressed: () => context.push('/tourism/book', extra: package),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    );
  }
}
