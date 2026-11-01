import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../../shared/widgets/safaris_text_field.dart';
import '../session_provider.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _agreedToTerms = true;
  bool _googleDataConsent = true;
  bool _isLoading = false;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _handleRegister() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    final email = _emailController.text.trim().toLowerCase();
    final password = _passwordController.text;

    if (name.isEmpty) {
      _showError('Please enter your full legal name.');
      return;
    }
    if (phone.isEmpty) {
      _showError('Please enter your mobile phone number.');
      return;
    }
    if (email.isEmpty || !RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(email)) {
      _showError('Please enter a valid email address for verification.');
      return;
    }
    if (password.length < 6) {
      _showError('Password must be at least 6 characters.');
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final formattedPhone = phone.startsWith('+256') ? phone : '+256 $phone';

      final response = await ref.read(currentUserProvider.notifier).register(
        fullName: name,
        phone: formattedPhone,
        email: email,
        password: password,
        googleDataConsent: _googleDataConsent,
      );

      if (!mounted) return;

      if (response.success) {
        // Transition to OTP verification screen with the registered email
        context.push('/auth/otp', extra: email);
      } else {
        _showError(response.errorMessage ?? 'Registration failed. Please check your details.');
      }
    } catch (e) {
      debugPrint('❌ [RegisterScreen _handleRegister Error]: $e');
      if (mounted) {
        _showError('Unable to register. Please check your network connection and try again.');
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
              Text(
                'Create Account',
                style: AppTypography.displayMedium.copyWith(fontSize: 26),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Join Uganda\'s premier mobility & safari tourism network.',
                style: AppTypography.bodyMedium,
              ),
              const SizedBox(height: AppSpacing.xl),

              SafarisTextField(
                controller: _nameController,
                labelText: 'Full Legal Name',
                hintText: 'Enter your full name',
                prefixIcon: const Icon(Icons.person_outline_rounded, size: 20),
              ),
              const SizedBox(height: AppSpacing.md),

              SafarisTextField(
                controller: _phoneController,
                labelText: 'Phone Number (Mobile Money enabled)',
                hintText: '7XX XXXXXX',
                keyboardType: TextInputType.phone,
                prefixIcon: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceHigher,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '🇺🇬 +256',
                        style: AppTypography.labelMedium.copyWith(
                          color: AppColors.textPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(width: 1, height: 20, color: AppColors.border),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),

              SafarisTextField(
                controller: _emailController,
                labelText: 'Email Address (for OTP Verification)',
                hintText: 'your.name@example.com',
                keyboardType: TextInputType.emailAddress,
                prefixIcon: const Icon(Icons.email_outlined, size: 20),
              ),
              const SizedBox(height: AppSpacing.md),

              SafarisTextField(
                controller: _passwordController,
                labelText: 'Password',
                hintText: 'At least 6 characters',
                obscureText: true,
                prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
              ),
              const SizedBox(height: AppSpacing.md),

              // Careers Note for Drivers & Tour Guides
              Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 0.8),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline_rounded, size: 18, color: AppColors.accent),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Driver or Tour Guide?',
                            style: AppTypography.labelMedium.copyWith(
                              color: AppColors.accent,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Driver and UWA Guide accounts must register via careers.mumwesafarisuganda.com. Once approved, log in below.',
                            style: AppTypography.bodySmall.copyWith(fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),

              // Google / Gmail Profile & Avatar Permission Consent Card
              Container(
                padding: const EdgeInsets.all(AppSpacing.sm),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(
                    color: _googleDataConsent ? AppColors.accent.withValues(alpha: 0.5) : AppColors.border,
                    width: 1,
                  ),
                ),
                child: Row(
                  children: [
                    Checkbox(
                      value: _googleDataConsent,
                      activeColor: AppColors.accent,
                      checkColor: AppColors.backgroundDark,
                      onChanged: (val) => setState(() => _googleDataConsent = val ?? true),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Share Google / Gmail Profile & Avatar',
                            style: AppTypography.labelMedium.copyWith(
                              color: AppColors.textPrimary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Allow SAFARIS Uganda to display your Gmail profile photo & verified name for instant wallet Quick Transfers and payment receipts.',
                            style: AppTypography.bodySmall.copyWith(fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.sm),

              // Terms checkbox
              Row(
                children: [
                  Checkbox(
                    value: _agreedToTerms,
                    activeColor: AppColors.accent,
                    checkColor: AppColors.backgroundDark,
                    onChanged: (val) => setState(() => _agreedToTerms = val ?? true),
                  ),
                  Expanded(
                    child: Text(
                      'I agree to the ${AppConstants.appName} Terms of Service, Uganda Transport & Privacy policies.',
                      style: AppTypography.bodySmall,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),

              SafarisButton(
                text: 'Send Verification Code',
                isLoading: _isLoading,
                onPressed: _agreedToTerms ? _handleRegister : null,
              ),
              const SizedBox(height: AppSpacing.lg),

              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'Already registered? ',
                    style: AppTypography.bodyMedium,
                  ),
                  GestureDetector(
                    onTap: () => context.go('/auth/login'),
                    child: Text(
                      'Sign In',
                      style: AppTypography.labelLarge.copyWith(
                        color: AppColors.accent,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}
