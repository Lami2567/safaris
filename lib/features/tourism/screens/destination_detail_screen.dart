import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/utils/geo_utils.dart';
import '../../../shared/models/location_model.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../models/tourism_model.dart';
import '../services/tourism_api_service.dart';
import '../widgets/rich_content_blocks_widget.dart';

class DestinationDetailScreen extends ConsumerWidget {
  final DestinationModel destination;

  const DestinationDetailScreen({super.key, required this.destination});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Live packages from Admin Panel
    final packagesAsync = ref.watch(packagesListProvider);
    final allPackages = packagesAsync.value ?? TourPackageModel.samplePackages;
    final matchingPackages = allPackages
        .where((p) => p.destinationId == destination.id)
        .toList();

    final double? startingPrice = matchingPackages.isNotEmpty
        ? matchingPackages
            .map((p) => p.pricePerPersonUGX)
            .reduce((a, b) => a < b ? a : b)
        : (destination.basePriceUgx > 0 ? destination.basePriceUgx : null);

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: SafarisAppBar(
        title: destination.title,
        subtitle: destination.region,
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          // Visual Hero Card with Admin-Configured R2 Image
          Container(
            height: 220,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
              border: Border.all(color: AppColors.border, width: 1),
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (destination.effectiveImageUrl.isNotEmpty)
                  Image.network(
                    destination.effectiveImageUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _buildImagePlaceholder(),
                  )
                else
                  _buildImagePlaceholder(),
                // Gradient overlay for contrast
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Colors.black.withValues(alpha: 0.2),
                        Colors.black.withValues(alpha: 0.85),
                      ],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Flexible(
                            child: SafarisBadge(
                              text: destination.heroTag,
                              variant: SafarisBadgeVariant.accent,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.6),
                              borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                              border: Border.all(color: AppColors.accent.withValues(alpha: 0.5), width: 0.8),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.star_rounded, size: 14, color: AppColors.accent),
                                const SizedBox(width: 4),
                                Text(
                                  destination.rating.toStringAsFixed(2),
                                  style: AppTypography.labelSmall.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            destination.title,
                            style: AppTypography.displayMedium.copyWith(
                              fontSize: 22,
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            destination.subtitle,
                            style: AppTypography.bodySmall.copyWith(
                              color: AppColors.accentLight,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          // Admin Price & Rate Card
          if (startingPrice != null)
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkSurfaceElevated : const Color(0xFFF9FAF8),
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.accent.withValues(alpha: 0.4), width: 1.2),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.accentMuted,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    ),
                    child: const Icon(Icons.payments_rounded, color: AppColors.accent, size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'TOUR PACKAGE RATE',
                          style: AppTypography.labelSmall.copyWith(
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                            fontSize: 10,
                          ),
                        ),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.baseline,
                            textBaseline: TextBaseline.alphabetic,
                            children: [
                              Text(
                                'From ',
                                style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                              ),
                              Text(
                                CurrencyFormatter.formatUGX(startingPrice),
                                style: AppTypography.titleLarge.copyWith(
                                  color: AppColors.accent,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 18,
                                ),
                              ),
                              Text(
                                ' / person',
                                style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (matchingPackages.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.accent.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(AppSpacing.radiusXs),
                      ),
                      child: Text(
                        '${matchingPackages.length} ${matchingPackages.length == 1 ? 'Package' : 'Packages'}',
                        style: AppTypography.labelSmall.copyWith(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          const SizedBox(height: AppSpacing.lg),

          // Overview (Admin's Exact Description)
          Text(
            'About the Destination',
            style: AppTypography.titleSmall.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            destination.description.isNotEmpty
                ? destination.description
                : 'Spectacular wilderness and nature preserve situated in ${destination.region}.',
            style: AppTypography.bodyMedium.copyWith(
              height: 1.6,
              color: AppColors.textPrimary,
            ),
          ),
          if (destination.contentBlocks.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            RichContentBlocksWidget(blocks: destination.contentBlocks),
          ],
          if (destination.touristPricingTiers.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Tourist-Count Pricing Tiers',
              style: AppTypography.titleSmall.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            ...destination.touristPricingTiers.map((tier) {
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
                      '${tier.minTourists}–${tier.maxTourists} Guests ${tier.notes.isNotEmpty ? '(${tier.notes})' : ''}',
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
          ],
          const SizedBox(height: AppSpacing.lg),

          // Key Highlights (Configured by Administrator)
          if (destination.highlights.isNotEmpty) ...[
            Text(
              'Key Highlights',
              style: AppTypography.titleSmall.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            ...destination.highlights.map((h) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 2),
                      child: Icon(Icons.check_circle_outline_rounded, size: 16, color: AppColors.accent),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        h,
                        style: AppTypography.bodyMedium.copyWith(color: AppColors.textPrimary),
                      ),
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: AppSpacing.lg),
          ],

          // Activities (Configured by Administrator)
          if (destination.activities.isNotEmpty) ...[
            Text(
              'Activities & Experiences',
              style: AppTypography.titleSmall.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            ...destination.activities.map((act) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 2),
                      child: Icon(Icons.explore_outlined, size: 16, color: AppColors.accent),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        act,
                        style: AppTypography.bodyMedium.copyWith(color: AppColors.textPrimary),
                      ),
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: AppSpacing.lg),
          ],

          // Logistics & Distance Specs Card (Automatically calculated from Kampala coordinates)
          Builder(
            builder: (context) {
              final double calculatedKm = GeoUtils.haversineDistance(
                0.3136, // Kampala Latitude
                32.5811, // Kampala Longitude
                destination.latitude,
                destination.longitude,
              );
              final int calculatedHours = (calculatedKm / 55).round().clamp(1, 14);

              return Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.calendar_month_rounded, size: 18, color: AppColors.accent),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Best Season to Visit', style: AppTypography.labelSmall),
                              Text(
                                destination.bestTimeToVisit.isNotEmpty ? destination.bestTimeToVisit : 'Year-round',
                                style: AppTypography.bodyMedium.copyWith(
                                  color: AppColors.textPrimary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    Divider(height: 20, color: AppColors.divider),
                    Row(
                      children: [
                        const Icon(Icons.directions_car_rounded, size: 18, color: AppColors.accent),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Distance & Travel Time from Kampala', style: AppTypography.labelSmall),
                              Text(
                                '${calculatedKm.toStringAsFixed(0)} km (~$calculatedHours hours via 4x4 Cruiser)',
                                style: AppTypography.bodyMedium.copyWith(
                                  color: AppColors.textPrimary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: AppSpacing.xl),

          // Available Packages (From Admin Panel with Real Money & Inclusions)
          if (matchingPackages.isNotEmpty) ...[
            Text(
              'Tour Packages for this Destination',
              style: AppTypography.titleSmall.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            ...matchingPackages.map((pkg) {
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Flexible(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppColors.accentMuted,
                              borderRadius: BorderRadius.circular(AppSpacing.radiusXs),
                            ),
                            child: Text(
                              '${pkg.durationDays} DAYS • ${pkg.groupType.toUpperCase()}',
                              style: AppTypography.labelSmall.copyWith(
                                color: AppColors.accent,
                                fontWeight: FontWeight.w700,
                                fontSize: 9.5,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            CurrencyFormatter.formatUGX(pkg.pricePerPersonUGX),
                            style: AppTypography.titleSmall.copyWith(
                              color: AppColors.accent,
                              fontWeight: FontWeight.w800,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      pkg.title,
                      style: AppTypography.titleSmall.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      pkg.inclusions.take(3).join(' • '),
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                        fontSize: 11,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: SafarisButton(
                            text: 'View Package Details',
                            variant: SafarisButtonVariant.primary,
                            onPressed: () => context.push('/tourism/package-detail', extra: pkg),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: AppSpacing.sm),
          ],

          // Quick Safari Ride booking option to this Destination
          SafarisButton(
            text: 'Book Safari Ride to ${destination.title.split(' ').first}',
            variant: matchingPackages.isEmpty ? SafarisButtonVariant.primary : SafarisButtonVariant.secondary,
            onPressed: () {
              context.push(
                '/rides/vehicle-select',
                extra: {
                  'pickup': LocationModel.kampalaCentral,
                  'destination': destination.toLocationModel(),
                },
              );
            },
          ),
          const SizedBox(height: AppSpacing.xxl),
        ],
      ),
    );
  }

  Widget _buildImagePlaceholder() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF282215), Color(0xFF141518)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: const Center(
        child: Icon(Icons.landscape_rounded, color: AppColors.accent, size: 48),
      ),
    );
  }
}
