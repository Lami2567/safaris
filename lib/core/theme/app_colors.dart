import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  static bool isDark = true;

  // Dark Theme Palette
  static const Color darkBackground = Color(0xFF0A0A0C);
  static const Color darkBackgroundDark = Color(0xFF000000);
  static const Color darkSurface = Color(0xFF141518);
  static const Color darkSurfaceElevated = Color(0xFF1C1E24);
  static const Color darkSurfaceHigher = Color(0xFF252830);
  static const Color darkCard = Color(0xFF181A1F);
  static const Color darkBorder = Color(0xFF282B33);
  static const Color darkBorderLight = Color(0xFF383C47);
  static const Color darkDivider = Color(0xFF1E2128);
  static const Color darkTextPrimary = Color(0xFFFFFFFF);
  static const Color darkTextSecondary = Color(0xFF9CA3AF);
  static const Color darkTextTertiary = Color(0xFF6B7280);
  static const Color darkTextDisabled = Color(0xFF4B5563);
  static const Color darkIconPrimary = Color(0xFFFFFFFF);
  static const Color darkIconSecondary = Color(0xFF9CA3AF);
  static const Color darkIconMuted = Color(0xFF6B7280);
  static const Color darkMapBackground = Color(0xFF121316);

  // Light Theme Palette (Warm, High-Contrast, Consistent)
  static const Color lightBackground = Color(0xFFF8F9FA);
  static const Color lightBackgroundDark = Color(0xFFF1F3F5);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightSurfaceElevated = Color(0xFFFFFFFF);
  static const Color lightSurfaceHigher = Color(0xFFF3F4F6);
  static const Color lightCard = Color(0xFFFFFFFF);
  static const Color lightBorder = Color(0xFFE5E7EB);
  static const Color lightBorderLight = Color(0xFFD1D5DB);
  static const Color lightDivider = Color(0xFFEDF2F7);
  static const Color lightTextPrimary = Color(0xFF111827);
  static const Color lightTextSecondary = Color(0xFF4B5563);
  static const Color lightTextTertiary = Color(0xFF6B7280);
  static const Color lightTextDisabled = Color(0xFF9CA3AF);
  static const Color lightIconPrimary = Color(0xFF111827);
  static const Color lightIconSecondary = Color(0xFF6B7280);
  static const Color lightIconMuted = Color(0xFF9CA3AF);
  static const Color lightMapBackground = Color(0xFFF3F4F6);

  // Adaptive Getters - Automatically update when isDark changes
  static Color get background => isDark ? darkBackground : lightBackground;
  static Color get backgroundDark => isDark ? darkBackgroundDark : lightBackgroundDark;
  static Color get surface => isDark ? darkSurface : lightSurface;
  static Color get surfaceElevated => isDark ? darkSurfaceElevated : lightSurfaceElevated;
  static Color get surfaceHigher => isDark ? darkSurfaceHigher : lightSurfaceHigher;
  static Color get card => isDark ? darkCard : lightCard;
  static Color get border => isDark ? darkBorder : lightBorder;
  static Color get borderLight => isDark ? darkBorderLight : lightBorderLight;
  static Color get divider => isDark ? darkDivider : lightDivider;
  static Color get textPrimary => isDark ? darkTextPrimary : lightTextPrimary;
  static Color get textSecondary => isDark ? darkTextSecondary : lightTextSecondary;
  static Color get textTertiary => isDark ? darkTextTertiary : lightTextTertiary;
  static Color get textDisabled => isDark ? darkTextDisabled : lightTextDisabled;
  static Color get iconPrimary => isDark ? darkIconPrimary : lightIconPrimary;
  static Color get iconSecondary => isDark ? darkIconSecondary : lightIconSecondary;
  static Color get iconMuted => isDark ? darkIconMuted : lightIconMuted;
  static Color get mapBackground => isDark ? darkMapBackground : lightMapBackground;

  // Single Consistent Accent (Safari Gold / Uganda Sunrise Amber)
  static const Color accent = Color(0xFFE5A93C);
  static const Color accentLight = Color(0xFFFBBF24);
  static const Color accentDark = Color(0xFFB45309);
  static const Color accentMuted = Color(0x26E5A93C); // 15% opacity

  // Semantic
  static const Color success = Color(0xFF10B981);
  static const Color successMuted = Color(0x2610B981);
  static const Color error = Color(0xFFEF4444);
  static const Color errorMuted = Color(0x26EF4444);
  static const Color warning = Color(0xFFF59E0B);
  static const Color info = Color(0xFF3B82F6);

  // Map & Route Accents
  static const Color mapRoad = Color(0xFF1E2128);
  static const Color mapRoute = Color(0xFFFFFFFF);
  static const Color mapRouteRemaining = Color(0xFFE5A93C);
  static const Color mapDriverDot = Color(0xFFFFFFFF);
}
