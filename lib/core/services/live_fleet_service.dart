import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_client.dart';
import 'user_location_provider.dart';

class LiveDriverLocation {
  final String driverId;
  final String name;
  final String phone;
  final String status;
  final double rating;
  final double lat;
  final double lng;
  final double heading;
  final String vehicle;
  final String tier;
  final String plate;
  final double speed;

  const LiveDriverLocation({
    required this.driverId,
    required this.name,
    this.phone = '',
    this.status = 'available',
    required this.rating,
    required this.lat,
    required this.lng,
    this.heading = 0.0,
    this.vehicle = 'Safari Cruiser',
    this.tier = 'comfort',
    this.plate = '',
    this.speed = 0.0,
  });

  static double _parseDouble(dynamic val, [double fallback = 0.0]) {
    if (val == null) return fallback;
    if (val is num) return val.toDouble();
    if (val is String) return double.tryParse(val) ?? fallback;
    return fallback;
  }

  factory LiveDriverLocation.fromJson(Map<String, dynamic> json) {
    return LiveDriverLocation(
      driverId: json['driverId']?.toString() ?? json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? json['full_name']?.toString() ?? 'Safaris Driver',
      phone: json['phone']?.toString() ?? '',
      status: json['status']?.toString() ?? 'available',
      rating: _parseDouble(json['rating'], 4.9),
      lat: _parseDouble(json['lat'] ?? json['current_lat'], 0.3136),
      lng: _parseDouble(json['lng'] ?? json['current_lng'], 32.5811),
      heading: _parseDouble(json['heading'], 0.0),
      vehicle: json['vehicle']?.toString() ??
          ('${json['make'] ?? ''} ${json['model'] ?? ''}').trim(),
      tier: json['tier']?.toString() ?? 'comfort',
      plate: json['plate']?.toString() ?? json['registration_plate']?.toString() ?? '',
      speed: _parseDouble(json['speed'], 0.0),
    );
  }
}

class LiveFleetState {
  final List<LiveDriverLocation> drivers;
  final bool isLoading;
  final String? error;
  final DateTime lastUpdated;

  const LiveFleetState({
    this.drivers = const [],
    this.isLoading = false,
    this.error,
    required this.lastUpdated,
  });

  LiveFleetState copyWith({
    List<LiveDriverLocation>? drivers,
    bool? isLoading,
    String? error,
    DateTime? lastUpdated,
  }) {
    return LiveFleetState(
      drivers: drivers ?? this.drivers,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      lastUpdated: lastUpdated ?? this.lastUpdated,
    );
  }
}

class LiveFleetNotifier extends Notifier<LiveFleetState> {
  final ApiClient _client = ApiClient();
  Timer? _pollingTimer;

  @override
  LiveFleetState build() {
    ref.onDispose(() {
      _pollingTimer?.cancel();
    });

    Future.microtask(() {
      final userLoc = ref.read(userLocationProvider);
      fetchNearbyDrivers(
        lat: userLoc.latitude ?? 0.3136,
        lng: userLoc.longitude ?? 32.5811,
      );
    });

    ref.listen<UserLocationState>(userLocationProvider, (prev, next) {
      if (next.latitude != null && next.longitude != null) {
        fetchNearbyDrivers(lat: next.latitude!, lng: next.longitude!);
      }
    });

    // Fast 3.5s polling for fluid live vehicle movements on the map around user GPS
    _pollingTimer = Timer.periodic(const Duration(milliseconds: 3500), (_) {
      final userLoc = ref.read(userLocationProvider);
      fetchNearbyDrivers(
        lat: userLoc.latitude ?? 0.3136,
        lng: userLoc.longitude ?? 32.5811,
      );
    });

    return LiveFleetState(lastUpdated: DateTime.now());
  }

  Future<void> fetchNearbyDrivers({
    double lat = 0.3136,
    double lng = 32.5811,
    double radiusKm = 25,
  }) async {
    try {
      final response = await _client.get<List<dynamic>>(
        '/drivers/nearby?lat=$lat&lng=$lng&radiusKm=$radiusKm',
      );
      if (response.success && response.data != null) {
        final List<LiveDriverLocation> list = (response.data as List<dynamic>)
            .map((item) => LiveDriverLocation.fromJson(item as Map<String, dynamic>))
            .toList();

        state = state.copyWith(
          drivers: list,
          isLoading: false,
          lastUpdated: DateTime.now(),
        );
      } else {
        state = state.copyWith(isLoading: false);
      }
    } catch (e) {
      debugPrint('[LiveFleetNotifier fetchNearbyDrivers error]: $e');
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

final liveFleetProvider =
    NotifierProvider<LiveFleetNotifier, LiveFleetState>(LiveFleetNotifier.new);
