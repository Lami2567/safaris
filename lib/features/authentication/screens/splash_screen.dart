import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/services/device_location_service.dart';
import '../../../core/services/user_location_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/user_model.dart';
import '../session_provider.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _opacityAnimation;
  bool _showLocationGate = false;
  bool _isCheckingLocation = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );

    _scaleAnimation = Tween<double>(begin: 0.85, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
    );

    _opacityAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.2, 1.0, curve: Curves.easeIn)),
    );

    _controller.forward().then((_) async {
      await Future.delayed(const Duration(milliseconds: 300));
      if (mounted) {
        _attemptLocationAcquisitionAndProceed();
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _showLocationGate) {
      // Re-check permission automatically when user returns from settings
      _attemptLocationAcquisitionAndProceed();
    }
  }

  Future<void> _attemptLocationAcquisitionAndProceed() async {
    if (_isCheckingLocation) return;
    setState(() => _isCheckingLocation = true);

    try {
      final notifier = ref.read(userLocationProvider.notifier);
      final acquired = await notifier.requestLocationAggressively();

      if (!mounted) return;

      if (acquired) {
        // Location granted and GPS fix acquired - proceed directly into the app
        setState(() {
          _showLocationGate = false;
          _isCheckingLocation = false;
        });
        await _navigateNext();
      } else {
        // Location permission denied or service disabled - enforce gate
        setState(() {
          _showLocationGate = true;
          _isCheckingLocation = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _showLocationGate = true;
          _isCheckingLocation = false;
        });
      }
    }
  }

  Future<void> _navigateNext() async {
    if (!mounted) return;

    final sessionNotifier = ref.read(currentUserProvider.notifier);
    final hasSavedSession = await sessionNotifier.loadSavedSession();

    if (!mounted) return;

    if (hasSavedSession) {
      final user = ref.read(currentUserProvider);
      switch (user.role) {
        case UserRole.customer:
          context.go('/customer');
          break;
        case UserRole.driver:
          context.go('/driver');
          break;
        case UserRole.tourGuide:
          context.go('/tour-guide');
          break;
        case UserRole.admin:
          context.go('/admin');
          break;
      }
    } else {
      final pendingEmail = await sessionNotifier.getPendingVerificationEmail();
      if (!mounted) return;
      if (pendingEmail != null && pendingEmail.isNotEmpty) {
        context.go('/auth/otp', extra: pendingEmail);
      } else {
        context.go('/auth/onboarding');
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locationState = ref.watch(userLocationProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: Stack(
        children: [
          // Background Splash Branding
          Center(
            child: AnimatedBuilder(
              animation: _controller,
              builder: (context, child) {
                return Opacity(
                  opacity: _opacityAnimation.value,
                  child: Transform.scale(
                    scale: _scaleAnimation.value,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 80,
                          height: 80,
                          decoration: BoxDecoration(
                            color: AppColors.surfaceElevated,
                            borderRadius: BorderRadius.circular(AppSpacing.radiusXl),
                            border: Border.all(color: AppColors.accent, width: 1.5),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.accent.withOpacity(0.25),
                                blurRadius: 24,
                                spreadRadius: 2,
                              ),
                            ],
                          ),
                          child: const Center(
                            child: Icon(
                              Icons.explore_rounded,
                              size: 42,
                              color: AppColors.accent,
                            ),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        Text(
                          AppConstants.appName,
                          style: AppTypography.displayLarge.copyWith(
                            letterSpacing: 4.0,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          AppConstants.appTagline.toUpperCase(),
                          style: AppTypography.labelSmall.copyWith(
                            color: AppColors.textSecondary,
                            letterSpacing: 1.8,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xxxl),
                        if (!_showLocationGate)
                          const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.2,
                              valueColor: AlwaysStoppedAnimation<Color>(AppColors.accent),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          // Mandatory Location Gate Modal Card
          if (_showLocationGate)
            Container(
              color: Colors.black.withOpacity(0.82),
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              alignment: Alignment.center,
              child: SafeArea(
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 400),
                  padding: const EdgeInsets.all(AppSpacing.xl),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusXl),
                    border: Border.all(color: AppColors.accent.withOpacity(0.6), width: 1.5),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.8),
                        blurRadius: 32,
                        spreadRadius: 4,
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Pulsing Location Pin Icon
                      Container(
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          color: const Color(0xFF00D2FF).withOpacity(0.12),
                          shape: BoxShape.circle,
                          border: Border.all(color: const Color(0xFF00D2FF), width: 2),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF00D2FF).withOpacity(0.4),
                              blurRadius: 16,
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.my_location_rounded,
                          color: Color(0xFF00D2FF),
                          size: 32,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      Text(
                        'Precise Location Required',
                        style: AppTypography.titleLarge.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.5,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        '${AppConstants.appName} requires your exact live GPS location to match you with nearby luxury drivers, calculate route arrival times, and accurately navigate across Uganda.',
                        style: AppTypography.bodySmall.copyWith(
                          color: AppColors.textSecondary,
                          height: 1.5,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: AppSpacing.md),

                      // Status message pill
                      if (locationState.errorMessage != null)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          margin: const EdgeInsets.only(bottom: AppSpacing.md),
                          decoration: BoxDecoration(
                            color: const Color(0xFF2D1515),
                            borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                            border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.4)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.info_outline_rounded, size: 16, color: Color(0xFFEF4444)),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  locationState.errorMessage!,
                                  style: AppTypography.bodySmall.copyWith(
                                    color: const Color(0xFFFCA5A5),
                                    fontSize: 11,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),

                      // Primary Action Button
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          icon: _isCheckingLocation
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                                )
                              : const Icon(Icons.near_me_rounded, size: 20),
                          label: Text(
                            locationState.permissionStatus == DeviceLocationPermissionStatus.serviceDisabled
                                ? 'Enable Device Location'
                                : (locationState.permissionStatus == DeviceLocationPermissionStatus.deniedForever
                                    ? 'Open App Settings'
                                    : 'Grant Location Access'),
                            style: AppTypography.titleSmall.copyWith(
                              color: Colors.black,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.accent,
                            foregroundColor: Colors.black,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                            ),
                            elevation: 2,
                          ),
                          onPressed: _isCheckingLocation
                              ? null
                              : () async {
                                  if (locationState.permissionStatus ==
                                      DeviceLocationPermissionStatus.serviceDisabled) {
                                    await ref.read(userLocationProvider.notifier).openLocationSettings();
                                  } else if (locationState.permissionStatus ==
                                      DeviceLocationPermissionStatus.deniedForever) {
                                    await ref.read(userLocationProvider.notifier).openAppSettings();
                                  } else {
                                    await _attemptLocationAcquisitionAndProceed();
                                  }
                                },
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),

                      // Secondary re-check button
                      TextButton(
                        onPressed: _isCheckingLocation ? null : _attemptLocationAcquisitionAndProceed,
                        child: Text(
                          'I have enabled location — Retry',
                          style: AppTypography.bodySmall.copyWith(
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
