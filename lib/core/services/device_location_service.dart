import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import '../utils/geo_utils.dart';

enum DeviceLocationPermissionStatus {
  granted,
  denied,
  deniedForever,
  serviceDisabled,
}

class DeviceLocationData {
  final double latitude;
  final double longitude;
  final double? heading;
  final double? speed;
  final double? accuracy;
  final double? altitude;
  final String locality;
  final DateTime timestamp;

  const DeviceLocationData({
    required this.latitude,
    required this.longitude,
    this.heading,
    this.speed,
    this.accuracy,
    this.altitude,
    required this.locality,
    required this.timestamp,
  });
}

/// Native Hardware GPS & Location Permission Service for DRIVER Uganda
class DeviceLocationService {
  static final DeviceLocationService _instance = DeviceLocationService._internal();
  factory DeviceLocationService() => _instance;
  DeviceLocationService._internal();

  /// Known major urban centres and safari hubs across Uganda for locality estimation
  static const List<Map<String, dynamic>> _ugandaHubs = [
    {'name': 'Entebbe', 'lat': 0.0512, 'lng': 32.4637, 'region': 'Wakiso District'},
    {'name': 'Kampala CBD', 'lat': 0.3136, 'lng': 32.5811, 'region': 'Central Region'},
    {'name': 'Jinja', 'lat': 0.4479, 'lng': 33.2026, 'region': 'Eastern Region (Nile)'},
    {'name': 'Mukono', 'lat': 0.3544, 'lng': 32.7553, 'region': 'Central Region'},
    {'name': 'Mbarara', 'lat': -0.6072, 'lng': 30.6545, 'region': 'Western Region'},
    {'name': 'Fort Portal', 'lat': 0.6559, 'lng': 30.2740, 'region': 'Kabarole / Rwenzori'},
    {'name': 'Gulu', 'lat': 2.7747, 'lng': 32.2990, 'region': 'Northern Region'},
    {'name': 'Masaka', 'lat': -0.3411, 'lng': 31.7360, 'region': 'Central Region'},
    {'name': 'Mbale', 'lat': 1.0784, 'lng': 34.1755, 'region': 'Elgon Region'},
    {'name': 'Kasese', 'lat': 0.1833, 'lng': 30.0833, 'region': 'Queen Elizabeth Sector'},
    {'name': 'Kabale', 'lat': -1.2486, 'lng': 29.9890, 'region': 'Kigezi / Bwindi Gateway'},
    {'name': 'Arua', 'lat': 3.0303, 'lng': 30.9108, 'region': 'West Nile Region'},
    {'name': 'Lira', 'lat': 2.2472, 'lng': 32.9000, 'region': 'Lango Sub-region'},
    {'name': 'Tororo', 'lat': 0.6928, 'lng': 34.1809, 'region': 'Bukedi Region'},
    {'name': 'Hoima', 'lat': 1.4331, 'lng': 31.3524, 'region': 'Bunyoro Region'},
    {'name': 'Soroti', 'lat': 1.7146, 'lng': 33.6111, 'region': 'Teso Region'},
    {'name': 'Moroto', 'lat': 2.5345, 'lng': 34.6666, 'region': 'Karamoja Region'},
    {'name': 'Bwindi Impenetrable', 'lat': -1.0494, 'lng': 29.6917, 'region': 'Gorilla Sanctuary'},
    {'name': 'Queen Elizabeth Park', 'lat': -0.2155, 'lng': 30.0039, 'region': 'Kazinga Channel'},
    {'name': 'Murchison Falls', 'lat': 2.2828, 'lng': 31.6811, 'region': 'Albertine Rift'},
  ];

  /// Checks if location services (GPS hardware) are enabled on the device
  Future<bool> isLocationServiceEnabled() async {
    try {
      return await Geolocator.isLocationServiceEnabled();
    } catch (e) {
      debugPrint('Error checking location service: $e');
      return false;
    }
  }

