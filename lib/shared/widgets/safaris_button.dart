import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

enum SafarisButtonVariant {
  primary,
  secondary,
  outline,
  danger,
  ghost,
}

class SafarisButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final SafarisButtonVariant variant;
  final bool isLoading;
  final Widget? icon;
  final double? width;
  final double height;
  final double borderRadius;
  final bool isFullWidth;

  const SafarisButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.variant = SafarisButtonVariant.primary,
    this.isLoading = false,
    this.icon,
    this.width,
    this.height = 52.0,
    this.borderRadius = AppSpacing.radiusMd,
    this.isFullWidth = true,
  });

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    BorderSide borderSide = BorderSide.none;

    switch (variant) {
      case SafarisButtonVariant.primary:
        bg = AppColors.accent;
        fg = AppColors.backgroundDark;
        break;
      case SafarisButtonVariant.secondary:
        bg = AppColors.surfaceElevated;
        fg = AppColors.textPrimary;
        borderSide = BorderSide(color: AppColors.border, width: 1);
        break;
      case SafarisButtonVariant.outline:
        bg = Colors.transparent;
        fg = AppColors.textPrimary;
        borderSide = BorderSide(color: AppColors.borderLight, width: 1.2);
        break;
      case SafarisButtonVariant.danger:
        bg = AppColors.error;
        fg = AppColors.textPrimary;
        break;
      case SafarisButtonVariant.ghost:
        bg = Colors.transparent;
        fg = AppColors.textSecondary;
        break;
    }

    final effectiveOnPressed = isLoading ? null : onPressed;

    return SizedBox(
      width: width ?? (isFullWidth ? double.infinity : null),
      height: height,
      child: Material(
        color: effectiveOnPressed == null ? bg.withOpacity(0.5) : bg,
        borderRadius: BorderRadius.circular(borderRadius),
        child: InkWell(
          onTap: effectiveOnPressed,
          borderRadius: BorderRadius.circular(borderRadius),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(borderRadius),
              border: Border.fromBorderSide(borderSide),
            ),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: Center(
              child: isLoading
                  ? SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        valueColor: AlwaysStoppedAnimation<Color>(fg),
                      ),
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (icon != null) ...[
                          icon!,
                          const SizedBox(width: AppSpacing.xs),
                        ],
                        Text(
                          text,
                          style: AppTypography.labelLarge.copyWith(
                            color: effectiveOnPressed == null ? fg.withOpacity(0.5) : fg,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
