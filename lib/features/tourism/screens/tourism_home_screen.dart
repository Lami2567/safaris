import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../models/tourism_model.dart';
import '../services/tourism_api_service.dart';

class TourismHomeScreen extends ConsumerWidget {
  const TourismHomeScreen({super.key});

  // ─── Destination card – 220×240, 70 % image / 30 % text ──────────────────
  Widget _buildDestinationCard(BuildContext context, dest) {
    return GestureDetector(
      onTap: () => context.push('/tourism/destination-detail', extra: dest),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        child: Container(
          width: 220,
          height: 240,
          decoration: BoxDecoration(
            color: AppColors.surfaceElevated,
            border: Border.all(color: AppColors.border, width: 1),
            borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
          ),
          child: Column(
            children: [
              // 62 % – image area
              Expanded(
                flex: 62,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _destinationImageWidget(dest.effectiveImageUrl),
                    // Hero tag badge – top-left
                    Positioned(
                      top: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.75),
                          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                          border: Border.all(color: AppColors.accent.withValues(alpha: 0.6), width: 0.8),
                        ),
                        child: Text(
                          dest.heroTag,
                          style: AppTypography.labelSmall.copyWith(
                            color: AppColors.accentLight,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.7,
                            fontSize: 9,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              // 38 % – text area
              Expanded(
                flex: 38,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        dest.title,
                        style: AppTypography.titleSmall.copyWith(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          color: AppColors.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        dest.region,
                        style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary, fontSize: 11),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          const Icon(Icons.schedule_rounded, size: 12, color: AppColors.accent),
                          const SizedBox(width: 3),
                          Expanded(
                            child: Text(
                              '${dest.distanceHoursFromKampala}h drive from Kampala',
                              style: AppTypography.bodySmall.copyWith(fontSize: 10),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _destinationImageWidget(String imageUrl) {
    if (imageUrl.isNotEmpty) {
      return Image.network(
        imageUrl,
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
        errorBuilder: (context, error, stack) => _destinationFallback(),
      );
    }
    return _destinationFallback();
  }

  Widget _destinationFallback() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF2D4A1E), Color(0xFF1A2E0F)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Center(
        child: Icon(Icons.landscape_rounded, size: 48, color: AppColors.accent),
      ),
    );
  }

  // ─── Package card – full width, 50/50 horizontal split ───────────────────
  Widget _buildPackageCard(BuildContext context, pkg) {
    // Colour-cycle fallback panels to visually differentiate cards
    final List<List<Color>> gradients = [
      [const Color(0xFF2A3D1A), const Color(0xFF1A2710)],
      [const Color(0xFF1A2A3D), const Color(0xFF101A27)],
      [const Color(0xFF3D2A1A), const Color(0xFF271A10)],
    ];
    final gradientIndex = pkg.id.hashCode.abs() % gradients.length;
    final fallbackGradient = gradients[gradientIndex];

    return Container(
      height: 132,
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(color: AppColors.border, width: 1),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => context.push('/tourism/package-detail', extra: pkg),
            borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Left 42 % – image
                Expanded(
                  flex: 42,
                  child: _packageImageWidget(pkg.effectiveImageUrl, fallbackGradient),
                ),
                // Right 58 % – text
                Expanded(
                  flex: 58,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        // Duration badge
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
                          decoration: BoxDecoration(
                            color: AppColors.accentMuted,
                            borderRadius: BorderRadius.circular(AppSpacing.radiusXs),
                          ),
                          child: Text(
                            '${pkg.durationDays} DAYS',
                            style: AppTypography.labelSmall.copyWith(
                              color: AppColors.accent,
                              fontWeight: FontWeight.w700,
                              fontSize: 9,
                            ),
                          ),
                        ),
                        Text(
                          pkg.title,
                          style: AppTypography.titleSmall.copyWith(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textPrimary,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          pkg.inclusions.take(2).join(' • '),
                          style: AppTypography.bodySmall.copyWith(fontSize: 9.5, color: AppColors.textSecondary),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          CurrencyFormatter.formatUGX(pkg.pricePerPersonUGX),
                          style: AppTypography.titleSmall.copyWith(
                            color: AppColors.accent,
                            fontWeight: FontWeight.w800,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _packageImageWidget(String imageUrl, List<Color> fallbackGradient) {
    if (imageUrl.isNotEmpty) {
      return Image.network(
        imageUrl,
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
        errorBuilder: (context, error, stack) => _packageFallback(fallbackGradient),
      );
    }
    return _packageFallback(fallbackGradient);
  }

  Widget _packageFallback(List<Color> colors) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: colors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Center(
        child: Icon(Icons.photo_camera_back_rounded, size: 36, color: AppColors.accent),
      ),
    );
  }

  // ─── Guide card – 160×200, 60 % avatar / 40 % specs ─────────────────────
  Widget _buildGuideCard(BuildContext context, guide) {
    return GestureDetector(
      onTap: () => context.push('/tourism/guides'),
      child: Container(
        width: 160,
        height: 215,
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
          border: Border.all(color: AppColors.border, width: 1),
        ),
        child: Column(
          children: [
            // 54 % – avatar
            Expanded(
              flex: 54,
              child: Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Avatar circle
                    CircleAvatar(
                      radius: 32,
                      backgroundColor: AppColors.surfaceHigher,
                      child: ClipOval(
                        child: _guideAvatarWidget(guide.avatarUrl, guide.fullName),
                      ),
                    ),
                    const SizedBox(height: 5),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: Text(
                        guide.fullName,
                        style: AppTypography.titleSmall.copyWith(fontSize: 12, fontWeight: FontWeight.w700),
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Thin divider
            Divider(height: 1, thickness: 1, color: AppColors.divider),
            // 46 % – specs
            Expanded(
              flex: 46,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      guide.specialties.take(2).join(', '),
                      style: AppTypography.bodySmall.copyWith(fontSize: 9.5, color: AppColors.textSecondary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Row(
                      children: [
                        const Icon(Icons.star_rounded, size: 12, color: AppColors.accent),
                        const SizedBox(width: 3),
                        Text(
                          guide.rating.toStringAsFixed(2),
                          style: AppTypography.labelSmall.copyWith(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      '${CurrencyFormatter.formatUGX(guide.dailyRateUGX)}/day',
                      style: AppTypography.labelSmall.copyWith(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: AppColors.accent,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _guideAvatarWidget(String avatarUrl, String name) {
    if (avatarUrl.isNotEmpty) {
      return Image.network(
        avatarUrl,
        width: 76,
        height: 76,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stack) => _guideAvatarFallback(name),
      );
    }
    return _guideAvatarFallback(name);
  }

  Widget _guideAvatarFallback(String name) {
    final initials = name.trim().split(' ').take(2).map((w) => w.isEmpty ? '' : w[0]).join();
    return Container(
      width: 76,
      height: 76,
      color: AppColors.surfaceHigher,
      child: Center(
        child: Text(
          initials.toUpperCase(),
          style: AppTypography.titleSmall.copyWith(
            color: AppColors.accent,
            fontSize: 22,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }

  // ─── Build ────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final destinationsAsync = ref.watch(destinationsListProvider);
    final packagesAsync = ref.watch(packagesListProvider);
    final guidesAsync = ref.watch(guidesListProvider);

    final destinations = destinationsAsync.value ?? DestinationModel.sampleDestinations;
    final packages = packagesAsync.value ?? TourPackageModel.samplePackages;
    final guides = guidesAsync.value ?? TourGuideModel.sampleGuides;

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const SafarisAppBar(
        title: 'Uganda Safaris & Tours',
        subtitle: 'Discover the Pearl of Africa',
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        children: [
          // ── Hero Banner ──────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurfaceElevated : const Color(0xFF1E2128),
              borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
              border: Border.all(color: AppColors.border, width: 1),
              gradient: const LinearGradient(
                colors: [Color(0xFF231E12), Color(0xFF16171B)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SafarisBadge(
                  text: 'PEARL OF AFRICA EXPEDITIONS',
                  variant: SafarisBadgeVariant.accent,
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Explore National Parks\n& Gorilla Sanctuaries',
                  style: AppTypography.displayMedium.copyWith(
                    fontSize: 22,
                    height: 1.25,
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'Book complete packages or hire certified Uganda Wildlife Authority guides.',
                  style: AppTypography.bodyMedium.copyWith(
                    color: Colors.white.withValues(alpha: 0.85),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: [
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.accent,
                        foregroundColor: const Color(0xFF0F172A),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.radiusSm)),
                      ),
                      icon: const Icon(Icons.hiking_rounded, size: 18),
                      label: Text(
                        'Find Tour Guides',
                        style: AppTypography.labelMedium.copyWith(
                          color: const Color(0xFF0F172A),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      onPressed: () => context.push('/tourism/guides'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xl),

          // ── Iconic Uganda Destinations ────────────────────────────────────
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Iconic Destinations',
                    style: AppTypography.titleSmall.copyWith(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  Text('${destinations.length} Parks', style: AppTypography.bodySmall),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              SizedBox(
                height: 250,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: destinations.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (context, index) =>
                      _buildDestinationCard(context, destinations[index]),
                ),
              ),
            ],
          ),

          const SizedBox(height: AppSpacing.xl),

          // ── Curated Tour Packages ─────────────────────────────────────────
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Curated Tour Packages',
                    style: AppTypography.titleSmall.copyWith(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  Icon(Icons.filter_list_rounded, size: 20, color: AppColors.iconSecondary),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              ...packages.map((pkg) => _buildPackageCard(context, pkg)),
            ],
          ),

          const SizedBox(height: AppSpacing.xl),

          // ── Expert Tour Guides ────────────────────────────────────────────
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Expert Tour Guides',
                    style: AppTypography.titleSmall.copyWith(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  GestureDetector(
                    onTap: () => context.push('/tourism/guides'),
                    child: Text(
                      'View All',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.accent,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              SizedBox(
                height: 215,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: guides.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (context, index) =>
                      _buildGuideCard(context, guides[index]),
                ),
              ),
            ],
          ),

          const SizedBox(height: AppSpacing.xxl),
        ],
      ),
    );
  }
}
