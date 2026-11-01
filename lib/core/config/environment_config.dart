import 'package:shared_preferences/shared_preferences.dart';

/// Environment Configuration for DRIVER Mobile Application
///
/// Supports switching between:
/// 1. Local Offline Development (via localhost or custom local LAN IP for physical testing)
/// 2. VPS / Production Deployment (via secure HTTPS/WSS domain)
class EnvironmentConfig {
  /// Public VPS Backend IP Address
  static const String vpsIp = '18.222.41.199';
  static const String _defaultLocalHost = '10.0.2.2'; // Android Emulator default
  static const int _defaultPort = 3000;

  // Active environment mode: 'production' (default secure remote backend), 'vps', or 'local'
  // Overridable via `--dart-define=ENV=local` or `--dart-define=API_URL=http://...`
  static const String currentEnv = String.fromEnvironment('ENV', defaultValue: 'production');
  
  static const String overrideApiUrl = String.fromEnvironment('API_URL', defaultValue: '');
  static const String overrideSocketUrl = String.fromEnvironment('SOCKET_URL', defaultValue: '');

  static bool get isProduction => currentEnv == 'production';
  static bool get isVps => currentEnv == 'vps';
  static bool get isLocal => currentEnv == 'local';

  /// Base HTTP API URL
  static String get apiBaseUrl {
    if (overrideApiUrl.isNotEmpty) {
      return overrideApiUrl;
    }
    if (isProduction || isVps) {
      return 'https://admin.mumwesafarisuganda.com/api/v1';
    }
    // In local dev, use port 3000
    return 'http://$_defaultLocalHost:$_defaultPort/api/v1';
  }

  /// Base WebSocket URL
  static String get socketBaseUrl {
    if (overrideSocketUrl.isNotEmpty) {
      return overrideSocketUrl;
    }
    if (isProduction || isVps) {
      return 'https://admin.mumwesafarisuganda.com';
    }
    return 'http://$_defaultLocalHost:$_defaultPort';
  }

  /// For physical device testing over Wi-Fi (e.g., Samsung Galaxy SM-A055F)
  /// Can be set at runtime or via settings.
  static String customLanIp = '';

  static String get activeApiUrl {
    if (customLanIp.isNotEmpty) {
      return 'http://$customLanIp:$_defaultPort/api/v1';
    }
    return apiBaseUrl;
  }

  static String get activeSocketUrl {
    if (customLanIp.isNotEmpty) {
      return 'http://$customLanIp:$_defaultPort';
    }
    return socketBaseUrl;
  }

  /// Mapbox Public Access Token
  ///
  /// Token resolution order (first non-empty wins):
  ///   1. customMapboxToken  — loaded at startup from SharedPreferences (saved by RemoteConfigService)
  ///   2. _defaultMapboxToken — injected at build time via --dart-define=MAPBOX_ACCESS_TOKEN=pk.xxx
  ///                           Falls back to the literal default below if dart-define is not passed.
  ///   3. RemoteConfigService fetches the latest token from /api/v1/app-config on every launch
  ///      and overwrites customMapboxToken + SharedPreferences so subsequent cold starts use it.
  ///
  /// IMPORTANT: Do not hardwire the token anywhere else. Change it in:
  ///   - backend/.env.production   (source of truth for the server)
  ///   - admin/.env.production     (admin dashboard pre-fill)
  ///   - This default value below  (Flutter bootstrap fallback only)
  static const String _defaultMapboxToken = String.fromEnvironment(
    'MAPBOX_ACCESS_TOKEN',
    defaultValue: '',
  );
  static String customMapboxToken = '';

  static String get mapboxAccessToken =>
      customMapboxToken.isNotEmpty ? customMapboxToken : _defaultMapboxToken;

  static bool get hasMapboxToken => mapboxAccessToken.trim().isNotEmpty;

  static const String _prefMapboxTokenKey = 'safaris_mapbox_token';

  /// Loads any custom token persisted in device local storage
  static Future<String> loadSavedMapboxToken() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(_prefMapboxTokenKey) ?? '';
      if (token.isNotEmpty) {
        customMapboxToken = token.trim();
      }
      return mapboxAccessToken;
    } catch (_) {
      return mapboxAccessToken;
    }
  }

  /// Persists a user-provided Mapbox token to local storage
  static Future<void> saveMapboxToken(String token) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final trimmed = token.trim();
      await prefs.setString(_prefMapboxTokenKey, trimmed);
      customMapboxToken = trimmed;
    } catch (_) {}
  }
}
