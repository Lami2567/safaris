enum ActivityCategory {
  ride,
  tourism,
  delivery,
}

class UserActivityItem {
  final String id;
  final ActivityCategory category;
  final String title;
  final String route;
  final String date;
  final double fareUGX;
  final String status; // 'COMPLETED', 'CONFIRMED', 'DISPATCHED', 'IN PROGRESS', 'CANCELLED'
  final String providerName;
  final DateTime timestamp;

  const UserActivityItem({
    required this.id,
    required this.category,
    required this.title,
    required this.route,
    required this.date,
    required this.fareUGX,
    required this.status,
    required this.providerName,
    required this.timestamp,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'category': category.name,
    'title': title,
    'route': route,
    'date': date,
    'fareUGX': fareUGX,
    'status': status,
    'providerName': providerName,
    'timestamp': timestamp.toIso8601String(),
  };

  factory UserActivityItem.fromJson(Map<String, dynamic> json) => UserActivityItem(
    id: json['id'] as String? ?? '',
    category: ActivityCategory.values.firstWhere(
      (c) => c.name == json['category'],
      orElse: () => ActivityCategory.ride,
    ),
    title: json['title'] as String? ?? 'Trip',
    route: json['route'] as String? ?? '',
    date: json['date'] as String? ?? '',
    fareUGX: (json['fareUGX'] as num?)?.toDouble() ?? 0.0,
    status: json['status'] as String? ?? 'COMPLETED',
    providerName: json['providerName'] as String? ?? 'DRIVER Uganda',
    timestamp: json['timestamp'] != null
        ? DateTime.tryParse(json['timestamp'] as String) ?? DateTime.now()
        : DateTime.now(),
  );
}
