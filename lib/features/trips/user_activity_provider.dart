import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models/user_activity_model.dart';

class UserActivityNotifier extends Notifier<List<UserActivityItem>> {
  static const String _storageKey = 'safaris_user_real_activities_v1';

  @override
  List<UserActivityItem> build() {
    _loadFromStorage();
    return const [];
  }

  Future<void> _loadFromStorage() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final listJson = prefs.getStringList(_storageKey);
      if (listJson != null && listJson.isNotEmpty) {
        final loaded = listJson.map((str) {
          return UserActivityItem.fromJson(jsonDecode(str) as Map<String, dynamic>);
        }).toList();
        loaded.sort((a, b) => b.timestamp.compareTo(a.timestamp));
        state = loaded;
      } else {
        // Absolutely NO stale or fake data
        state = const [];
      }
    } catch (_) {
      state = const [];
    }
  }

  Future<void> addActivity(UserActivityItem item) async {
    final filtered = state.where((a) => a.id != item.id).toList();
    final updated = [item, ...filtered];
    updated.sort((a, b) => b.timestamp.compareTo(a.timestamp));
    state = updated;
    await _saveToStorage(updated);
  }

  Future<void> updateStatus(String id, String newStatus) async {
    final updated = state.map((a) {
      if (a.id == id) {
        return UserActivityItem(
          id: a.id,
          category: a.category,
          title: a.title,
          route: a.route,
          date: a.date,
          fareUGX: a.fareUGX,
          status: newStatus,
          providerName: a.providerName,
          timestamp: a.timestamp,
        );
      }
      return a;
    }).toList();
    state = updated;
    await _saveToStorage(updated);
  }

  Future<void> _saveToStorage(List<UserActivityItem> list) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final encoded = list.map((item) => jsonEncode(item.toJson())).toList();
      await prefs.setStringList(_storageKey, encoded);
    } catch (_) {}
  }

  Future<void> clearAll() async {
    state = const [];
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_storageKey);
    } catch (_) {}
  }
}

final userActivityProvider =
    NotifierProvider<UserActivityNotifier, List<UserActivityItem>>(
  UserActivityNotifier.new,
);
