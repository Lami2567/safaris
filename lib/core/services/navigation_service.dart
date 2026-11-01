import 'package:flutter/foundation.dart';
import '../utils/geo_utils.dart';
import 'device_location_service.dart';
import 'mapbox_service.dart';
import 'offline_location_queue.dart';

enum ManeuverType {
  straight,
  turnLeft,
  turnRight,
  slightLeft,
  slightRight,
  sharpTurn,
  roundabout,
  uTurn,
  arrive,
}

class NavigationManeuver {
  final int index;
  final ManeuverType type;
  final String instruction;
  final double distanceMeters;
  final double targetLat;
  final double targetLng;
  final int estimatedSeconds;
  final String roadName;

  const NavigationManeuver({
    this.index = 0,
    this.type = ManeuverType.straight,
    String? maneuverType,
    required this.instruction,
    double? distanceMeters,
    double? distanceKm,
    this.targetLat = 0.0,
    this.targetLng = 0.0,
    double? latitude,
    double? longitude,
    this.estimatedSeconds = 60,
    int? durationMins,
    this.roadName = '',
  }) : distanceMeters = distanceMeters ?? ((distanceKm ?? 0.0) * 1000.0);

  double get distanceKm => distanceMeters / 1000.0;
  int get durationMins => (estimatedSeconds / 60.0).ceil();
  double get latitude => targetLat;
  double get longitude => targetLng;

  String get maneuverType {
    switch (type) {
      case ManeuverType.turnLeft:
        return 'turn_left';
      case ManeuverType.turnRight:
        return 'turn_right';
      case ManeuverType.slightLeft:
        return 'slight_left';
      case ManeuverType.slightRight:
        return 'slight_right';
      case ManeuverType.sharpTurn:
        return 'sharp_turn';
      case ManeuverType.roundabout:
        return 'roundabout';
      case ManeuverType.uTurn:
        return 'uturn';
      case ManeuverType.arrive:
        return 'arrive';
      case ManeuverType.straight:
        return 'straight';
    }
  }

  String get formattedStepDistance {
    if (distanceMeters >= 1000) {
      return '${(distanceMeters / 1000.0).toStringAsFixed(1)} km';
    }
    return '${distanceMeters.round()} m';
  }
}

class SafariTourLeg {
  final String id;
  final int dayNumber;
  final String originTitle;
  final double originLat;
  final double originLng;
  final String destTitle;
  final double destLat;
  final double destLng;
  final double distanceKm;
  final double estimatedHours;
  final String status; // 'pending', 'active', 'completed'
  final List<List<double>> routeCoordinates; // [[lat, lng], ...]

  const SafariTourLeg({
    required this.id,
    required this.dayNumber,
    required this.originTitle,
    required this.originLat,
    required this.originLng,
    required this.destTitle,
    required this.destLat,
    required this.destLng,
    required this.distanceKm,
    required this.estimatedHours,
    this.status = 'pending',
    this.routeCoordinates = const [],
  });

  SafariTourLeg copyWith({
    String? status,
    double? distanceKm,
    double? estimatedHours,
    List<List<double>>? routeCoordinates,
  }) {
    return SafariTourLeg(
      id: id,
      dayNumber: dayNumber,
      originTitle: originTitle,
      originLat: originLat,
      originLng: originLng,
      destTitle: destTitle,
      destLat: destLat,
      destLng: destLng,
      distanceKm: distanceKm ?? this.distanceKm,
      estimatedHours: estimatedHours ?? this.estimatedHours,
      status: status ?? this.status,
      routeCoordinates: routeCoordinates ?? this.routeCoordinates,
    );
  }
}

/// Production Navigation Engine for Turn-by-Turn Ride Navigation & Multi-Day Safari Expeditions
class NavigationService extends ChangeNotifier {
  static final NavigationService _instance = NavigationService._internal();
  factory NavigationService() => _instance;
  NavigationService._internal();

  bool _isNavigating = false;
  String? _activeTripId;
  String _activeStage = 'TRIP_IN_PROGRESS';
  String _destinationName = '';
  double _targetLat = 0.0;
  double _targetLng = 0.0;

