import 'package:flutter/foundation.dart';
import '../utils/geo_utils.dart';
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
  final ManeuverType type;
  final String instruction;
  final double distanceMeters;
  final double targetLat;
  final double targetLng;
  final int estimatedSeconds;
  final String roadName;

  NavigationManeuver({
    required this.type,
    required this.instruction,
    required this.distanceMeters,
    this.targetLat = 0.0,
    this.targetLng = 0.0,
    this.estimatedSeconds = 60,
    this.roadName = '',
  });
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

  SafariTourLeg({
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

/// Production Navigation Engine for Turn-by-turn and Multi-Day Safari Expeditions
class NavigationService extends ChangeNotifier {
  static final NavigationService _instance = NavigationService._internal();
  factory NavigationService() => _instance;
  NavigationService._internal();

  bool _isNavigating = false;
  List<SafariTourLeg> _legs = [];
  int _currentLegIndex = 0;

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
  List<SafariTourLeg> get legs => List.unmodifiable(_legs);
  int get currentLegIndex => _currentLegIndex;
  SafariTourLeg? get activeLeg => _legs.isNotEmpty && _currentLegIndex < _legs.length ? _legs[_currentLegIndex] : null;

  double get driverLat => _driverLat;
  double get driverLng => _driverLng;
  double get driverSpeed => _driverSpeed;
  double get driverHeading => _driverHeading;

  NavigationManeuver? get currentManeuver => _currentManeuver;
  double get remainingDistanceKm => _remainingDistanceKm;
  int get remainingDurationMins => _remainingDurationMins;
  bool get isDeviated => _isDeviated;
  double get deviationDistanceMeters => _deviationDistanceMeters;

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
    _remainingDistanceKm = leg.distanceKm;
    _remainingDurationMins = (leg.estimatedHours * 60).round();

    _generateInitialManeuver(leg);
    _fetchMapboxRouteForLeg(leg);
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

    if (!_isNavigating || activeLeg == null) {
      notifyListeners();
      return;
    }

    final leg = activeLeg!;

    // 1. Calculate remaining distance to destination
    final distToDest = GeoUtils.haversineDistance(
      lat,
      lng,
      leg.destLat,
      leg.destLng,
    );
    _remainingDistanceKm = distToDest;
    _remainingDurationMins = speed > 5 ? ((distToDest / speed) * 60).round() : ((distToDest / 45.0) * 60).round();

    // 2. Check route deviation against active leg waypoints
    _evaluateRouteDeviation(lat, lng, leg);

    // 3. Update current turn-by-turn maneuver
    _updateManeuverProgress(lat, lng, leg);

    // 4. Record to Offline Location Queue
    OfflineLocationQueue().enqueue(
      LocationTelemetryPoint(
        tripId: tripId,
        safariLegId: leg.id,
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
        speed: speed,
        heading: heading,
        batteryLevel: batteryLevel,
        isOfflineQueued: OfflineLocationQueue().connectionState != TelemetryConnectionState.online,
      ),
    );

    // 5. Check if arrived at leg destination (< 100 meters)
    if (distToDest < 0.1) {
      _currentManeuver = NavigationManeuver(
        type: ManeuverType.arrive,
        instruction: 'Arrived at ${leg.destTitle}',
        distanceMeters: 0,
        targetLat: leg.destLat,
        targetLng: leg.destLng,
      );
    }

    notifyListeners();
  }

  /// Progress to the next safari leg (e.g. Day 1 -> Day 2)
  void advanceToNextLeg() {
    if (_currentLegIndex + 1 < _legs.length) {
      _legs[_currentLegIndex] = _legs[_currentLegIndex].copyWith(status: 'completed');
      _currentLegIndex++;
      _legs[_currentLegIndex] = _legs[_currentLegIndex].copyWith(status: 'active');

      final nextLeg = _legs[_currentLegIndex];
      _remainingDistanceKm = nextLeg.distanceKm;
      _remainingDurationMins = (nextLeg.estimatedHours * 60).round();
      _isDeviated = false;
      _consecutiveDeviations = 0;
      _generateInitialManeuver(nextLeg);
      notifyListeners();
    } else {
      // Completed all legs
      stopNavigation();
    }
  }

  void stopNavigation() {
    _isNavigating = false;
    _currentManeuver = null;
    _isDeviated = false;
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
    if (_remainingDistanceKm < 0.1) {
      return;
    }

    // Dynamic maneuver based on proximity to destination
    if (_remainingDistanceKm < 1.0) {
      _currentManeuver = NavigationManeuver(
        type: ManeuverType.straight,
        instruction: 'In ${(_remainingDistanceKm * 1000).round()} m, destination is on the right',
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
    // Generate route interpolation if not pre-populated
    final route = leg.routeCoordinates.isNotEmpty
        ? leg.routeCoordinates
        : GeoUtils.getInterpolatedGeoRoute(
            startLat: leg.originLat,
            startLng: leg.originLng,
            destLat: leg.destLat,
            destLng: leg.destLng,
            segments: 25,
          );

    // Find minimum distance to any route corridor point
    double minDistanceKm = 999999.0;
    for (final pt in route) {
      final d = GeoUtils.haversineDistance(lat, lng, pt[0], pt[1]);
      if (d < minDistanceKm) {
        minDistanceKm = d;
      }
    }

    final minDistanceMeters = minDistanceKm * 1000.0;
    _deviationDistanceMeters = minDistanceMeters;

    // Threshold: 200 meters off-corridor
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

  /// Asynchronously fetch real Mapbox road routes & turn-by-turn maneuvers
  Future<void> _fetchMapboxRouteForLeg(SafariTourLeg leg) async {
    try {
      final result = await MapboxService().getDirections(
        originLat: leg.originLat,
        originLng: leg.originLng,
        destLat: leg.destLat,
        destLng: leg.destLng,
      );
      if (result.coordinates.isNotEmpty && _isNavigating && activeLeg?.id == leg.id) {
        final coords = result.coordinates.map((c) => [c.latitude, c.longitude]).toList();
        final updatedLeg = leg.copyWith(
          distanceKm: result.distanceMeters / 1000.0,
          routeCoordinates: coords,
        );
        _legs[_currentLegIndex] = updatedLeg;
        _remainingDistanceKm = result.distanceMeters / 1000.0;
        _remainingDurationMins = (result.durationSeconds / 60).round();
        if (result.maneuvers.isNotEmpty) {
          _currentManeuver = result.maneuvers.first;
        }
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[NavigationService] Mapbox directions error: $e');
    }
  }
}
