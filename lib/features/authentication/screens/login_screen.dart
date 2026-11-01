import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/user_model.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../../shared/widgets/safaris_text_field.dart';
import '../session_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final TextEditingController _identifierController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _isLoading = false;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _handleLogin() async {
    final identifier = _identifierController.text.trim();
    final password = _passwordController.text;

    if (identifier.isEmpty) {
      _showError('Please enter your phone number or email address.');
      return;
    }
    if (password.isEmpty) {
      _showError('Please enter your password.');
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final response = await ref.read(currentUserProvider.notifier).login(
        identifier: identifier,
        password: password,
      );

      if (!mounted) return;

      if (response.success && response.data != null) {
        final data = response.data!;

        // Case 1: Requires email OTP verification
        if (data['requiresVerification'] == true) {
          final email = data['email']?.toString() ?? identifier;
          context.push('/auth/otp', extra: email);
          return;
        }

        // Case 2: Successful authenticated login -> Route by verified role
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
        _showError(response.errorMessage ?? 'Invalid login credentials. Please check and try again.');
      }
    } catch (e) {
      debugPrint('❌ [LoginScreen _handleLogin Error]: $e');
      if (mounted) {
        _showError('Unable to log in. Please check your network connection and try again.');
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
          onPressed: () => context.go('/auth/onboarding'),
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
                'Welcome to ${AppConstants.appName}',
                style: AppTypography.displayMedium.copyWith(fontSize: 26),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Enter your phone number or email and password to sign in.',
                style: AppTypography.bodyMedium,
              ),
              const SizedBox(height: AppSpacing.xl),

              // Phone Number or Email Field
              SafarisTextField(
                controller: _identifierController,
                labelText: 'Phone Number or Email',
                hintText: 'e.g. 772123456 or user@example.com',
                keyboardType: TextInputType.emailAddress,
                prefixIcon: const Icon(Icons.account_circle_outlined, size: 20),
              ),
              const SizedBox(height: AppSpacing.md),

              // Password field
              SafarisTextField(
                controller: _passwordController,
                labelText: 'Password',
                hintText: 'Enter your password',
                obscureText: _obscurePassword,
                prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscurePassword
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                    size: 20,
                    color: AppColors.iconSecondary,
                  ),
                  onPressed: () {
                    setState(() {
                      _obscurePassword = !_obscurePassword;
                    });
                  },
                ),
              ),
              const SizedBox(height: AppSpacing.md),

              // Career Portal Note for Driver / Tour Guide credentials
              Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 0.8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.badge_outlined, size: 18, color: AppColors.accent),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Drivers & Tour Guides: Use the phone number and password registered via careers.mumwesafarisuganda.com to access your panel.',
                        style: AppTypography.bodySmall.copyWith(fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),

              // Sign in button
              SafarisButton(
                text: 'Sign In',
                isLoading: _isLoading,
                onPressed: _handleLogin,
              ),
              const SizedBox(height: AppSpacing.xl),

              // Registration link
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    "Don't have an account? ",
                    style: AppTypography.bodyMedium,
                  ),
                  GestureDetector(
                    onTap: () => context.go('/auth/register'),
                    child: Text(
                      'Register now',
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