  List<SafariTourLeg> _legs = [];
  List<NavigationManeuver> _maneuvers = [];
  int _currentLegIndex = 0;
  int _currentManeuverIndex = 0;

  double _driverLat = 0.3136;
  double _driverLng = 32.5811;
  double _driverSpeed = 0.0;
  double _driverHeading = 0.0;

  NavigationManeuver? _currentManeuver;
  double _remainingDistanceKm = 0.0;
  int _remainingDurationMins = 0;

  bool _isDeviated = false;
  double _deviationDistanceMeters = 0.0;
  int _consecutiveDeviations = 0;

  bool get isNavigating => _isNavigating;
  String? get activeTripId => _activeTripId;
  String get activeStage => _activeStage;
  String get destinationName => _destinationName;
  List<SafariTourLeg> get legs => List.unmodifiable(_legs);
  List<NavigationManeuver> get maneuvers => List.unmodifiable(_maneuvers);
  int get currentLegIndex => _currentLegIndex;
  SafariTourLeg? get activeLeg =>
      _legs.isNotEmpty && _currentLegIndex < _legs.length
          ? _legs[_currentLegIndex]
          : null;

  double get driverLat => _driverLat;
  double get driverLng => _driverLng;
  double get driverSpeed => _driverSpeed;
  double get driverHeading => _driverHeading;

  NavigationManeuver? get currentManeuver => _currentManeuver;
  double get remainingDistanceKm => _remainingDistanceKm;
  int get remainingDurationMins => _remainingDurationMins;
  int get etaMinutes => _remainingDurationMins;
  bool get isDeviated => _isDeviated;
  double get deviationDistanceMeters => _deviationDistanceMeters;

  /// Start live turn-by-turn ride navigation (Pickup or Destination stage)
  /// and launch/update the persistent Android Foreground Notification.
  Future<void> startRideNavigation({
    required String tripId,
    required String stage,
    required String destinationName,
    required double targetLat,
    required double targetLng,
    required double totalDistanceKm,
    required int estimatedDurationMins,
    List<NavigationManeuver> maneuvers = const [],
  }) async {
    _isNavigating = true;
    _activeTripId = tripId;
    _activeStage = stage;
    _destinationName = destinationName;
    _targetLat = targetLat;
    _targetLng = targetLng;
    _remainingDistanceKm = totalDistanceKm;
    _remainingDurationMins = estimatedDurationMins;
    _maneuvers = List.from(maneuvers);
    _currentManeuverIndex = 0;
    _isDeviated = false;

    if (_maneuvers.isNotEmpty) {
      _currentManeuver = _maneuvers.first;
    } else {
      _currentManeuver = NavigationManeuver(
        type: ManeuverType.straight,
        instruction: stage == 'DRIVER_EN_ROUTE_TO_PICKUP'
            ? 'Proceed along road route to customer pickup at $destinationName'
            : 'Proceed along road route to $destinationName',
        distanceMeters: totalDistanceKm * 1000.0,
        targetLat: targetLat,
        targetLng: targetLng,
        estimatedSeconds: estimatedDurationMins * 60,
        roadName: destinationName,
      );
    }

    await _syncForegroundNotification();
    notifyListeners();
  }

  /// Start navigation with a single leg or multi-day safari tour
  void startNavigation({
    required List<SafariTourLeg> legs,
    int initialLegIndex = 0,
  }) {
    if (legs.isEmpty) return;

    _legs = legs.asMap().entries.map((entry) {
      final idx = entry.key;
      final leg = entry.value;
      if (idx == initialLegIndex) {
        return leg.copyWith(status: 'active');
      } else if (idx < initialLegIndex) {
        return leg.copyWith(status: 'completed');
      } else {
        return leg.copyWith(status: 'pending');
      }
    }).toList();

    _currentLegIndex = initialLegIndex;
    _isNavigating = true;
    _isDeviated = false;
    _consecutiveDeviations = 0;

    final leg = _legs[_currentLegIndex];
    _destinationName = leg.destTitle;
    _targetLat = leg.destLat;
    _targetLng = leg.destLng;
    _remainingDistanceKm = leg.distanceKm;
    _remainingDurationMins = (leg.estimatedHours * 60).round();

    _generateInitialManeuver(leg);
    _fetchMapboxRouteForLeg(leg);
    _syncForegroundNotification();
    notifyListeners();
  }