  /// Checks current permission status without requesting
  Future<LocationPermission> checkPermission() async {
    try {
      return await Geolocator.checkPermission();
    } catch (e) {
      debugPrint('Error checking permission: $e');
      return LocationPermission.denied;
    }
  }

  /// Aggressively requests location permission and verifies GPS hardware state
  Future<DeviceLocationPermissionStatus> requestLocationPermission() async {
    try {
      final serviceEnabled = await isLocationServiceEnabled();
      if (!serviceEnabled) {
        return DeviceLocationPermissionStatus.serviceDisabled;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.deniedForever) {
        return DeviceLocationPermissionStatus.deniedForever;
      }

      if (permission == LocationPermission.denied) {
        return DeviceLocationPermissionStatus.denied;
      }

      return DeviceLocationPermissionStatus.granted;
    } catch (e) {
      debugPrint('Error requesting location permission: $e');
      return DeviceLocationPermissionStatus.denied;
    }
  }

  /// Gets the real hardware GPS fix
  Future<DeviceLocationData?> getCurrentPosition({
    Duration timeout = const Duration(seconds: 12),
  }) async {
    try {
      final permission = await checkPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }

      Position? position;
      try {
        position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 10),
          ),
        ).timeout(timeout);
      } catch (e) {
        debugPrint('High accuracy position timed out or failed, checking last known: $e');
        position = await Geolocator.getLastKnownPosition();
      }

      if (position == null) {
        return null;
      }

      final locality = getUgandaLocalityName(position.latitude, position.longitude);

      return DeviceLocationData(
        latitude: position.latitude,
        longitude: position.longitude,
        heading: position.heading,
        speed: position.speed,
        accuracy: position.accuracy,
        altitude: position.altitude,
        locality: locality,
        timestamp: position.timestamp,
      );
    } catch (e) {
      debugPrint('Error getting current position: $e');
      return null;
    }
  }

  /// Stream real-time GPS position updates as the device moves
  Stream<DeviceLocationData> getPositionStream({
    int distanceFilterMeters = 10,
  }) {
    return Geolocator.getPositionStream(
      locationSettings: LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilterMeters,
      ),
    ).map((position) {
      final locality = getUgandaLocalityName(position.latitude, position.longitude);
      return DeviceLocationData(
        latitude: position.latitude,
        longitude: position.longitude,
        heading: position.heading,
        speed: position.speed,
        accuracy: position.accuracy,
        altitude: position.altitude,
        locality: locality,
        timestamp: position.timestamp,
      );
    });
  }

  /// Opens the device app settings so the user can grant permission if denied forever
  Future<bool> openAppSettings() async {
    try {
      return await Geolocator.openAppSettings();
    } catch (e) {
      debugPrint('Error opening app settings: $e');
      return false;
    }
  }

  /// Opens the device location settings so the user can turn on GPS
  Future<bool> openLocationSettings() async {
    try {
      return await Geolocator.openLocationSettings();
    } catch (e) {
      debugPrint('Error opening location settings: $e');
      return false;
    }
  }

  /// Resolves the nearest Uganda locality or district for a given GPS coordinate
  static String getUgandaLocalityName(double lat, double lng) {
    double minDistance = double.infinity;
    Map<String, dynamic>? closestHub;

    for (final hub in _ugandaHubs) {
      final double hubLat = hub['lat'] as double;
      final double hubLng = hub['lng'] as double;
      final dist = GeoUtils.haversineDistance(lat, lng, hubLat, hubLng);
      if (dist < minDistance) {
        minDistance = dist;
        closestHub = hub;
      }
    }

    if (closestHub != null) {
      if (minDistance <= 15.0) {
        return '${closestHub['name']}, Uganda';
      } else if (minDistance <= 45.0) {
        return 'Near ${closestHub['name']} (${closestHub['region']})';
      } else {
        return '${closestHub['name']} Region';
      }
    }

    return 'Uganda (${lat.toStringAsFixed(3)}, ${lng.toStringAsFixed(3)})';
  }
}
