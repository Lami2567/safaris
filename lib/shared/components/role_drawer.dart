import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/theme_provider.dart';
import '../../features/authentication/session_provider.dart';

class SafarisDrawer extends ConsumerWidget {
  const SafarisDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);

    return Drawer(
      backgroundColor: AppColors.surface,
      child: SafeArea(
        child: Column(
          children: [
            // User Header — name and email only
            Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: AppColors.border, width: 1)),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: AppColors.accent,
                    child: Text(
                      user.fullName.isNotEmpty ? user.fullName[0].toUpperCase() : 'S',
                      style: AppTypography.titleLarge.copyWith(
                        color: AppColors.backgroundDark,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user.fullName,
                          style: AppTypography.titleSmall.copyWith(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w700,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (user.email.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            user.email,
                            style: AppTypography.bodySmall.copyWith(
                              color: AppColors.textSecondary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Navigation Links
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.sm),
                children: [
                  _NavTile(
                    icon: Icons.history_rounded,
                    title: 'Trip History',
                    onTap: () {
                      Navigator.pop(context);
                      context.push('/trips/history');
                    },
                  ),
                  const SizedBox(height: 4),
                  _NavTile(
                    icon: Icons.account_balance_wallet_outlined,
                    title: 'Wallet',
                    onTap: () {
                      Navigator.pop(context);
                      context.push('/payments');
                    },
                  ),
                  const SizedBox(height: 4),
                  _NavTile(
                    icon: Icons.notifications_none_rounded,
                    title: 'Notifications',
                    onTap: () {
                      Navigator.pop(context);
                      context.push('/notifications');
                    },
                  ),
                  const SizedBox(height: 4),
                  _NavTile(
                    icon: Icons.support_agent_rounded,
                    title: 'Help',
                    onTap: () {
                      Navigator.pop(context);
                      context.push('/support');
                    },
                  ),
                  const SizedBox(height: 12),
                  const Divider(color: Colors.white12, height: 1),
                  const SizedBox(height: 8),

                  // Appearance / Theme Switcher
                  Consumer(
                    builder: (context, ref, _) {
                      final themeMode = ref.watch(themeModeProvider);
                      final isDark = themeMode == ThemeMode.dark;
                      return ListTile(
                        leading: Icon(
                          isDark ? Icons.dark_mode_rounded : Icons.light_mode_rounded,
                          color: AppColors.accent,
                          size: 20,
                        ),
                        title: Text(
                          'Appearance',
                          style: AppTypography.bodyMedium.copyWith(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        subtitle: Text(
                          isDark ? 'Dark Theme' : 'Light Theme',
                          style: AppTypography.bodySmall.copyWith(
                            color: AppColors.textSecondary,
                            fontSize: 11,
                          ),
                        ),
                        trailing: Switch.adaptive(
                          value: isDark,
                          activeColor: AppColors.accent,
                          onChanged: (_) {
                            ref.read(themeModeProvider.notifier).toggleTheme();
                          },
                        ),
                        dense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                      );
                    },
                  ),
                ],
              ),
            ),

            // Log Out
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: AppColors.border, width: 1)),
              ),
              child: ListTile(
                leading: const Icon(Icons.logout_rounded, color: AppColors.error, size: 20),
                title: Text(
                  'Log Out',
                  style: AppTypography.bodyMedium.copyWith(
                    color: AppColors.error,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                dense: true,
                onTap: () async {
                  await ref.read(currentUserProvider.notifier).logout();
                  if (context.mounted) {
                    Navigator.pop(context);
                    context.go('/auth/login');
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  const _NavTile({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AppColors.iconPrimary, size: 20),
      title: Text(
        title,
        style: AppTypography.bodyMedium.copyWith(
          color: AppColors.textPrimary,
          fontWeight: FontWeight.w500,
        ),
      ),
      trailing: Icon(Icons.chevron_right_rounded, color: AppColors.iconSecondary, size: 20),
      onTap: onTap,
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
    );
  }
}
