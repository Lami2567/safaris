import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

enum SafarisBadgeVariant {
  accent,
  success,
  error,
  neutral,
}

class SafarisBadge extends StatelessWidget {
  final String text;
  final SafarisBadgeVariant variant;
  final IconData? icon;

  const SafarisBadge({
    super.key,
    required this.text,
    this.variant = SafarisBadgeVariant.neutral,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;

    switch (variant) {
      case SafarisBadgeVariant.accent:
        bg = AppColors.accentMuted;
        fg = AppColors.accent;
        break;
      case SafarisBadgeVariant.success:
        bg = AppColors.successMuted;
        fg = AppColors.success;
        break;
      case SafarisBadgeVariant.error:
        bg = AppColors.errorMuted;
        fg = AppColors.error;
        break;
      case SafarisBadgeVariant.neutral:
        bg = AppColors.surfaceElevated;
        fg = AppColors.textSecondary;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        border: Border.all(color: fg.withOpacity(0.3), width: 0.8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              text,
              style: AppTypography.labelSmall.copyWith(
                color: fg,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
