import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';
import '../../shared/models/user_model.dart';

class SessionNotifier extends Notifier<UserModel> {
  static const String _prefTokenKey = 'safaris_auth_token';
  static const String _prefRefreshTokenKey = 'safaris_refresh_token';
  static const String _prefUserKey = 'safaris_user_session';
  static const String _prefPendingEmailKey = 'safaris_pending_email';

  static const UserModel unauthenticatedUser = UserModel(
    id: '',
    fullName: '',
    email: '',
    phone: '',
    role: UserRole.customer,
    rating: 5.0,
    totalTrips: 0,
    walletBalanceUGX: 0,
    isVerified: false,
  );

  @override
  UserModel build() {
    // Intercept unauthorized/expired token events globally
    ApiClient().onUnauthorized = (msg) {
      debugPrint('⚠️ [SessionNotifier] Received 401 Unauthorized: $msg');
      // Attempt silent refresh in background
      _attemptSilentRefresh();
    };
    return unauthenticatedUser;
  }

  bool get isAuthenticated => state.id.isNotEmpty && state.isVerified;

  /// Load persisted login session from local storage on app start.
  Future<bool> loadSavedSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(_prefTokenKey);
      final userJson = prefs.getString(_prefUserKey);

      if (token != null && token.isNotEmpty && userJson != null && userJson.isNotEmpty) {
        final dynamic rawMap = jsonDecode(userJson);
        if (rawMap is Map) {
          final userMap = Map<String, dynamic>.from(rawMap);
          // Never trust or load any locally cached wallet amount
          userMap.remove('walletBalanceUGX');
          userMap.remove('wallet_balance_ugx');
          final user = UserModel.fromJson(userMap).copyWith(walletBalanceUGX: 0.0);

          if (user.isVerified) {
            ApiClient().setAuthToken(token);
            state = user;
            // Overwrite stored session without any wallet balance field
            await prefs.setString(_prefUserKey, jsonEncode(user.toJson()));
            debugPrint('🔑 [SessionNotifier] Auto-logged in as: ${user.fullName} (${user.role})');
            await refreshProfile();
            return true;
          }
        }
      }
    } catch (e) {
      debugPrint('❌ [SessionNotifier loadSavedSession Error]: $e');
    }
    return false;
  }

  /// Check if there is an uncompleted email OTP verification
  Future<String?> getPendingVerificationEmail() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_prefPendingEmailKey);
    } catch (e) {
      return null;
    }
  }

  /// Register a new Customer account and send email OTP
  Future<ApiResponse<Map<String, dynamic>>> register({
    required String fullName,
    required String phone,
    required String email,
    required String password,
    bool googleDataConsent = true,
    String? avatarUrl,
  }) async {
    try {
      final cleanEmail = email.trim().toLowerCase();
      final resolvedAvatar = (avatarUrl != null && avatarUrl.trim().isNotEmpty)
          ? avatarUrl.trim()
          : (googleDataConsent && cleanEmail.isNotEmpty
              ? 'https://unavatar.io/google/${Uri.encodeComponent(cleanEmail)}'
              : '');

      final response = await ApiClient().post<Map<String, dynamic>>(
        '/auth/register',
        body: {
          'fullName': fullName.trim(),
          'phone': phone.trim(),
          'email': cleanEmail,
          'password': password,
          'role': 'customer', // Mobile app signup is strictly for customers
          'googleDataConsent': googleDataConsent,
          'avatarUrl': resolvedAvatar,
        },
      );

      if (response.success && response.data != null) {
        final data = response.data!;
        final pendingEmail = data['email']?.toString() ?? email.trim().toLowerCase();

        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_prefPendingEmailKey, pendingEmail);
      }

      return response;
    } catch (e, stack) {
      debugPrint('❌ [SessionNotifier.register Error]: $e\n$stack');
      return ApiResponse<Map<String, dynamic>>(
        success: false,
        errorMessage: 'Registration error: ${e.toString()}',
        statusCode: 500,
      );
    }
  }

  /// Login with phone or email and password
  Future<ApiResponse<Map<String, dynamic>>> login({
    required String identifier,
    required String password,
  }) async {
    try {
      final response = await ApiClient().post<Map<String, dynamic>>(
        '/auth/login',
        body: {
          'identifier': identifier.trim(),
          'password': password,
        },
      );

      if (response.success && response.data != null) {
        final data = response.data!;

        // Case 1: Account requires email verification
        if (data['requiresVerification'] == true) {
          final pendingEmail = data['email']?.toString() ?? identifier.trim();
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_prefPendingEmailKey, pendingEmail);
          return response;
        }

        // Case 2: Verified user logged in successfully
        final token = data['accessToken']?.toString();
        final refreshToken = data['refreshToken']?.toString();
        final rawUser = data['user'];

        if (token != null && rawUser != null && rawUser is Map) {
          final userMap = Map<String, dynamic>.from(rawUser);
          final user = UserModel.fromJson(userMap);
          ApiClient().setAuthToken(token);
          state = user;

          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_prefTokenKey, token);
          if (refreshToken != null) {
            await prefs.setString(_prefRefreshTokenKey, refreshToken);
          }
          await prefs.setString(_prefUserKey, jsonEncode(user.toJson()));
          await prefs.remove(_prefPendingEmailKey);
          debugPrint('✅ [SessionNotifier.login] Successfully authenticated ${user.fullName} (${user.email})');
        }
      }

      return response;
    } catch (e, stack) {
      debugPrint('❌ [SessionNotifier.login Error]: $e\n$stack');
      return ApiResponse<Map<String, dynamic>>(
        success: false,
        errorMessage: 'Login failed: ${e.toString()}',
        statusCode: 500,
      );
    }
  }

  /// Verify email OTP code and complete login
  Future<ApiResponse<Map<String, dynamic>>> verifyEmailOtp({
    required String email,
    required String otpCode,
  }) async {
    try {
      final response = await ApiClient().post<Map<String, dynamic>>(
        '/auth/verify-email-otp',
        body: {
          'email': email.trim().toLowerCase(),
          'otpCode': otpCode.trim(),
        },
      );

      if (response.success && response.data != null) {
        final data = response.data!;
        final token = data['accessToken']?.toString();
        final refreshToken = data['refreshToken']?.toString();
        final rawUser = data['user'];

        if (token != null && rawUser != null && rawUser is Map) {
          final userMap = Map<String, dynamic>.from(rawUser);
          final user = UserModel.fromJson(userMap);
          ApiClient().setAuthToken(token);
          state = user;

          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_prefTokenKey, token);
          if (refreshToken != null) {
            await prefs.setString(_prefRefreshTokenKey, refreshToken);
          }
          await prefs.setString(_prefUserKey, jsonEncode(user.toJson()));
          await prefs.remove(_prefPendingEmailKey);
        }
      }

      return response;
    } catch (e, stack) {
      debugPrint('❌ [SessionNotifier.verifyEmailOtp Error]: $e\n$stack');
      return ApiResponse<Map<String, dynamic>>(
        success: false,
        errorMessage: 'Verification failed: ${e.toString()}',
        statusCode: 500,
      );
    }
  }

  /// Silent token renewal using stored refresh token
  Future<bool> _attemptSilentRefresh() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final rToken = prefs.getString(_prefRefreshTokenKey);
      if (rToken == null || rToken.isEmpty) return false;

      final res = await ApiClient().post<Map<String, dynamic>>(
        '/auth/refresh',
        body: {'refreshToken': rToken},
      );

      if (res.success && res.data != null) {
        final newAccess = res.data!['accessToken']?.toString();
        final newRefresh = res.data!['refreshToken']?.toString();
        if (newAccess != null && newAccess.isNotEmpty) {
          ApiClient().setAuthToken(newAccess);
          await prefs.setString(_prefTokenKey, newAccess);
          if (newRefresh != null && newRefresh.isNotEmpty) {
            await prefs.setString(_prefRefreshTokenKey, newRefresh);
          }
          debugPrint('🔄 [SessionNotifier] Silent token refresh succeeded.');
          return true;
        }
      }
    } catch (e) {
      debugPrint('⚠️ [SessionNotifier] Silent refresh failed: $e');
    }
    return false;
  }

  /// Resend a fresh OTP to the user's email
  Future<ApiResponse<Map<String, dynamic>>> resendOtp(String email) async {
    return await ApiClient().post<Map<String, dynamic>>(
      '/auth/resend-email-otp',
      body: {'email': email.trim().toLowerCase()},
    );
  }

  /// Logout and clear saved sessions
  Future<void> logout() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_prefTokenKey);
      await prefs.remove(_prefRefreshTokenKey);
      await prefs.remove(_prefUserKey);
      await prefs.remove(_prefPendingEmailKey);
    } catch (e) {
      debugPrint('❌ [Logout Error]: $e');
    }
    ApiClient().setAuthToken(null);
    state = unauthenticatedUser;
  }

  void updateProfile({String? fullName, String? email, String? phone, String? avatarUrl}) {
    state = state.copyWith(
      fullName: fullName ?? state.fullName,
      email: email ?? state.email,
      phone: phone ?? state.phone,
      avatarUrl: avatarUrl ?? state.avatarUrl,
    );
  }

  /// Sync Google / Gmail profile & avatar data sharing permission with the server
  Future<bool> syncGoogleProfileConsent({required bool allowShare}) async {
    try {
      final cleanEmail = state.email.trim().toLowerCase();
      final newAvatar = allowShare && cleanEmail.isNotEmpty
          ? 'https://unavatar.io/google/${Uri.encodeComponent(cleanEmail)}'
          : '';
      final endpoint = state.id.isNotEmpty ? '/users/${state.id}' : '/users/me';
      final res = await ApiClient().put<dynamic>(
        endpoint,
        body: {
          'googleDataConsent': allowShare,
          'avatarUrl': newAvatar,
        },
      );
      if (res.success) {
        state = state.copyWith(avatarUrl: newAvatar);
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_prefUserKey, jsonEncode(state.toJson()));
        return true;
      }
    } catch (e) {
      debugPrint('⚠️ [SessionNotifier.syncGoogleProfileConsent] Error: $e');
    }
    return false;
  }

  Future<ApiResponse<Map<String, dynamic>>> topUpWallet(double amountUGX) async {
    try {
      final response = await ApiClient().post<Map<String, dynamic>>(
        '/payments/topup',
        body: {'amountUGX': amountUGX},
      );
      if (response.success) {
        await refreshProfile();
      }
      return response;
    } catch (e) {
      return ApiResponse<Map<String, dynamic>>(
        success: false,
        errorMessage: e.toString(),
        statusCode: 500,
      );
    }
  }

  Future<void> refreshProfile() async {
    try {
      final endpoint = state.id.isNotEmpty ? '/users/${state.id}' : '/users/me';
      final response = await ApiClient().get<dynamic>(endpoint);
      if (response.success && response.data != null) {
        final Map<String, dynamic> data = response.data is Map
            ? Map<String, dynamic>.from(response.data as Map)
            : <String, dynamic>{};
        if (data.isNotEmpty) {
          final updated = UserModel.fromJson(data);
          state = updated;
          final prefs = await SharedPreferences.getInstance();
          // toJson() omits walletBalanceUGX so no wallet amount is ever stored locally
          await prefs.setString(_prefUserKey, jsonEncode(updated.toJson()));
          debugPrint('✅ [SessionNotifier] Refreshed profile for ${updated.fullName}: server wallet=${updated.walletBalanceUGX} UGX');
        }
      }
    } catch (e) {
      debugPrint('⚠️ [SessionNotifier refreshProfile error]: $e');
    }
  }

  void setRole(UserRole role) {
    state = state.copyWith(role: role);
  }

  void resetToDefault() {
    logout();
  }
}

final currentUserProvider = NotifierProvider<SessionNotifier, UserModel>(SessionNotifier.new);
