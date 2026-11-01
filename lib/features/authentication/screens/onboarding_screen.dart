import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/safaris_button.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  final List<_OnboardingItem> _items = const [
    _OnboardingItem(
      title: 'Seamless Rides & Airport Transfers',
      description:
          'From fast boda trips through Kampala traffic to executive Entebbe Airport pickups in comfort sedans.',
      icon: Icons.directions_car_rounded,
      highlightText: 'KAMPALA • ENTEBBE',
    ),
    _OnboardingItem(
      title: 'Experience the Pearl of Africa',
      description:
          'Book vetted tour packages to Bwindi Gorilla trekking, Murchison Falls, and Jinja Nile rapids with certified Ugandan guides.',
      icon: Icons.terrain_rounded,
      highlightText: 'TOURS & SAFARIS',
    ),
    _OnboardingItem(
      title: 'Express Parcel Delivery & Logistics',
      description:
          'Fast, tracked package deliveries across Greater Kampala and inter-district hubs with live verification.',
      icon: Icons.local_shipping_rounded,
      highlightText: 'TRACKED & SECURE',
    ),
  ];

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          child: Column(
            children: [
              // Top Bar Skip Action
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.explore_rounded, color: AppColors.accent, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        AppConstants.appName,
                        style: AppTypography.titleSmall.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: 2,
                        ),
                      ),
                    ],
                  ),
                  TextButton(
                    onPressed: () => context.go('/auth/login'),
                    child: Text(
                      'Skip',
                      style: AppTypography.labelMedium.copyWith(color: AppColors.textSecondary),
                    ),
                  ),
                ],
              ),

              // Page View Slides
              Expanded(
                child: PageView.builder(
                  controller: _pageController,
                  onPageChanged: (index) {
                    setState(() {
                      _currentPage = index;
                    });
                  },
                  itemCount: _items.length,
                  itemBuilder: (context, index) {
                    final item = _items[index];
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          // Graphic Container
                          Container(
                            width: 140,
                            height: 140,
                            decoration: BoxDecoration(
                              color: AppColors.surfaceElevated,
                              shape: BoxShape.circle,
                              border: Border.all(color: AppColors.borderLight, width: 1.5),
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.accent.withOpacity(0.12),
                                  blurRadius: 30,
                                  spreadRadius: 8,
                                ),
                              ],
                            ),
                            child: Icon(
                              item.icon,
                              size: 64,
                              color: AppColors.accent,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xxxl),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.accentMuted,
                              borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                            ),
                            child: Text(
                              item.highlightText,
                              style: AppTypography.labelSmall.copyWith(
                                color: AppColors.accent,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Text(
                            item.title,
                            textAlign: TextAlign.center,
                            style: AppTypography.displayMedium.copyWith(
                              fontSize: 24,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Text(
                            item.description,
                            textAlign: TextAlign.center,
                            style: AppTypography.bodyMedium.copyWith(
                              color: AppColors.textSecondary,
                              height: 1.6,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),

              // Indicators & Action Buttons
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(_items.length, (index) {
                  final isActive = _currentPage == index;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: isActive ? 24 : 8,
                    height: 6,
                    decoration: BoxDecoration(
                      color: isActive ? AppColors.accent : AppColors.surfaceHigher,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  );
                }),
              ),
              const SizedBox(height: AppSpacing.xl),

              // Bottom Buttons
              SafarisButton(
                text: _currentPage == _items.length - 1 ? 'Get Started' : 'Continue',
                onPressed: () {
                  if (_currentPage < _items.length - 1) {
                    _pageController.nextPage(
                      duration: const Duration(milliseconds: 300),
                      curve: Curves.easeInOut,
                    );
                  } else {
                    context.go('/auth/register');
                  }
                },
              ),
              const SizedBox(height: AppSpacing.sm),
              SafarisButton(
                text: 'Sign In to Existing Account',
                variant: SafarisButtonVariant.ghost,
                onPressed: () => context.go('/auth/login'),
              ),
              const SizedBox(height: AppSpacing.md),
            ],
          ),
        ),
      ),
    );
  }
}

class _OnboardingItem {
  final String title;
  final String description;
  final IconData icon;
  final String highlightText;

  const _OnboardingItem({
    required this.title,
    required this.description,
    required this.icon,
    required this.highlightText,
  });
}
