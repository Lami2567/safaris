import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app_colors.dart';

const String _themePrefKey = 'safaris_theme_mode';

class ThemeNotifier extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    _loadThemePreference();
    return ThemeMode.dark;
  }

  Future<void> _loadThemePreference() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedMode = prefs.getString(_themePrefKey);
      if (savedMode == 'light') {
        state = ThemeMode.light;
        AppColors.isDark = false;
        _updateSystemOverlay(false);
      } else {
        state = ThemeMode.dark;
        AppColors.isDark = true;
        _updateSystemOverlay(true);
      }
    } catch (_) {
      state = ThemeMode.dark;
      AppColors.isDark = true;
      _updateSystemOverlay(true);
    }
  }

  Future<void> toggleTheme() async {
    final newMode = state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    state = newMode;
    final isDark = newMode == ThemeMode.dark;
    AppColors.isDark = isDark;
    _updateSystemOverlay(isDark);

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_themePrefKey, isDark ? 'dark' : 'light');
    } catch (_) {}
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    if (state == mode) return;
    state = mode;
    final isDark = mode == ThemeMode.dark;
    AppColors.isDark = isDark;
    _updateSystemOverlay(isDark);

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_themePrefKey, isDark ? 'dark' : 'light');
    } catch (_) {}
  }

  void _updateSystemOverlay(bool isDark) {
    SystemChrome.setSystemUIOverlayStyle(
      SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
        statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
        systemNavigationBarColor: isDark ? const Color(0xFF0A0A0C) : const Color(0xFFF8F9FA),
        systemNavigationBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
      ),
    );
  }
}

final themeModeProvider = NotifierProvider<ThemeNotifier, ThemeMode>(ThemeNotifier.new);
