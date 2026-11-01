import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';
import '../../core/network/socket_service.dart';
import '../authentication/session_provider.dart';
import 'models/notification_model.dart';

class NotificationsState {
  final List<SafarisNotification> items;
  final bool isLoading;
  final NotificationCategory activeFilter;
  final String? error;

  const NotificationsState({
    this.items = const [],
    this.isLoading = false,
    this.activeFilter = NotificationCategory.all,
    this.error,
  });

  NotificationsState copyWith({
    List<SafarisNotification>? items,
    bool? isLoading,
    NotificationCategory? activeFilter,
    String? error,
  }) {
    return NotificationsState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      activeFilter: activeFilter ?? this.activeFilter,
      error: error,
    );
  }

  List<SafarisNotification> get filteredItems {
    if (activeFilter == NotificationCategory.all) {
      return items;
    }
    return items.where((n) => n.type == activeFilter).toList();
  }

  int get unreadCount {
    return items.where((n) => !n.isRead).length;
  }

  int countFor(NotificationCategory cat) {
    if (cat == NotificationCategory.all) return items.length;
    return items.where((n) => n.type == cat).length;
  }

  int unreadCountFor(NotificationCategory cat) {
    if (cat == NotificationCategory.all) return unreadCount;
    return items.where((n) => n.type == cat && !n.isRead).length;
  }
}

class NotificationsNotifier extends Notifier<NotificationsState> {
  bool _socketListening = false;

  @override
  NotificationsState build() {
    // Initial fetch on provider registration
    Future.microtask(() => init());
    return const NotificationsState(isLoading: true);
  }

  void init() {
    fetchNotifications();
    _setupSocketListener();
  }

  void _setupSocketListener() {
    if (_socketListening) return;
    _socketListening = true;

    RealtimeSocketService().on('notification:received', (data) {
      try {
        if (data is Map<String, dynamic>) {
          final incoming = SafarisNotification.fromJson(data);
          addIncomingNotification(incoming);
        }
      } catch (e) {
        debugPrint('[NotificationSocket Error]: $e');
      }
    });
  }

  void addIncomingNotification(SafarisNotification notif) {
    // Prevent duplicate entries
    final current = List<SafarisNotification>.from(state.items);
    current.removeWhere((n) => n.id == notif.id);
    current.insert(0, notif);
    state = state.copyWith(items: current);
  }

  Future<void> fetchNotifications() async {
    final user = ref.read(currentUserProvider);
    final userId = user.id.isNotEmpty ? user.id : '';

    state = state.copyWith(isLoading: true, error: null);

    if (userId.isEmpty) {
      state = state.copyWith(isLoading: false);
      return;
    }

    try {
      final res = await ApiClient().get<List<dynamic>>('/notifications/user/$userId');
      if (res.success && res.data != null) {
        final list = (res.data as List)
            .map((item) => SafarisNotification.fromJson(item as Map<String, dynamic>))
            .toList();
        state = state.copyWith(items: list, isLoading: false);
      } else {
        state = state.copyWith(isLoading: false);
      }
    } catch (e) {
      debugPrint('[fetchNotifications Error]: $e');
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setFilter(NotificationCategory filter) {
    state = state.copyWith(activeFilter: filter);
  }

  Future<void> markAsRead(String id) async {
    // Optimistic UI update
    final updated = state.items.map((n) {
      if (n.id == id) {
        return n.copyWith(isRead: true);
      }
      return n;
    }).toList();
    state = state.copyWith(items: updated);

    try {
      await ApiClient().put('/notifications/$id/read');
    } catch (e) {
      debugPrint('[markAsRead Error]: $e');
    }
  }

  Future<void> markAllAsRead() async {
    final user = ref.read(currentUserProvider);
    final userId = user.id.isNotEmpty ? user.id : 'usr_ug_001';

    // Optimistic UI update
    final updated = state.items.map((n) => n.copyWith(isRead: true)).toList();
    state = state.copyWith(items: updated);

    try {
      await ApiClient().put('/notifications/user/$userId/read-all');
    } catch (e) {
      debugPrint('[markAllAsRead Error]: $e');
    }
  }

  Future<void> deleteNotification(String id) async {
    // Optimistic removal from state
    final updated = state.items.where((n) => n.id != id).toList();
    state = state.copyWith(items: updated);

    try {
      await ApiClient().delete('/notifications/$id');
    } catch (e) {
      debugPrint('[deleteNotification Error]: $e');
    }
  }

  Future<void> clearAll() async {
    final user = ref.read(currentUserProvider);
    final userId = user.id.isNotEmpty ? user.id : 'usr_ug_001';
    final currentFilter = state.activeFilter;

    if (currentFilter == NotificationCategory.all) {
      state = state.copyWith(items: []);
      try {
        await ApiClient().delete('/notifications/user/$userId/clear');
      } catch (e) {
        debugPrint('[clearAll Error]: $e');
      }
    } else {
      final remaining = state.items.where((n) => n.type != currentFilter).toList();
      state = state.copyWith(items: remaining);
      try {
        await ApiClient().delete(
          '/notifications/user/$userId/clear?type=${currentFilter.toDbString()}',
        );
      } catch (e) {
        debugPrint('[clearFilter Error]: $e');
      }
    }
  }

}


final notificationsProvider =
    NotifierProvider<NotificationsNotifier, NotificationsState>(NotificationsNotifier.new);

final unreadNotificationsCountProvider = Provider<int>((ref) {
  final notifState = ref.watch(notificationsProvider);
  return notifState.unreadCount;
});
