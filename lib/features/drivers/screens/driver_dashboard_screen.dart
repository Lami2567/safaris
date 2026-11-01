import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/socket_service.dart';
import '../../../core/services/device_location_service.dart';
import '../../../core/services/navigation_service.dart';
import '../../../core/services/offline_location_queue.dart';
import '../../../core/services/user_location_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/components/safaris_map_view.dart';
import '../../../shared/components/role_drawer.dart';
import '../../../shared/models/location_model.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../authentication/session_provider.dart';

class DriverDashboardScreen extends ConsumerStatefulWidget {
  const DriverDashboardScreen({super.key});

  @override
  ConsumerState<DriverDashboardScreen> createState() => _DriverDashboardScreenState();
}

class _DriverDashboardScreenState extends ConsumerState<DriverDashboardScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final ApiClient _api = ApiClient();

  bool _isOnline = false;
  bool _isAvailable = false;
  bool _isUpdatingStatus = false;
  bool _isProcessingTripAction = false;
  double _todayEarningsUGX = 0;
  int _completedTripsToday = 0;
  double _rating = 5.0;
  String _approvalStatus = 'APPROVED';

  // Real-time Hardware GPS Telemetry
  double _currentLat = 0.3136;
  double _currentLng = 32.5811;
  double _currentHeading = 0.0;
  double _currentSpeedKmh = 0.0;
  bool _hasHardwareGpsFix = false;
  StreamSubscription<DeviceLocationData>? _gpsSubscription;
  Timer? _heartbeatTimer;

  // Real Backend Incoming Requests & Active Trip
  List<Map<String, dynamic>> _incomingRequests = [];
  Map<String, dynamic>? _activeTrip;

  @override
  void initState() {
    super.initState();
    OfflineLocationQueue().initialize();
    OfflineLocationQueue().addListener(_rebuildOnServiceUpdate);
    NavigationService().addListener(_rebuildOnServiceUpdate);
    _initializeDriverWorkspace();
  }

  void _rebuildOnServiceUpdate() {
    if (mounted) setState(() {});
  }

  Future<void> _initializeDriverWorkspace() async {
    // 1. Immediately seed from userLocationProvider if SplashScreen already acquired hardware GPS
    final cachedLoc = ref.read(userLocationProvider);
    if (cachedLoc.hasCoordinates && cachedLoc.latitude != null && cachedLoc.longitude != null) {
      setState(() {
        _currentLat = cachedLoc.latitude!;
        _currentLng = cachedLoc.longitude!;
        _currentHeading = cachedLoc.heading ?? _currentHeading;
        _currentSpeedKmh = (cachedLoc.speed ?? 0.0) * 3.6;
        _hasHardwareGpsFix = true;
      });
    }

    // 2. Run hardware GPS stream + WebSocket setup in parallel with backend dashboard fetch
    await Future.wait([
      _initHardwareGpsAndSocket(),
      _loadDashboardFromBackend(),
    ]);
  }

  bool _isDefaultKampalaCoord(double lat, double lng) {
    return (lat - 0.3136).abs() < 0.0005 && (lng - 32.5811).abs() < 0.0005;
  }

  Future<void> _loadDashboardFromBackend() async {
    try {
      final res = await _api.get('/drivers/dashboard');
      if (res.success && res.data is Map && mounted) {
        final data = Map<String, dynamic>.from(res.data as Map);
        final incoming = (data['incomingRequests'] as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            [];
        final active = data['activeTrip'] is Map
            ? Map<String, dynamic>.from(data['activeTrip'] as Map)
            : null;

        setState(() {
          _isOnline = data['isOnline'] == true;
          _isAvailable = data['isAvailable'] == true;
          _todayEarningsUGX = (data['todayEarningsUGX'] as num?)?.toDouble() ?? 0.0;
          _completedTripsToday = (data['completedTripsToday'] as num?)?.toInt() ?? 0;
          _rating = (data['rating'] as num?)?.toDouble() ?? 5.0;
          _approvalStatus = (data['approvalStatus'] ?? 'APPROVED').toString();
          if (!_hasHardwareGpsFix && data['currentLat'] != null && data['currentLng'] != null) {
            final backendLat = (data['currentLat'] as num).toDouble();
            final backendLng = (data['currentLng'] as num).toDouble();
            if (!_isDefaultKampalaCoord(backendLat, backendLng)) {
              _currentLat = backendLat;
              _currentLng = backendLng;
            }
          }
          _incomingRequests = incoming;
          _activeTrip = active;
        });

        // If we already have a real hardware GPS fix, sync it to backend immediately
        if (_hasHardwareGpsFix) {
          _transmitLocationToBackend(_currentLat, _currentLng, _currentHeading, _currentSpeedKmh);
        }
      }
    } catch (_) {}
  }

  Future<void> _initHardwareGpsAndSocket() async {
    final user = ref.read(currentUserProvider);
    final socket = RealtimeSocketService();
    if (user.id.isNotEmpty) {
      socket.connect(userId: user.id, role: 'driver');
    }

    socket.on('trip:incoming_request', (data) {
      if (!mounted || !_isOnline) return;
      if (data is Map) {
        final req = Map<String, dynamic>.from(data);
        final id = (req['tripId'] ?? req['id'] ?? '').toString();
        if (id.isNotEmpty) {
          setState(() {
            _incomingRequests.removeWhere((r) => (r['tripId'] ?? r['id']).toString() == id);
            _incomingRequests.insert(0, req);
          });
        }
      }
    });

    socket.on('trip:request_closed', (data) {
      if (!mounted || data is! Map) return;
      final closedId = (data['tripId'] ?? '').toString();
      if (closedId.isNotEmpty) {
        setState(() {
          _incomingRequests.removeWhere((r) => (r['tripId'] ?? r['id']).toString() == closedId);
        });
      }
    });

    socket.on('trip:driver_assigned', (_) => _loadDashboardFromBackend());
    socket.on('trip:status_changed', (_) => _loadDashboardFromBackend());
    socket.on('account:approval_updated', (_) => _loadDashboardFromBackend());

    // Acquire real hardware GPS permission and stream position
    final perm = await DeviceLocationService().requestLocationPermission();
    if (perm == DeviceLocationPermissionStatus.granted) {
      final initialPos = await DeviceLocationService().getCurrentPosition();
      if (initialPos != null && mounted) {
        setState(() {
          _currentLat = initialPos.latitude;
          _currentLng = initialPos.longitude;
          _currentHeading = initialPos.heading ?? _currentHeading;
          _currentSpeedKmh = (initialPos.speed ?? 0.0) * 3.6;
          _hasHardwareGpsFix = true;
        });
        // Always push initial real hardware GPS coordinates to backend so Admin Live Map has accurate location
        await _transmitLocationToBackend(_currentLat, _currentLng, _currentHeading, _currentSpeedKmh);
      }

      _gpsSubscription?.cancel();
      _gpsSubscription = DeviceLocationService().getPositionStream(distanceFilterMeters: 5).listen((pos) {
        if (!mounted) return;
        setState(() {
          _currentLat = pos.latitude;
          _currentLng = pos.longitude;
          _currentHeading = pos.heading ?? _currentHeading;
          _currentSpeedKmh = (pos.speed ?? 0.0) * 3.6;
          _hasHardwareGpsFix = true;
        });
        _transmitLocationToBackend(_currentLat, _currentLng, _currentHeading, _currentSpeedKmh);
      });
    }

    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (mounted && (_isOnline || _hasHardwareGpsFix)) {
        _transmitLocationToBackend(_currentLat, _currentLng, _currentHeading, _currentSpeedKmh);
      }
    });
  }

  Future<void> _transmitLocationToBackend(double lat, double lng, double heading, double speedKmh) async {
    final user = ref.read(currentUserProvider);
    NavigationService().updateLocation(
      lat: lat,
      lng: lng,
      speed: speedKmh,
      heading: heading,
      batteryLevel: 90.0,
      tripId: _activeTrip?['id']?.toString(),
    );

    if (user.id.isNotEmpty) {
      RealtimeSocketService().sendLocationUpdate(
        driverId: user.id,
        lat: lat,
        lng: lng,
        heading: heading,
        speed: speedKmh,
        tripId: _activeTrip?['id']?.toString(),
      );
    }

    try {
      await _api.put('/drivers/location', body: {
        'lat': lat,
        'lng': lng,
        'heading': heading,
        'speed': speedKmh,
      });
    } catch (_) {}
  }

  Future<void> _toggleAvailability() async {
    if (_isUpdatingStatus) return;
    setState(() => _isUpdatingStatus = true);
    final nextOnline = !_isOnline;
    try {
      final res = await _api.put('/drivers/status', body: {
        'isOnline': nextOnline,
        'lat': _currentLat,
        'lng': _currentLng,
        'heading': _currentHeading,
        'speed': _currentSpeedKmh,
      });
      if (res.success && mounted) {
        setState(() {
          _isOnline = nextOnline;
          _isAvailable = nextOnline && _activeTrip == null;
          if (!nextOnline) {
            _incomingRequests.clear();
          }
        });
        await _transmitLocationToBackend(_currentLat, _currentLng, _currentHeading, _currentSpeedKmh);
        if (nextOnline) {
          await _loadDashboardFromBackend();
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res.message ?? 'Cannot change availability. Verify account approval.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isUpdatingStatus = false);
      }
    }
  }

  Future<void> _acceptIncomingRequest(Map<String, dynamic> req) async {
    final tripId = (req['tripId'] ?? req['id'] ?? '').toString();
    if (tripId.isEmpty || _isProcessingTripAction) return;
    setState(() => _isProcessingTripAction = true);
    try {
      final res = await _api.post('/trips/$tripId/accept');
      if (res.success && mounted) {
        await _loadDashboardFromBackend();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Ride request accepted! Proceeding to customer pickup.'),
            backgroundColor: AppColors.success,
          ),
        );
      } else if (mounted) {
        setState(() {
          _incomingRequests.removeWhere((r) => (r['tripId'] ?? r['id']).toString() == tripId);
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res.message ?? 'Ride request is no longer available.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessingTripAction = false);
    }
  }

  Future<void> _rejectIncomingRequest(Map<String, dynamic> req) async {
    final tripId = (req['tripId'] ?? req['id'] ?? '').toString();
    if (tripId.isEmpty) return;
    setState(() {
      _incomingRequests.removeWhere((r) => (r['tripId'] ?? r['id']).toString() == tripId);
    });
    try {
      await _api.post('/trips/$tripId/reject', body: {'reason': 'Declined by driver'});
    } catch (_) {}
  }

  Future<void> _updateActiveTripStatus(String nextStatus) async {
    final tripId = (_activeTrip?['id'] ?? '').toString();
    if (tripId.isEmpty || _isProcessingTripAction) return;
    setState(() => _isProcessingTripAction = true);
    try {
      final res = await _api.put('/trips/$tripId/status', body: {'status': nextStatus});
      if (res.success && mounted) {
        if (nextStatus == 'TRIP_COMPLETED' || nextStatus == 'CANCELLED') {
          NavigationService().stopNavigation();
        }
        await _loadDashboardFromBackend();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res.message ?? 'Failed to update trip status.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessingTripAction = false);
    }
  }

  @override
  void dispose() {
    OfflineLocationQueue().removeListener(_rebuildOnServiceUpdate);
    NavigationService().removeListener(_rebuildOnServiceUpdate);
    _gpsSubscription?.cancel();
    _heartbeatTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final topIncoming = _incomingRequests.isNotEmpty ? _incomingRequests.first : null;
    final pickupLoc = _activeTrip != null
        ? LocationModel(
            id: 'active_pickup',
            title: (_activeTrip!['pickupAddress'] ?? 'Pickup').toString(),
            address: (_activeTrip!['pickupAddress'] ?? '').toString(),
            latitude: (_activeTrip!['pickupLat'] as num?)?.toDouble() ?? _currentLat,
            longitude: (_activeTrip!['pickupLng'] as num?)?.toDouble() ?? _currentLng,
          )
        : topIncoming != null
            ? LocationModel(
                id: 'req_pickup',
                title: (topIncoming['pickupAddress'] ?? 'Pickup').toString(),
                address: (topIncoming['pickupAddress'] ?? '').toString(),
                latitude: (topIncoming['pickupLat'] as num?)?.toDouble() ?? _currentLat,
                longitude: (topIncoming['pickupLng'] as num?)?.toDouble() ?? _currentLng,
              )
            : null;

    final destLoc = _activeTrip != null
        ? LocationModel(
            id: 'active_dest',
            title: (_activeTrip!['dropoffAddress'] ?? 'Destination').toString(),
            address: (_activeTrip!['dropoffAddress'] ?? '').toString(),
            latitude: (_activeTrip!['dropoffLat'] as num?)?.toDouble() ?? _currentLat,
            longitude: (_activeTrip!['dropoffLng'] as num?)?.toDouble() ?? _currentLng,
          )
        : topIncoming != null
            ? LocationModel(
                id: 'req_dest',
                title: (topIncoming['dropoffAddress'] ?? 'Destination').toString(),
                address: (topIncoming['dropoffAddress'] ?? '').toString(),
                latitude: (topIncoming['dropoffLat'] as num?)?.toDouble() ?? _currentLat,
                longitude: (topIncoming['dropoffLng'] as num?)?.toDouble() ?? _currentLng,
              )
            : null;

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.background,
      drawer: const SafarisDrawer(),
      body: Stack(
        children: [
          // Background Interactive Map
          SafarisMapView(
            showNearbyDrivers: false,
            showDriver: true,
            driverLat: _currentLat,
            driverLng: _currentLng,
            driverHeading: _currentHeading,
            userLat: _currentLat,
            userLng: _currentLng,
            showUserLocation: false,
            pickupLocation: pickupLoc,
            destinationLocation: destLoc,
            etaText: _activeTrip != null
                ? 'Active Trip: ${_activeTrip!['status']}'
                : (_isOnline ? 'Online & Available' : 'Offline'),
            distanceText: _activeTrip != null
                ? '${_activeTrip!['distanceKm'] ?? ''} km'
                : DeviceLocationService.getUgandaLocalityName(_currentLat, _currentLng),
            isNavigating: _activeTrip != null,
            activeManeuver: NavigationService().currentManeuver,
            safariLegs: NavigationService().legs,
            activeLegIndex: NavigationService().currentLegIndex,
            isRouteDeviated: NavigationService().isDeviated,
            connectionState: OfflineLocationQueue().connectionState,
            queuedUpdatesCount: OfflineLocationQueue().queuedCount,
            bottomPadding: 220,
          ),

          // Top Header Floating Panel
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      IconButton(
                        icon: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceElevated,
                            borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                            border: Border.all(color: AppColors.border, width: 0.8),
                          ),
                          child: Icon(Icons.menu_rounded, size: 20, color: AppColors.iconPrimary),
                        ),
                        onPressed: () => _scaffoldKey.currentState?.openDrawer(),
                      ),
                      // Online / Offline Pill
                      GestureDetector(
                        onTap: _toggleAvailability,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          decoration: BoxDecoration(
                            color: _isOnline
                                ? (_activeTrip != null ? const Color(0xFF2563EB) : AppColors.success)
                                : AppColors.surfaceElevated,
                            borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                            border: Border.all(
                              color: _isOnline
                                  ? (_activeTrip != null ? const Color(0xFF2563EB) : AppColors.success)
                                  : AppColors.borderLight,
                              width: 1.2,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: (_isOnline ? AppColors.success : Colors.black).withOpacity(0.3),
                                blurRadius: 10,
                              ),
                            ],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 10,
                                height: 10,
                                decoration: BoxDecoration(
                                  color: _isOnline ? Colors.white : AppColors.error,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                _isUpdatingStatus
                                    ? 'UPDATING...'
                                    : _isOnline
                                        ? (_activeTrip != null ? 'ON ACTIVE TRIP' : 'ONLINE & AVAILABLE')
                                        : 'OFFLINE',
                                style: AppTypography.labelLarge.copyWith(
                                  color: _isOnline ? Colors.white : AppColors.textPrimary,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.8,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      IconButton(
                        icon: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceElevated,
                            borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                            border: Border.all(color: AppColors.border, width: 0.8),
                          ),
                          child: const Icon(Icons.monetization_on_outlined, size: 20, color: AppColors.accent),
                        ),
                        onPressed: () => context.push('/driver/earnings'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // Bottom Operational Sheet (Stats + Active Trip Controls)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusXl)),
                border: Border(top: BorderSide(color: AppColors.border, width: 1)),
              ),
              padding: const EdgeInsets.all(AppSpacing.md),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 36,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.surfaceHigher,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),

                    // Real Backend Stats Row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _DriverStat(
                          title: 'TODAY EARNINGS',
                          value: CurrencyFormatter.formatUGX(_todayEarningsUGX),
                          highlight: true,
                        ),
                        Container(width: 1, height: 32, color: AppColors.border),
                        _DriverStat(
                          title: 'TRIPS TODAY',
                          value: '$_completedTripsToday',
                        ),
                        Container(width: 1, height: 32, color: AppColors.border),
                        _DriverStat(
                          title: 'RATING',
                          value: '${_rating.toStringAsFixed(2)} ★',
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Divider(color: AppColors.divider),
                    const SizedBox(height: AppSpacing.sm),

                    // Active Trip Lifecycle Controls
                    if (_activeTrip != null) ...[
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          '${_activeTrip!['pickupAddress']} → ${_activeTrip!['dropoffAddress']}',
                          style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Status: ${_activeTrip!['status']} • Fare: ${CurrencyFormatter.formatUGX(((_activeTrip!['estimatedPriceUGX'] ?? _activeTrip!['finalPriceUGX'] ?? 0) as num).toDouble())}',
                          style: AppTypography.bodySmall,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Row(
                        children: [
                          if (_activeTrip!['status'] == 'DRIVER_ASSIGNED')
                            Expanded(
                              child: SafarisButton(
                                text: 'Arriving at Pickup',
                                isLoading: _isProcessingTripAction,
                                onPressed: () => _updateActiveTripStatus('DRIVER_ARRIVING'),
                              ),
                            )
                          else if (_activeTrip!['status'] == 'DRIVER_ARRIVING')
                            Expanded(
                              child: SafarisButton(
                                text: 'Mark Arrived',
                                isLoading: _isProcessingTripAction,
                                onPressed: () => _updateActiveTripStatus('DRIVER_ARRIVED'),
                              ),
                            )
                          else if (_activeTrip!['status'] == 'DRIVER_ARRIVED')
                            Expanded(
                              child: SafarisButton(
                                text: 'Start Trip',
                                isLoading: _isProcessingTripAction,
                                onPressed: () => _updateActiveTripStatus('TRIP_STARTED'),
                              ),
                            )
                          else if (_activeTrip!['status'] == 'TRIP_STARTED')
                            Expanded(
                              child: SafarisButton(
                                text: 'Complete Trip',
                                isLoading: _isProcessingTripAction,
                                onPressed: () => _updateActiveTripStatus('TRIP_COMPLETED'),
                              ),
                            ),
                          const SizedBox(width: 8),
                          SafarisButton(
                            text: 'Cancel',
                            variant: SafarisButtonVariant.outline,
                            isFullWidth: false,
                            onPressed: () => _updateActiveTripStatus('CANCELLED'),
                          ),
                        ],
                      ),
                    ] else if (!_isOnline) ...[
                      Text(
                        _approvalStatus == 'APPROVED'
                            ? 'Tap the status pill above to go online and receive real customer ride requests.'
                            : 'Your driver account status is $_approvalStatus. You can go online once approved by admin.',
                        style: AppTypography.bodySmall,
                        textAlign: TextAlign.center,
                      ),
                    ] else ...[
                      Text(
                        'Online & Available (${_currentLat.toStringAsFixed(4)}, ${_currentLng.toStringAsFixed(4)}). Waiting for customer ride requests...',
                        style: AppTypography.bodySmall,
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),

          // Real Incoming Ride Request Overlay Modal
          if (topIncoming != null && _activeTrip == null)
            Positioned(
              left: 16,
              right: 16,
              bottom: 24,
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.lg),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusXl),
                  border: Border.all(color: AppColors.accent, width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.accent.withOpacity(0.35),
                      blurRadius: 25,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const SafarisBadge(
                          text: 'INCOMING RIDE REQUEST',
                          variant: SafarisBadgeVariant.accent,
                        ),
                        Text(
                          CurrencyFormatter.formatUGX(
                            ((topIncoming['estimatedPriceUGX'] ?? topIncoming['fare_ugx'] ?? 0) as num).toDouble(),
                          ),
                          style: AppTypography.titleLarge.copyWith(
                            color: AppColors.accent,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),

                    // Passenger Info
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 20,
                          backgroundColor: AppColors.surfaceHigher,
                          child: Icon(Icons.person, color: AppColors.textPrimary),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                (topIncoming['customerName'] ?? 'Customer').toString(),
                                style: AppTypography.titleSmall.copyWith(fontSize: 15, fontWeight: FontWeight.w700),
                              ),
                              Text(
                                '${(topIncoming['vehicleTier'] ?? 'safari_4x4').toString().toUpperCase()} • ${topIncoming['customerPhone'] ?? ''}',
                                style: AppTypography.bodySmall.copyWith(fontSize: 11),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          '${topIncoming['distanceKm'] ?? '-'} km',
                          style: AppTypography.labelSmall.copyWith(color: AppColors.success),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Divider(color: AppColors.divider),
                    const SizedBox(height: AppSpacing.sm),

                    // Trip Route
                    Row(
                      children: [
                        const Icon(Icons.radio_button_checked, size: 14, color: AppColors.accent),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            (topIncoming['pickupAddress'] ?? 'Pickup').toString(),
                            style: AppTypography.bodySmall.copyWith(color: AppColors.textPrimary),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.location_on_rounded, size: 14, color: AppColors.textPrimary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            (topIncoming['dropoffAddress'] ?? 'Destination').toString(),
                            style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),

                    // Accept & Decline Buttons
                    Row(
                      children: [
                        Expanded(
                          child: SafarisButton(
                            text: 'Decline',
                            variant: SafarisButtonVariant.outline,
                            onPressed: () => _rejectIncomingRequest(topIncoming),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: SafarisButton(
                            text: 'Accept Trip',
                            variant: SafarisButtonVariant.primary,
                            isLoading: _isProcessingTripAction,
                            onPressed: () => _acceptIncomingRequest(topIncoming),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _DriverStat extends StatelessWidget {
  final String title;
  final String value;
  final bool highlight;

  const _DriverStat({
    required this.title,
    required this.value,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          title,
          style: AppTypography.labelSmall.copyWith(
            color: AppColors.textTertiary,
            fontSize: 10,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: AppTypography.titleSmall.copyWith(
            fontWeight: FontWeight.w800,
            color: highlight ? AppColors.accent : AppColors.textPrimary,
          ),
        ),
      ],
    );
  }
}
