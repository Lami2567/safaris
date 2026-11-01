import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../authentication/session_provider.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _syncingGoogle = false;

  Future<void> _handleToggleGoogleConsent(bool allow) async {
    setState(() => _syncingGoogle = true);
    final ok = await ref
        .read(currentUserProvider.notifier)
        .syncGoogleProfileConsent(allowShare: allow);
    if (!mounted) return;
    setState(() => _syncingGoogle = false);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? (allow
                  ? 'Google / Gmail profile avatar & payment identity sharing enabled.'
                  : 'Google / Gmail avatar sharing disabled.')
              : 'Could not update Google profile sharing preference.',
          style: const TextStyle(color: Colors.white),
        ),
        backgroundColor: ok ? AppColors.success : AppColors.error,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final hasGoogleAvatar = user.avatarUrl != null && user.avatarUrl!.trim().isNotEmpty;
    final cleanEmail = user.email.trim().toLowerCase();
    final effectiveAvatarUrl = hasGoogleAvatar
        ? user.avatarUrl!.trim()
        : (cleanEmail.isNotEmpty
            ? 'https://unavatar.io/google/${Uri.encodeComponent(cleanEmail)}'
            : '');

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const SafarisAppBar(
        title: 'My Profile & Account',
        subtitle: 'Settings, Google Identity & UGX Preferences',
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          // Profile Card with Gmail / Google Avatar
          Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
              border: Border.all(color: AppColors.border, width: 1),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: AppColors.accent,
                  backgroundImage:
                      effectiveAvatarUrl.isNotEmpty ? NetworkImage(effectiveAvatarUrl) : null,
                  onBackgroundImageError: effectiveAvatarUrl.isNotEmpty ? (_, __) {} : null,
                  child: effectiveAvatarUrl.isEmpty
                      ? Text(
                          user.fullName.isNotEmpty ? user.fullName[0].toUpperCase() : 'U',
                          style: AppTypography.displayMedium.copyWith(
                            color: AppColors.backgroundDark,
                            fontWeight: FontWeight.w800,
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              user.fullName,
                              style: AppTypography.titleMedium.copyWith(fontWeight: FontWeight.w700),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Icon(Icons.verified, size: 16, color: AppColors.success),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(user.phone, style: AppTypography.bodySmall),
                      Text(user.email, style: AppTypography.bodySmall.copyWith(fontSize: 11)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          // Google / Gmail Data Sharing Permission Card for Quick Transfers & Payments
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              border: Border.all(color: AppColors.accent.withValues(alpha: 0.4), width: 1),
            ),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.account_circle_outlined, color: AppColors.accent, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Google / Gmail Profile Data Permission',
                        style: AppTypography.labelMedium.copyWith(
                          color: AppColors.textPrimary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Share your Gmail avatar & account profile with SAFARIS Uganda for verified DPO payments & instant UGX Quick Transfers.',
                        style: AppTypography.bodySmall.copyWith(fontSize: 11),
                      ),
                    ],
                  ),
                ),
                _syncingGoogle
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Switch(
                        value: hasGoogleAvatar || cleanEmail.isNotEmpty,
                        activeThumbColor: AppColors.accent,
                        onChanged: (val) => _handleToggleGoogleConsent(val),
                      ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          // Preferences & User Settings
          Text(
            'USER SETTINGS',
            style: AppTypography.labelSmall.copyWith(
              color: AppColors.textTertiary,
              letterSpacing: 1.0,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),

          const _SettingTile(
            title: 'Active Country',
            value: 'Uganda (+256)',
            icon: Icons.flag_rounded,
          ),
          const _SettingTile(
            title: 'Display Currency',
            value: 'UGX (Ugandan Shilling)',
            icon: Icons.payments_outlined,
          ),
          const _SettingTile(
            title: 'Languages',
            value: 'English (UK) • Luganda • Swahili',
            icon: Icons.translate_rounded,
          ),
          _SettingTile(
            title: 'Help & Support',
            value: '24/7 assistance, trip support & safety',
            icon: Icons.help_outline_rounded,
            onTap: () => context.push('/support'),
          ),
          const SizedBox(height: AppSpacing.lg),

          // Help button
          SafarisButton(
            text: 'Help & Support Center',
            variant: SafarisButtonVariant.secondary,
            icon: const Icon(Icons.support_agent_rounded, size: 20),
            onPressed: () => context.push('/support'),
          ),
          const SizedBox(height: AppSpacing.sm),

          // Sign out button
          SafarisButton(
            text: 'Log Out of Account',
            variant: SafarisButtonVariant.outline,
            onPressed: () async {
              await ref.read(currentUserProvider.notifier).logout();
              if (context.mounted) {
                context.go('/auth/login');
              }
            },
          ),
          const SizedBox(height: AppSpacing.xxl),
        ],
      ),
    );
  }
}

class _SettingTile extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final VoidCallback? onTap;

  const _SettingTile({
    required this.title,
    required this.value,
    required this.icon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          border: Border.all(color: AppColors.border, width: 1),
        ),
        child: Row(
          children: [
            Icon(icon, size: 20, color: AppColors.accent),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(title, style: AppTypography.labelMedium.copyWith(color: AppColors.textPrimary)),
                  Text(value, style: AppTypography.bodySmall.copyWith(fontSize: 11)),
                ],
              ),
            ),
            if (onTap != null)
              Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.iconSecondary),
          ],
        ),
      ),
    );
  }
}
