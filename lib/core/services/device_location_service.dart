import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import '../../shared/models/location_model.dart';
import '../utils/geo_utils.dart';

enum DeviceLocationPermissionStatus {
  granted,
  grantedAlways,
  denied,
  deniedForever,
  serviceDisabled,
}

enum GpsTrackingProfile {
  customerForeground,
  driverOnlineIdle,
  approachingPickup,
  activeTripNavigation,
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

  double get speedKmh => ((speed ?? 0.0) * 3.6).clamp(0.0, 220.0);
}

typedef DeviceLocationPoint = DeviceLocationData;

/// Native Hardware GPS, Foreground Service & Location Permission Service for Mumwe Safaris
class DeviceLocationService {
  static final DeviceLocationService _instance =
      DeviceLocationService._internal();
  factory DeviceLocationService() => _instance;
  DeviceLocationService._internal();

  static const MethodChannel _navigationServiceChannel =
      MethodChannel('com.safaris.safaris/navigation_service');

  /// Known major urban centres, municipalities, and safari hubs across Uganda
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
    {'name': 'Rukungiri', 'lat': -0.8411, 'lng': 29.9419, 'region': 'Western Region'},
    {'name': 'Kisoro', 'lat': -1.2854, 'lng': 29.6850, 'region': 'Virunga / Mgahinga'},
    {'name': 'Bushenyi-Ishaka', 'lat': -0.5419, 'lng': 30.1856, 'region': 'Ankole Region'},
    {'name': 'Ntungamo', 'lat': -0.8794, 'lng': 30.2642, 'region': 'Western Region'},
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

  Future<DeviceLocationPermissionStatus> checkPermissionStatus() async {
    try {
      final enabled = await isLocationServiceEnabled();
      if (!enabled) return DeviceLocationPermissionStatus.serviceDisabled;
      final perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.always) {
        return DeviceLocationPermissionStatus.grantedAlways;
      }
      if (perm == LocationPermission.whileInUse) {
        return DeviceLocationPermissionStatus.granted;
      }
      if (perm == LocationPermission.deniedForever) {
        return DeviceLocationPermissionStatus.deniedForever;
      }
      return DeviceLocationPermissionStatus.denied;
    } catch (_) {
      return DeviceLocationPermissionStatus.denied;
    }
  }

  /// Requests foreground location permission and verifies GPS hardware state
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

  /// Requests background location permission when the user is a driver or starting live navigation
  Future<DeviceLocationPermissionStatus> requestBackgroundLocationPermission() async {
    final fg = await requestLocationPermission();
    if (fg != DeviceLocationPermissionStatus.granted &&
        fg != DeviceLocationPermissionStatus.grantedAlways) {
      return fg;
    }
    try {
      final perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.always) {
        return DeviceLocationPermissionStatus.grantedAlways;
      }
      if (perm == LocationPermission.whileInUse) {
        return DeviceLocationPermissionStatus.granted;
      }
    } catch (_) {}
    return fg;
  }

  /// Requests Android 13+ notification permission for the persistent live navigation banner
  Future<bool> requestNotificationPermission() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return true;
    try {
      final hasPerm = await _navigationServiceChannel
          .invokeMethod<bool>('checkNotificationPermission');
      if (hasPerm == true) return true;
      final requested = await _navigationServiceChannel
          .invokeMethod<bool>('requestNotificationPermission');
      return requested ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Starts or updates the Android Foreground Location & Live Navigation Notification
  Future<void> startOrUpdateForegroundNavigation({
    required String tripId,
    required String stage,
    required String instruction,
    required String roadName,
    required String distanceNextText,
    required String remainingDistanceText,
    required String etaText,
    required String destinationName,
  }) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await _navigationServiceChannel.invokeMethod('startOrUpdateNavigation', {
        'tripId': tripId,
        'stage': stage,
        'instruction': instruction,
        'roadName': roadName,
        'distanceNext': distanceNextText,
        'remainingDistance': remainingDistanceText,
        'eta': etaText,
        'destination': destinationName,
      });
    } catch (e) {
      debugPrint('[DeviceLocationService] Foreground service update error: $e');
    }
  }

  /// Stops the Android Foreground Location & Live Navigation Service immediately
  Future<void> stopForegroundNavigation() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await _navigationServiceChannel.invokeMethod('stopNavigation');
    } catch (e) {
      debugPrint('[DeviceLocationService] Foreground service stop error: $e');
    }
  }

  Future<bool> isForegroundNavigationRunning() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return false;
    try {
      return (await _navigationServiceChannel
              .invokeMethod<bool>('isServiceRunning')) ??
          false;
    } catch (_) {
      return false;
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
        debugPrint(
          'High accuracy position timed out or failed, checking last known: $e',
        );
        position = await Geolocator.getLastKnownPosition();
      }

      if (position == null ||
          !LocationModel.isValidCoordinate(
            position.latitude,
            position.longitude,
          )) {
        return null;
      }

      final locality =
          getUgandaLocalityName(position.latitude, position.longitude);

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

  Future<DeviceLocationData?> getCurrentLocation() => getCurrentPosition();

  /// Stream real-time GPS position updates with adaptive battery & accuracy profiles
  Stream<DeviceLocationData> getPositionStream({
    int distanceFilterMeters = 10,
    GpsTrackingProfile? profile,
  }) {
    LocationAccuracy accuracy = LocationAccuracy.high;
    int effectiveFilter = distanceFilterMeters;

    if (profile != null) {
      switch (profile) {
        case GpsTrackingProfile.customerForeground:
          accuracy = LocationAccuracy.high;
          effectiveFilter = 10;
          break;
        case GpsTrackingProfile.driverOnlineIdle:
          accuracy = LocationAccuracy.medium;
          effectiveFilter = 15;
          break;
        case GpsTrackingProfile.approachingPickup:
          accuracy = LocationAccuracy.high;
          effectiveFilter = 5;
          break;
        case GpsTrackingProfile.activeTripNavigation:
          accuracy = LocationAccuracy.bestForNavigation;
          effectiveFilter = 3;
          break;
      }
    }

    return Geolocator.getPositionStream(
      locationSettings: LocationSettings(
        accuracy: accuracy,
        distanceFilter: effectiveFilter,
      ),
    )
        .where((p) => LocationModel.isValidCoordinate(p.latitude, p.longitude))
        .map((position) {
      final locality =
          getUgandaLocalityName(position.latitude, position.longitude);
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