  /// Update driver's GPS location and recompute navigation progress
  void updateLocation({
    required double lat,
    required double lng,
    double speed = 0.0,
    double heading = 0.0,
    double accuracy = 5.0,
    double? batteryLevel,
    String? tripId,
  }) {
    _driverLat = lat;
    _driverLng = lng;
    _driverSpeed = speed;
    _driverHeading = heading;
    if (tripId != null && tripId.isNotEmpty) {
      _activeTripId = tripId;
    }

    // Record to Offline Location Queue
    OfflineLocationQueue().enqueue(
      LocationTelemetryPoint(
        tripId: _activeTripId,
        safariLegId: activeLeg?.id,
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
        speed: speed,
        heading: heading,
        batteryLevel: batteryLevel,
        isOfflineQueued: OfflineLocationQueue().connectionState !=
            TelemetryConnectionState.online,
      ),
    );

    if (!_isNavigating) {
      notifyListeners();
      return;
    }

    final destLat = activeLeg?.destLat ?? _targetLat;
    final destLng = activeLeg?.destLng ?? _targetLng;
    final destTitle = activeLeg?.destTitle ?? _destinationName;

    if (destLat != 0.0 || destLng != 0.0) {
      final distToDest = GeoUtils.haversineDistance(lat, lng, destLat, destLng);
      _remainingDistanceKm = distToDest;
      _remainingDurationMins = speed > 5
          ? ((distToDest / speed) * 60).round().clamp(1, 720)
          : ((distToDest / 40.0) * 60).round().clamp(1, 720);

      if (activeLeg != null) {
        _evaluateRouteDeviation(lat, lng, activeLeg!);
        _updateManeuverProgress(lat, lng, activeLeg!);
      } else if (_maneuvers.isNotEmpty &&
          _currentManeuverIndex < _maneuvers.length) {
        final step = _maneuvers[_currentManeuverIndex];
        if (step.targetLat != 0.0 || step.targetLng != 0.0) {
          final dStepKm = GeoUtils.haversineDistance(
              lat, lng, step.targetLat, step.targetLng);
          if (dStepKm < 0.045 &&
              _currentManeuverIndex + 1 < _maneuvers.length) {
            _currentManeuverIndex++;
            _currentManeuver = _maneuvers[_currentManeuverIndex];
          }
        }
      }

      if (distToDest < 0.08) {
        _currentManeuver = NavigationManeuver(
          type: ManeuverType.arrive,
          instruction: 'Arrived at $destTitle',
          distanceMeters: 0,
          targetLat: destLat,
          targetLng: destLng,
        );
      }

      _syncForegroundNotification();
    }

    notifyListeners();
  }

  Future<void> _syncForegroundNotification() async {
    if (!_isNavigating) return;
    final m = _currentManeuver;
    await DeviceLocationService().startOrUpdateForegroundNavigation(
      tripId: _activeTripId ?? 'safari_nav',
      stage: _activeStage,
      instruction: m?.instruction ?? 'Proceed towards $_destinationName',
      roadName: (m?.roadName.isNotEmpty == true) ? m!.roadName : _destinationName,
      distanceNextText: m?.formattedStepDistance ??
          '${_remainingDistanceKm.toStringAsFixed(1)} km',
      remainingDistanceText: '${_remainingDistanceKm.toStringAsFixed(1)} km',
      etaText: '$_remainingDurationMins mins',
      destinationName: _destinationName,
    );
  }

  /// Progress to the next safari leg (e.g. Day 1 -> Day 2)
  void advanceToNextLeg() {
    if (_currentLegIndex + 1 < _legs.length) {
      _legs[_currentLegIndex] =
          _legs[_currentLegIndex].copyWith(status: 'completed');
      _currentLegIndex++;
      _legs[_currentLegIndex] =
          _legs[_currentLegIndex].copyWith(status: 'active');

      final nextLeg = _legs[_currentLegIndex];
      _destinationName = nextLeg.destTitle;
      _targetLat = nextLeg.destLat;
      _targetLng = nextLeg.destLng;
      _remainingDistanceKm = nextLeg.distanceKm;
      _remainingDurationMins = (nextLeg.estimatedHours * 60).round();
      _isDeviated = false;
      _consecutiveDeviations = 0;
      _generateInitialManeuver(nextLeg);
      _syncForegroundNotification();
      notifyListeners();
    } else {
      stopNavigation();
    }
  }

