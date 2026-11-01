import 'package:flutter/material.dart';


enum NotificationCategory {
  all,
  driver,
  payment,
  admin,
  system;

  static NotificationCategory fromString(String? val) {
    if (val == null) return NotificationCategory.system;
    switch (val.trim().toLowerCase()) {
      case 'driver':
      case 'ride':
      case 'trip':
        return NotificationCategory.driver;
      case 'payment':
      case 'wallet':
      case 'momo':
        return NotificationCategory.payment;
      case 'admin':
      case 'advisory':
      case 'promo':
      case 'announcement':
        return NotificationCategory.admin;
      default:
        return NotificationCategory.system;
    }
  }

  String toDbString() {
    switch (this) {
      case NotificationCategory.driver:
        return 'DRIVER';
      case NotificationCategory.payment:
        return 'PAYMENT';
      case NotificationCategory.admin:
        return 'ADMIN';
      case NotificationCategory.system:
      case NotificationCategory.all:
        return 'SYSTEM';
    }
  }

  String get label {
    switch (this) {
      case NotificationCategory.all:
        return 'All';
      case NotificationCategory.driver:
        return 'Driver Updates';
      case NotificationCategory.payment:
        return 'Payment Updates';
      case NotificationCategory.admin:
        return 'Admin Advisories';
      case NotificationCategory.system:
        return 'System';
    }
  }
}

class SafarisNotification {
  final String id;
  final String userId;
  final String title;
  final String message;
  final NotificationCategory type;
  final bool isRead;
  final DateTime createdAt;
  final Map<String, dynamic> metadata;

  const SafarisNotification({
    required this.id,
    required this.userId,
    required this.title,
    required this.message,
    required this.type,
    this.isRead = false,
    required this.createdAt,
    this.metadata = const {},
  });

  factory SafarisNotification.fromJson(Map<String, dynamic> json) {
    DateTime parsedDate;
    try {
      parsedDate = json['created_at'] != null
          ? DateTime.parse(json['created_at'].toString())
          : DateTime.now();
    } catch (_) {
      parsedDate = DateTime.now();
    }

    Map<String, dynamic> meta = {};
    if (json['metadata'] is Map<String, dynamic>) {
      meta = json['metadata'] as Map<String, dynamic>;
    } else if (json['data'] is Map<String, dynamic>) {
      meta = json['data'] as Map<String, dynamic>;
    }

    return SafarisNotification(
      id: json['id']?.toString() ?? '',
      userId: json['user_id']?.toString() ?? json['userId']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Notification',
      message: json['message']?.toString() ?? json['body']?.toString() ?? '',
      type: NotificationCategory.fromString(json['type']?.toString()),
      isRead: json['is_read'] == true || json['isRead'] == true,
      createdAt: parsedDate,
      metadata: meta,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'user_id': userId,
    'title': title,
    'message': message,
    'type': type.toDbString(),
    'is_read': isRead,
    'created_at': createdAt.toIso8601String(),
    'metadata': metadata,
  };

  SafarisNotification copyWith({
    String? id,
    String? userId,
    String? title,
    String? message,
    NotificationCategory? type,
    bool? isRead,
    DateTime? createdAt,
    Map<String, dynamic>? metadata,
  }) {
    return SafarisNotification(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      title: title ?? this.title,
      message: message ?? this.message,
      type: type ?? this.type,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt ?? this.createdAt,
      metadata: metadata ?? this.metadata,
    );
  }

  String get timeAgo {
    final diff = DateTime.now().difference(createdAt);
    if (diff.inSeconds < 45) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays == 1) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${createdAt.day}/${createdAt.month}/${createdAt.year}';
  }

  IconData get icon {
    switch (type) {
      case NotificationCategory.driver:
        final status = metadata['status']?.toString();
        if (status == 'TRIP_COMPLETED') return Icons.check_circle_outline_rounded;
        return Icons.directions_car_rounded;
      case NotificationCategory.payment:
        return Icons.account_balance_wallet_rounded;
      case NotificationCategory.admin:
        final cat = metadata['category']?.toString().toLowerCase() ?? '';
        if (cat.contains('security')) return Icons.shield_rounded;
        if (cat.contains('promo')) return Icons.local_offer_rounded;
        return Icons.campaign_rounded;
      case NotificationCategory.system:
      case NotificationCategory.all:
        return Icons.notifications_active_rounded;
    }
  }

  String get badgeTag {
    switch (type) {
      case NotificationCategory.driver:
        return metadata['status']?.toString() ?? 'DRIVER';
      case NotificationCategory.payment:
        return metadata['paymentMethod']?.toString() ?? 'MOMO';
      case NotificationCategory.admin:
        return metadata['category']?.toString() ?? 'ADMIN';
      case NotificationCategory.system:
      case NotificationCategory.all:
        return 'INFO';
    }
  }
}
