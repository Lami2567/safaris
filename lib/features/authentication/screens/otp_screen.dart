import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/user_model.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../session_provider.dart';

class OtpVerificationScreen extends ConsumerStatefulWidget {
  final String email;

  const OtpVerificationScreen({
    super.key,
    required this.email,
  });

  @override
  ConsumerState<OtpVerificationScreen> createState() => _OtpVerificationScreenState();
}

class _OtpVerificationScreenState extends ConsumerState<OtpVerificationScreen>
    with WidgetsBindingObserver {
  static const int _otpLength = 6;
  final List<TextEditingController> _controllers =
      List.generate(_otpLength, (_) => TextEditingController());
  final List<FocusNode> _focusNodes =
      List.generate(_otpLength, (_) => FocusNode());

  bool _isLoading = false;
  int _resendCountdown = 60;
  Timer? _countdownTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startCountdown();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Preserves state when switching to Gmail and returning:
    // Do NOT reset controllers or clear text upon resume!
    if (state == AppLifecycleState.resumed) {
      debugPrint('📱 [OtpVerificationScreen] Resumed from background (e.g. Gmail). State preserved.');
    }
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    _resendCountdown = 60;
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_resendCountdown > 0) {
        if (mounted) {
          setState(() {
            _resendCountdown--;
          });
        }
      } else {
        timer.cancel();
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _countdownTimer?.cancel();
    for (var c in _controllers) {
      c.dispose();
    }
    for (var f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  String get _currentCode => _controllers.map((c) => c.text).join();

  void _onDigitChanged(int index, String value) {
    if (value.length > 1) {
      // Handles pasting full 6-digit code into any box
      final digits = value.replaceAll(RegExp(r'\D'), '');
      for (int i = 0; i < _otpLength && i < digits.length; i++) {
        _controllers[i].text = digits[i];
      }
      final nextIndex = digits.length < _otpLength ? digits.length : _otpLength - 1;
      _focusNodes[nextIndex].requestFocus();
      if (_currentCode.length == _otpLength) {
        _verifyOtp();
      }
      return;
    }

    if (value.isNotEmpty) {
      if (index < _otpLength - 1) {
        _focusNodes[index + 1].requestFocus();
      } else {
        _focusNodes[index].unfocus();
        if (_currentCode.length == _otpLength) {
          _verifyOtp();
        }
      }
    } else {
      if (index > 0) {
        _focusNodes[index - 1].requestFocus();
      }
    }
  }

  void _verifyOtp() async {
    final code = _currentCode;
    if (code.length < _otpLength) {
      _showError('Please enter the complete 6-digit verification code.');
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final response = await ref.read(currentUserProvider.notifier).verifyEmailOtp(
        email: widget.email,
        otpCode: code,
      );

      if (!mounted) return;

      if (response.success) {
        final user = ref.read(currentUserProvider);

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Account verified successfully! Welcome to ${AppConstants.appName}.', style: const TextStyle(color: Colors.white)),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
          ),
        );

        // Route based on authenticated role
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
        _showError(response.errorMessage ?? 'Invalid verification code. Please check your email.');
      }
    } catch (e) {
      debugPrint('❌ [OtpVerificationScreen _verifyOtp Error]: $e');
      if (mounted) {
        _showError('Unable to verify OTP. Please try again.');
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _resendCode() async {
    if (_resendCountdown > 0) return;

    setState(() {
      _isLoading = true;
    });

    try {
      final response = await ref.read(currentUserProvider.notifier).resendOtp(widget.email);

      if (!mounted) return;

      if (response.success) {
        _startCountdown();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('A fresh verification code has been dispatched to your email.', style: TextStyle(color: Colors.white)),
            backgroundColor: AppColors.accent,
            behavior: SnackBarBehavior.floating,
          ),
        );
      } else {
        _showError(response.errorMessage ?? 'Failed to resend code. Please try again.');
      }
    } catch (e) {
      debugPrint('❌ [OtpVerificationScreen _resendCode Error]: $e');
      if (mounted) {
        _showError('Failed to resend code. Please try again.');
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message, style: const TextStyle(color: Colors.white)),
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.go('/auth/login'),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: AppSpacing.md),
              Text(
                'Verify Your Email',
                style: AppTypography.displayMedium.copyWith(fontSize: 26),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'We have sent a 6-digit verification code to:',
                style: AppTypography.bodyMedium,
              ),
              const SizedBox(height: 4),
              Text(
                widget.email,
                style: AppTypography.titleMedium.copyWith(
                  color: AppColors.accent,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Switch to your Gmail or mail client, copy the code, and paste it here. Your progress will not be lost.',
                style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.xxl),

              // 6-digit OTP Box Row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: List.generate(_otpLength, (index) {
                  return SizedBox(
                    width: 48,
                    height: 58,
                    child: TextField(
                      controller: _controllers[index],
                      focusNode: _focusNodes[index],
                      keyboardType: TextInputType.number,
                      textAlign: TextAlign.center,
                      maxLength: 6, // allows pasting full code
                      style: AppTypography.displayMedium.copyWith(
                        color: AppColors.textPrimary,
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                      ],
                      decoration: InputDecoration(
                        counterText: '',
                        filled: true,
                        fillColor: AppColors.surfaceElevated,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                          borderSide: BorderSide(color: AppColors.border, width: 1),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                          borderSide: const BorderSide(color: AppColors.accent, width: 2),
                        ),
                        contentPadding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onChanged: (val) => _onDigitChanged(index, val),
                    ),
                  );
                }),
              ),
              const SizedBox(height: AppSpacing.xl),

              SafarisButton(
                text: 'Verify & Continue',
                isLoading: _isLoading,
                onPressed: _currentCode.length == _otpLength ? _verifyOtp : null,
              ),
              const SizedBox(height: AppSpacing.lg),

              Center(
                child: Column(
                  children: [
                    Text(
                      "Didn't receive the email?",
                      style: AppTypography.bodySmall,
                    ),
                    const SizedBox(height: 4),
                    TextButton(
                      onPressed: _resendCountdown == 0 ? _resendCode : null,
                      child: Text(
                        _resendCountdown > 0
                            ? 'Resend code in ${_resendCountdown}s'
                            : 'Resend Code',
                        style: AppTypography.labelMedium.copyWith(
                          color: _resendCountdown > 0 ? AppColors.textTertiary : AppColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}
