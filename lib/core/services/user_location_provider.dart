import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/location_model.dart';
import 'device_location_service.dart';

class UserLocationState {
  final double? latitude;
  final double? longitude;
  final double? heading;
  final double? speed;
  final double? accuracy;
  final String locality;
  final DeviceLocationPermissionStatus permissionStatus;
  final bool isLoading;
  final String? errorMessage;
  final DateTime? lastUpdated;

  const UserLocationState({
    this.latitude,
    this.longitude,
    this.heading,
    this.speed,
    this.accuracy,
    this.locality = 'Detecting Location...',
    this.permissionStatus = DeviceLocationPermissionStatus.denied,
    this.isLoading = false,
    this.errorMessage,
    this.lastUpdated,
  });

  bool get isGranted =>
      permissionStatus == DeviceLocationPermissionStatus.granted ||
      permissionStatus == DeviceLocationPermissionStatus.grantedAlways;

  bool get hasCoordinates =>
      latitude != null &&
      longitude != null &&
      LocationModel.isValidCoordinate(latitude, longitude);

  bool get hasVerifiedFix => hasCoordinates;

  bool get isReady => isGranted && hasCoordinates;

  LocationModel? toLocationModel() {
    if (!hasCoordinates) return null;
    return LocationModel(
      id: 'user_live_gps',
      title: 'My Current Location',
      address: locality.isNotEmpty
          ? locality
          : 'GPS (${latitude!.toStringAsFixed(5)}, ${longitude!.toStringAsFixed(5)})',
      city: locality.split(',').first,
      latitude: latitude!,
      longitude: longitude!,
      category: 'gps',
      source: 'device_gps',
      isVerified: true,
    );
  }

  UserLocationState copyWith({
    double? latitude,
    double? longitude,
    double? heading,
    double? speed,
    double? accuracy,
    String? locality,
    DeviceLocationPermissionStatus? permissionStatus,
    bool? isLoading,
    String? errorMessage,
    DateTime? lastUpdated,
  }) {
    return UserLocationState(
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      heading: heading ?? this.heading,
      speed: speed ?? this.speed,
      accuracy: accuracy ?? this.accuracy,
      locality: locality ?? this.locality,
      permissionStatus: permissionStatus ?? this.permissionStatus,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
      lastUpdated: lastUpdated ?? this.lastUpdated,
    );
  }
}

class UserLocationNotifier extends Notifier<UserLocationState> {
  late final DeviceLocationService _service;
  StreamSubscription<DeviceLocationData>? _positionSubscription;

  @override
  UserLocationState build() {
    _service = DeviceLocationService();
    ref.onDispose(() {
      _positionSubscription?.cancel();
    });
    return const UserLocationState();
  }

  /// Requests location permissions and obtains a high-precision hardware GPS fix.
  /// Never fabricates Kampala coordinates when GPS is denied or unavailable.
  Future<bool> requestLocationAggressively() async {
    state = state.copyWith(isLoading: true, errorMessage: null);

    try {
      final status = await _service.requestLocationPermission();

      if (status != DeviceLocationPermissionStatus.granted &&
          status != DeviceLocationPermissionStatus.grantedAlways) {
        state = state.copyWith(
          isLoading: false,
          permissionStatus: status,
          errorMessage: status == DeviceLocationPermissionStatus.serviceDisabled
              ? 'Device GPS is disabled. Please turn on Location in quick settings.'
              : (status == DeviceLocationPermissionStatus.deniedForever
                  ? 'Location permission is permanently denied. Please enable in App Settings.'
                  : 'Location permission was denied. Location is required to find rides.'),
        );
        return false;
      }

      final locData = await _service.getCurrentPosition();

      if (locData != null) {
        state = state.copyWith(
          latitude: locData.latitude,
          longitude: locData.longitude,
          heading: locData.heading,
          speed: locData.speed,
          accuracy: locData.accuracy,
          locality: locData.locality,
          permissionStatus: status,
          isLoading: false,
          lastUpdated: locData.timestamp,
        );

        _startListening();
        return true;
      } else {
        state = state.copyWith(
          isLoading: false,
          permissionStatus: status,
          errorMessage: 'Acquiring GPS satellite fix...',
        );
        return false;
      }
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Failed to acquire location: $e',
      );
      return false;
    }
  }

  /// Refreshes current GPS position
  Future<void> refreshLocation() async {
    state = state.copyWith(isLoading: true);
    final locData = await _service.getCurrentPosition();
    if (locData != null) {
      state = state.copyWith(
        latitude: locData.latitude,
        longitude: locData.longitude,
        heading: locData.heading,
        speed: locData.speed,
        accuracy: locData.accuracy,
        locality: locData.locality,
        permissionStatus: DeviceLocationPermissionStatus.granted,
        isLoading: false,
        lastUpdated: locData.timestamp,
      );
    } else {
      state = state.copyWith(isLoading: false);
    }
  }

  void _startListening() {
    _positionSubscription?.cancel();
    try {
      _positionSubscription = _service
          .getPositionStream(profile: GpsTrackingProfile.customerForeground)
          .listen(
        (locData) {
          state = state.copyWith(
            latitude: locData.latitude,
            longitude: locData.longitude,
            heading: locData.heading,
            speed: locData.speed,
            accuracy: locData.accuracy,
            locality: locData.locality,
            permissionStatus: DeviceLocationPermissionStatus.granted,
            lastUpdated: locData.timestamp,
          );
        },
        onError: (_) {},
      );
    } catch (_) {}
  }

  Future<void> openAppSettings() async {
    await _service.openAppSettings();
  }

  Future<void> openLocationSettings() async {
    await _service.openLocationSettings();
  }
}

final userLocationProvider =
    NotifierProvider<UserLocationNotifier, UserLocationState>(
  UserLocationNotifier.new,
);