  void stopNavigation() {
    _isNavigating = false;
    _activeTripId = null;
    _currentManeuver = null;
    _maneuvers.clear();
    _isDeviated = false;
    DeviceLocationService().stopForegroundNavigation();
    notifyListeners();
  }

  void _generateInitialManeuver(SafariTourLeg leg) {
    _currentManeuver = NavigationManeuver(
      type: ManeuverType.straight,
      instruction: 'Head towards ${leg.destTitle}',
      distanceMeters: (leg.distanceKm * 1000).clamp(0, 5000),
      targetLat: leg.destLat,
      targetLng: leg.destLng,
    );
  }

  void _updateManeuverProgress(double lat, double lng, SafariTourLeg leg) {
    if (_remainingDistanceKm < 0.1) return;

    if (_remainingDistanceKm < 1.0) {
      _currentManeuver = NavigationManeuver(
        type: ManeuverType.straight,
        instruction:
            'In ${(_remainingDistanceKm * 1000).round()} m, destination is on the right',
        distanceMeters: _remainingDistanceKm * 1000,
        targetLat: leg.destLat,
        targetLng: leg.destLng,
      );
    } else if (_remainingDistanceKm < 5.0) {
      _currentManeuver = NavigationManeuver(
        type: ManeuverType.slightRight,
        instruction: 'Continue on main highway towards ${leg.destTitle}',
        distanceMeters: _remainingDistanceKm * 1000,
        targetLat: leg.destLat,
        targetLng: leg.destLng,
      );
    }
  }

  void _evaluateRouteDeviation(double lat, double lng, SafariTourLeg leg) {
    final referencePoints = leg.routeCoordinates.isNotEmpty
        ? leg.routeCoordinates
        : <List<double>>[
            [leg.originLat, leg.originLng],
            [
              (leg.originLat + leg.destLat) / 2.0,
              (leg.originLng + leg.destLng) / 2.0,
            ],
            [leg.destLat, leg.destLng],
          ];

    double minDistanceKm = 999999.0;
    for (final pt in referencePoints) {
      final d = GeoUtils.haversineDistance(lat, lng, pt[0], pt[1]);
      if (d < minDistanceKm) {
        minDistanceKm = d;
      }
    }

    final minDistanceMeters = minDistanceKm * 1000.0;
    _deviationDistanceMeters = minDistanceMeters;

    if (minDistanceMeters > 200.0) {
      _consecutiveDeviations++;
      if (_consecutiveDeviations >= 2) {
        _isDeviated = true;
      }
    } else {
      _consecutiveDeviations = 0;
      _isDeviated = false;
    }
  }

  /// Asynchronously fetch real Mapbox/OSRM road routes & turn-by-turn maneuvers
  Future<void> _fetchMapboxRouteForLeg(SafariTourLeg leg) async {
    try {
      final result = await MapboxService().getDirections(
        originLat: leg.originLat,
        originLng: leg.originLng,
        destLat: leg.destLat,
        destLng: leg.destLng,
      );
      if (result.coordinates.isNotEmpty &&
          _isNavigating &&
          activeLeg?.id == leg.id) {
        final coords =
            result.coordinates.map((c) => [c.latitude, c.longitude]).toList();
        final updatedLeg = leg.copyWith(
          distanceKm: result.distanceMeters / 1000.0,
          routeCoordinates: coords,
        );
        _legs[_currentLegIndex] = updatedLeg;
        _remainingDistanceKm = result.distanceMeters / 1000.0;
        _remainingDurationMins = (result.durationSeconds / 60).round();
        if (result.maneuvers.isNotEmpty) {
          _maneuvers = result.maneuvers;
          _currentManeuver = result.maneuvers.first;
        }
        _syncForegroundNotification();
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[NavigationService] Mapbox directions error: $e');
    }
  }
}
