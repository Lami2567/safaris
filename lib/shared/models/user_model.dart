enum UserRole {
  customer,
  driver,
  tourGuide,
  admin,
}

class UserModel {
  final String id;
  final String fullName;
  final String email;
  final String phone;
  final String avatarUrl;
  final UserRole role;
  final double rating;
  final int totalTrips;
  final double walletBalanceUGX;
  final bool isVerified;

  const UserModel({
    required this.id,
    required this.fullName,
    required this.email,
    required this.phone,
    this.avatarUrl = '',
    this.role = UserRole.customer,
    this.rating = 5.0,
    this.totalTrips = 0,
    this.walletBalanceUGX = 0,
    this.isVerified = true,
  });

  UserModel copyWith({
    String? id,
    String? fullName,
    String? email,
    String? phone,
    String? avatarUrl,
    UserRole? role,
    double? rating,
    int? totalTrips,
    double? walletBalanceUGX,
    bool? isVerified,
  }) {
    return UserModel(
      id: id ?? this.id,
      fullName: fullName ?? this.fullName,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      role: role ?? this.role,
      rating: rating ?? this.rating,
      totalTrips: totalTrips ?? this.totalTrips,
      walletBalanceUGX: walletBalanceUGX ?? this.walletBalanceUGX,
      isVerified: isVerified ?? this.isVerified,
    );
  }

  static double _parseDouble(dynamic val, [double fallback = 0.0]) {
    if (val == null) return fallback;
    if (val is num) return val.toDouble();
    if (val is String) return double.tryParse(val) ?? fallback;
    return fallback;
  }

  static int _parseInt(dynamic val, [int fallback = 0]) {
    if (val == null) return fallback;
    if (val is num) return val.toInt();
    if (val is String) return int.tryParse(val) ?? fallback;
    return fallback;
  }

  static bool _parseBool(dynamic val, [bool fallback = false]) {
    if (val == null) return fallback;
    if (val is bool) return val;
    if (val is num) return val != 0;
    if (val is String) {
      final s = val.toLowerCase().trim();
      return s == 'true' || s == 't' || s == '1' || s == 'yes';
    }
    return fallback;
  }

  factory UserModel.fromJson(Map<String, dynamic> json) {
    UserRole role = UserRole.customer;
    final roleStr = json['role']?.toString().toLowerCase() ?? 'customer';
    if (roleStr == 'driver') {
      role = UserRole.driver;
    } else if (roleStr == 'tour_guide' || roleStr == 'tourguide') {
      role = UserRole.tourGuide;
    } else if (roleStr == 'admin') {
      role = UserRole.admin;
    }

    final rawBalance = json['wallet_balance_ugx'] ?? json['walletBalanceUGX'];
    final rawRating = json['rating'];
    final rawTrips = json['total_trips'] ?? json['totalTrips'];
    final rawVerified = json['is_verified'] ?? json['isVerified'] ?? json['verified'];

    return UserModel(
      id: json['id']?.toString() ?? '',
      fullName: json['full_name']?.toString() ?? json['fullName']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      phone: json['phone']?.toString() ?? '',
      avatarUrl: json['avatar_url']?.toString() ?? json['avatarUrl']?.toString() ?? '',
      role: role,
      rating: _parseDouble(rawRating, 5.0),
      totalTrips: _parseInt(rawTrips, 0),
      walletBalanceUGX: _parseDouble(rawBalance, 0.0),
      isVerified: _parseBool(rawVerified, false),
    );
  }

  Map<String, dynamic> toJson() {
    String roleStr = 'customer';
    switch (role) {
      case UserRole.driver:
        roleStr = 'driver';
        break;
      case UserRole.tourGuide:
        roleStr = 'tour_guide';
        break;
      case UserRole.admin:
        roleStr = 'admin';
        break;
      case UserRole.customer:
        roleStr = 'customer';
        break;
    }

    return {
      'id': id,
      'fullName': fullName,
      'email': email,
      'phone': phone,
      'avatarUrl': avatarUrl,
      'role': roleStr,
      'rating': rating,
      'totalTrips': totalTrips,
      'isVerified': isVerified,
    };
  }
}
