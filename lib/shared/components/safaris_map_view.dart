import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart' as ll;
import '../../core/config/environment_config.dart';
import '../../core/services/live_fleet_service.dart';
import '../../core/services/mapbox_service.dart';
import '../../core/services/navigation_service.dart';
import '../../core/services/offline_location_queue.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/geo_utils.dart';
import '../models/location_model.dart';

/// Interactive Real-Time Map Widget for DRIVER Uganda
/// Supports:
/// - Drag / Pan exploration with touch & mouse
/// - Pinch-to-zoom and double-tap zoom
/// - Authentic Mapbox Cartography (streets-v12 light, navigation-day-v1, satellite-streets-v12)
/// - Accurate GPS coordinate projection to canvas
/// - Real-time vehicle marker tracking with heading rotation
/// - Turn-by-turn navigation guidance & route deviation alerts
/// - Multi-leg safari tour route rendering & intermediate stops
/// - Connection state indicators (Online, Offline, Syncing queue)
/// - Multi-segment road rendering (Expressways, Highways, Arterials)
/// - Lake Victoria shoreline and water bodies
/// - Recenter on user or active driver
class SafarisMapView extends StatefulWidget {
  final LocationModel? pickupLocation;
  final LocationModel? destinationLocation;
  final bool showDriver;
  final bool showNearbyDrivers;
  final double? driverLat;
  final double? driverLng;
  final double driverHeading;
  final String? etaText;
  final String? distanceText;
  final bool isLiveTrip;
  final VoidCallback? onRecenter;

  // Navigation & Multi-Leg Safari Extensions
  final bool isNavigating;
  final NavigationManeuver? activeManeuver;
  final List<SafariTourLeg>? safariLegs;
  final int activeLegIndex;
  final bool isRouteDeviated;
  final TelemetryConnectionState? connectionState;
  final int queuedUpdatesCount;

  // Mapbox Styling & Navigation Controls
  final bool showExpandButton;
  final VoidCallback? onExpand;
  final String initialStyle;
  final String? mapboxToken;
  final List<LiveDriverLocation>? nearbyDrivers;

  // Customer Live Location & Tap-to-Drive Interaction
  final double? userLat;
  final double? userLng;
  final bool showUserLocation;
  final void Function(LiveDriverLocation driver)? onDriverSelected;
  final double bottomPadding;

  const SafarisMapView({
    super.key,
    this.pickupLocation,
    this.destinationLocation,
    this.showDriver = false,
    this.showNearbyDrivers = true,
    this.driverLat,
    this.driverLng,
    this.driverHeading = 0.0,
    this.etaText,
    this.distanceText,
    this.isLiveTrip = false,
    this.onRecenter,
    this.isNavigating = false,
    this.activeManeuver,
    this.safariLegs,
    this.activeLegIndex = 0,
    this.isRouteDeviated = false,
    this.connectionState,
    this.queuedUpdatesCount = 0,
    this.showExpandButton = false,
    this.onExpand,
    this.initialStyle = 'streets-v12',
    this.mapboxToken,
    this.nearbyDrivers,
    this.userLat,
    this.userLng,
    this.showUserLocation = true,
    this.onDriverSelected,
    this.bottomPadding = 24.0,
  });

  @override
  State<SafarisMapView> createState() => _SafarisMapViewState();
}

class _SafarisMapViewState extends State<SafarisMapView>
    with SingleTickerProviderStateMixin {
  late final MapController _mapController;
  late final AnimationController _pulseController;

  // Map viewport center coordinates (default: Kampala CBD)
  double _centerLat = 0.3136;
  double _centerLng = 32.5811;
  double _currentZoom = 13.5;
  bool _trafficEnabled = false;

  List<MapboxCoordinate>? _mapboxRouteCoords;
  String? _mapboxDurationText;

  String _getEffectiveToken() {
    if (widget.mapboxToken != null && widget.mapboxToken!.trim().isNotEmpty) {
      return widget.mapboxToken!.trim();
    }
    return EnvironmentConfig.mapboxAccessToken.trim();
  }

  String _getTileUrl() {
    final token = _getEffectiveToken();
    if (token.isNotEmpty && token.startsWith('pk.')) {
      // Mapbox Streets light style — clean, readable, great outdoors contrast for Uganda
      return 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=$token';
    }
    // Light cartography fallback (no API key required)
    return 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png';
  }

  List<String> get _subdomains {
    final token = _getEffectiveToken();
    if (token.isNotEmpty && token.startsWith('pk.')) {
      return const [];
    }
    return const ['a', 'b', 'c', 'd'];
  }

  @override
  void initState() {
    super.initState();
    _mapController = MapController();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();

    if (widget.driverLat != null && widget.driverLng != null) {
      _centerLat = widget.driverLat!;
      _centerLng = widget.driverLng!;
      _currentZoom = 14.5;
    } else if (widget.userLat != null && widget.userLng != null) {
      _centerLat = widget.userLat!;
      _centerLng = widget.userLng!;
      _currentZoom = 14.5;
    }

    _syncViewportWithLocations();
  }

  @override
  void didUpdateWidget(SafarisMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.pickupLocation != oldWidget.pickupLocation ||
        widget.destinationLocation != oldWidget.destinationLocation ||
        widget.driverLat != oldWidget.driverLat ||
        widget.driverLng != oldWidget.driverLng ||
        widget.showDriver != oldWidget.showDriver ||
        widget.userLat != oldWidget.userLat ||
        widget.userLng != oldWidget.userLng) {
      _syncViewportWithLocations();
    }
  }

  void _syncViewportWithLocations() {
    if (widget.pickupLocation != null && widget.destinationLocation != null) {
      _centerLat = (widget.pickupLocation!.latitude + widget.destinationLocation!.latitude) / 2;
      _centerLng = (widget.pickupLocation!.longitude + widget.destinationLocation!.longitude) / 2;
      final distKm = GeoUtils.haversineDistance(
        widget.pickupLocation!.latitude,
        widget.pickupLocation!.longitude,
        widget.destinationLocation!.latitude,
        widget.destinationLocation!.longitude,
      );
      if (distKm > 100) {
        _currentZoom = 7.5;
      } else if (distKm > 40) {
        _currentZoom = 9.5;
      } else if (distKm > 15) {
        _currentZoom = 11.5;
      } else {
        _currentZoom = 13.5;
      }
    } else if (widget.pickupLocation != null) {
      _centerLat = widget.pickupLocation!.latitude;
      _centerLng = widget.pickupLocation!.longitude;
      _currentZoom = 14.5;
    } else if (widget.driverLat != null && widget.driverLng != null) {
      _centerLat = widget.driverLat!;
      _centerLng = widget.driverLng!;
      _currentZoom = 14.5;
    } else if (widget.userLat != null && widget.userLng != null) {
      _centerLat = widget.userLat!;
      _centerLng = widget.userLng!;
      _currentZoom = 14.5;
    }

    _fetchMapboxRoute();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        try {
          _mapController.move(ll.LatLng(_centerLat, _centerLng), _currentZoom);
        } catch (_) {}
      }
    });
  }

  Future<void> _fetchMapboxRoute() async {
    if (widget.pickupLocation != null && widget.destinationLocation != null) {
      try {
        final result = await MapboxService().getDirections(
          originLat: widget.pickupLocation!.latitude,
          originLng: widget.pickupLocation!.longitude,
          destLat: widget.destinationLocation!.latitude,
          destLng: widget.destinationLocation!.longitude,
        );
        if (mounted && result.coordinates.isNotEmpty) {
          setState(() {
            _mapboxRouteCoords = result.coordinates;
            if (result.durationSeconds > 0) {
              _mapboxDurationText = result.formattedDuration;
            }
          });
        }
      } catch (_) {}
    } else {
      if (mounted && (_mapboxRouteCoords != null || _mapboxDurationText != null)) {
        setState(() {
          _mapboxRouteCoords = null;
          _mapboxDurationText = null;
        });
      }
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _mapController.dispose();
    super.dispose();
  }

  void _recenter() {
    if (widget.onRecenter != null) {
      widget.onRecenter!();
    }
    double targetLat = widget.userLat ?? 0.3136;
    double targetLng = widget.userLng ?? 32.5811;
    double targetZoom = 14.5;

    if (widget.showDriver && widget.driverLat != null && widget.driverLng != null) {
      targetLat = widget.driverLat!;
      targetLng = widget.driverLng!;
      targetZoom = 15.0;
    } else if (widget.pickupLocation != null) {
      targetLat = widget.pickupLocation!.latitude;
      targetLng = widget.pickupLocation!.longitude;
      targetZoom = 14.5;
    } else if (widget.userLat != null && widget.userLng != null) {
      targetLat = widget.userLat!;
      targetLng = widget.userLng!;
      targetZoom = 15.0;
    }

    _mapController.move(ll.LatLng(targetLat, targetLng), targetZoom);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final List<ll.LatLng> routePolylinePoints = [];
        if (_mapboxRouteCoords != null && _mapboxRouteCoords!.isNotEmpty) {
          routePolylinePoints.addAll(
            _mapboxRouteCoords!.map((c) => ll.LatLng(c.latitude, c.longitude)),
          );
        } else if (widget.pickupLocation != null && widget.destinationLocation != null) {
          routePolylinePoints.add(ll.LatLng(widget.pickupLocation!.latitude, widget.pickupLocation!.longitude));
          routePolylinePoints.add(ll.LatLng(widget.destinationLocation!.latitude, widget.destinationLocation!.longitude));
        }

        final double effectiveUserLat = widget.userLat ?? widget.pickupLocation?.latitude ?? 0.3136;
        final double effectiveUserLng = widget.userLng ?? widget.pickupLocation?.longitude ?? 32.5811;

        final List<LiveDriverLocation> driversToShow = widget.showNearbyDrivers
            ? (widget.nearbyDrivers ?? [])
            : [];

        final String? effectiveEta = _mapboxDurationText ?? widget.etaText;

        return Stack(
          children: [
            // 1. Authentic Slippy Map with Real Cartography & Street Names
            FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: ll.LatLng(_centerLat, _centerLng),
                initialZoom: _currentZoom,
                minZoom: 4.0,
                maxZoom: 18.5,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                ),
                onPositionChanged: (camera, hasGesture) {
                  if (hasGesture) {
                    _centerLat = camera.center.latitude;
                    _centerLng = camera.center.longitude;
                    _currentZoom = camera.zoom;
                  }
                },
              ),
              children: [
                // Base Cartography Tile Layer
                TileLayer(
                  urlTemplate: _getTileUrl(),
                  subdomains: _subdomains,
                  userAgentPackageName: 'com.safaris.safaris',
                  fallbackUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  tileBuilder: (context, tileWidget, tile) {
                    return tileWidget;
                  },
                ),

                // Multi-Leg Safari Tour Routes or Active Route Polyline
                if (widget.safariLegs != null && widget.safariLegs!.isNotEmpty)
                  PolylineLayer(
                    polylines: widget.safariLegs!.map((leg) {
                      return Polyline(
                        points: [
                          ll.LatLng(leg.originLat, leg.originLng),
                          ll.LatLng(leg.destLat, leg.destLng),
                        ],
                        color: leg.status == 'completed'
                            ? AppColors.textTertiary
                            : AppColors.accent,
                        strokeWidth: 4.0,
                      );
                    }).toList(),
                  )
                else if (routePolylinePoints.isNotEmpty)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: routePolylinePoints,
                        color: AppColors.accent,
                        strokeWidth: 4.5,
                        borderColor: Colors.black.withOpacity(0.6),
                        borderStrokeWidth: 1.5,
                      ),
                    ],
                  ),

                // Interactive Markers: Drivers, Customer Location, Pickup, Destination
                MarkerLayer(
                  markers: [
                    // Customer Live Location Beacon (Pulsing Cyan with glowing halo)
                    if (widget.showUserLocation)
                      Marker(
                        point: ll.LatLng(effectiveUserLat, effectiveUserLng),
                        width: 64,
                        height: 64,
                        child: _buildUserLocationBeacon(),
                      ),

                    // Available / Online nearby drivers matching admin dashboard
                    for (final driver in driversToShow)
                      Marker(
                        point: ll.LatLng(driver.lat, driver.lng),
                        width: 76,
                        height: 76,
                        child: _buildDriverMarker(
                          driver: driver,
                          userLat: effectiveUserLat,
                          userLng: effectiveUserLng,
                        ),
                      ),

                    // Single active driver (in-trip)
                    if (widget.showDriver && widget.driverLat != null && widget.driverLng != null)
                      Marker(
                        point: ll.LatLng(widget.driverLat!, widget.driverLng!),
                        width: 76,
                        height: 76,
                        child: _buildDriverMarker(
                          driver: LiveDriverLocation(
                            driverId: 'assigned',
                            name: 'Assigned Safari Driver',
                            phone: '+256 700 000000',
                            status: 'in_transit',
                            lat: widget.driverLat!,
                            lng: widget.driverLng!,
                            heading: widget.driverHeading,
                            vehicle: 'Safari Land Cruiser',
                            plate: 'SAFARI',
                            tier: 'PREMIUM',
                            rating: 4.9,
                          ),
                          userLat: effectiveUserLat,
                          userLng: effectiveUserLng,
                        ),
                      ),

                    // Pickup Pin Marker
                    if (widget.pickupLocation != null)
                      Marker(
                        point: ll.LatLng(widget.pickupLocation!.latitude, widget.pickupLocation!.longitude),
                        width: 70,
                        height: 60,
                        child: _buildLocationPin(
                          isPickup: true,
                          title: widget.pickupLocation!.title,
                        ),
                      ),

                    // Destination Pin Marker
                    if (widget.destinationLocation != null)
                      Marker(
                        point: ll.LatLng(widget.destinationLocation!.latitude, widget.destinationLocation!.longitude),
                        width: 70,
                        height: 60,
                        child: _buildLocationPin(
                          isPickup: false,
                          title: widget.destinationLocation!.title,
                        ),
                      ),
                  ],
                ),
              ],
            ),

            // 2. Top Turn-by-Turn Navigation Header Banner
            if (widget.isNavigating && widget.activeManeuver != null)
              Positioned(
                top: 16,
                left: 16,
                right: 16,
                child: _buildTurnByTurnBanner(widget.activeManeuver!),
              ),

            // 3. Route Deviation Alert
            if (widget.isRouteDeviated)
              Positioned(
                top: widget.isNavigating ? 84 : 16,
                left: 16,
                right: 16,
                child: _buildDeviationAlert(),
              ),

            // 4. Connection State Pill
            if (widget.connectionState != null)
              Positioned(
                top: widget.isNavigating ? (widget.isRouteDeviated ? 136 : 84) : 16,
                right: 16,
                child: _buildConnectionPill(widget.connectionState!, widget.queuedUpdatesCount),
              ),

            // 5. Top ETA & Distance Chip
            if (!widget.isNavigating && (effectiveEta != null || widget.distanceText != null))
              Positioned(
                top: 16,
                left: 16,
                right: 16,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceElevated.withOpacity(0.94),
                      borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                      border: Border.all(color: AppColors.borderLight, width: 1),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.5),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: AppColors.accent,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        if (effectiveEta != null)
                          Text(
                            effectiveEta,
                            style: AppTypography.labelMedium.copyWith(
                              color: AppColors.textPrimary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        if (effectiveEta != null && widget.distanceText != null)
                          Text(
                            ' • ',
                            style: AppTypography.bodySmall.copyWith(color: AppColors.textTertiary),
                          ),
                        if (widget.distanceText != null)
                          Text(
                            widget.distanceText!,
                            style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                          ),
                      ],
                    ),
                  ),
                ),
              ),

            // 6. Map Floating Action Controls
            Positioned(
              right: 16,
              bottom: widget.bottomPadding,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (widget.showExpandButton) ...[
                    _MapControlButton(
                      icon: Icons.open_in_full_rounded,
                      iconColor: AppColors.accent,
                      onTap: widget.onExpand ?? () {},
                    ),
                    const SizedBox(height: 8),
                  ],
                  _MapControlButton(
                    icon: _trafficEnabled ? Icons.traffic_rounded : Icons.traffic_outlined,
                    iconColor: _trafficEnabled ? AppColors.accent : AppColors.iconPrimary,
                    onTap: () {
                      setState(() {
                        _trafficEnabled = !_trafficEnabled;
                      });
                    },
                  ),
                  const SizedBox(height: 8),
                  _MapControlButton(
                    icon: Icons.add_rounded,
                    onTap: () {
                      _mapController.move(_mapController.camera.center, _mapController.camera.zoom + 1.0);
                    },
                  ),
                  const SizedBox(height: 8),
                  _MapControlButton(
                    icon: Icons.remove_rounded,
                    onTap: () {
                      _mapController.move(_mapController.camera.center, _mapController.camera.zoom - 1.0);
                    },
                  ),
                  const SizedBox(height: 8),
                  _MapControlButton(
                    icon: Icons.my_location_rounded,
                    iconColor: AppColors.accent,
                    onTap: _recenter,
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildUserLocationBeacon() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              AnimatedBuilder(
                animation: _pulseController,
                builder: (context, child) {
                  final s = 22.0 + (_pulseController.value * 16.0);
                  final o = (1.0 - _pulseController.value).clamp(0.0, 1.0) * 0.45;
                  return Container(
                    width: s,
                    height: s,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFF00D2FF).withOpacity(o * 0.35),
                      border: Border.all(
                        color: const Color(0xFF00D2FF).withOpacity(o),
                        width: 1.5,
                      ),
                    ),
                  );
                },
              ),
              Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  color: const Color(0xFF00D2FF),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 2.5),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF00D2FF).withOpacity(0.8),
                      blurRadius: 8,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Center(
                  child: Container(
                    width: 5,
                    height: 5,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.85),
              borderRadius: BorderRadius.circular(3),
              border: Border.all(color: const Color(0xFF00D2FF).withOpacity(0.5), width: 0.6),
            ),
            child: const Text(
              'YOU',
              style: TextStyle(
                color: Color(0xFF00D2FF),
                fontSize: 7.5,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDriverMarker({
    required LiveDriverLocation driver,
    required double userLat,
    required double userLng,
  }) {
    final bool isOffline = driver.status == 'offline' || driver.status == 'stale';
    final bool isAvailable = driver.status == 'available';
    final Color statusColor = isOffline
        ? const Color(0xFF64748B)
        : isAvailable
            ? const Color(0xFF10B981)
            : const Color(0xFF2563EB);
    final Color statusBg = isOffline
        ? const Color(0xFF1E293B)
        : isAvailable
            ? const Color(0xFF0D2818)
            : const Color(0xFF1E3A8A);

    return GestureDetector(
      onTap: () => _showDriverDetailsSheet(driver, userLat, userLng),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Circular vehicle marker matching admin dashboard
            Stack(
              alignment: Alignment.center,
              children: [
                // Pulse halo ring
                if (isAvailable)
                  AnimatedBuilder(
                    animation: _pulseController,
                    builder: (context, child) {
                      final s = 28.0 + (_pulseController.value * 8.0);
                      final o = (1.0 - _pulseController.value).clamp(0.0, 1.0) * 0.4;
                      return Container(
                        width: s,
                        height: s,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: statusColor.withOpacity(o),
                            width: 1.5,
                          ),
                        ),
                      );
                    },
                  ),
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: statusBg,
                    shape: BoxShape.circle,
                    border: Border.all(color: statusColor, width: 1.8),
                    boxShadow: [
                      BoxShadow(
                        color: statusColor.withOpacity(0.4),
                        blurRadius: 8,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                  child: Center(
                    child: Transform.rotate(
                      angle: driver.heading * math.pi / 180,
                      child: const Icon(
                        Icons.navigation_rounded,
                        color: Colors.white,
                        size: 16,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 3),
            // Black license plate pill badge (e.g. UBM 714K)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.92),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: Colors.white.withOpacity(0.25), width: 0.8),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.5),
                    blurRadius: 4,
                  ),
                ],
              ),
              child: Text(
                driver.plate.isNotEmpty ? driver.plate : 'SAFARI',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 8.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.3,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLocationPin({required bool isPickup, required String title}) {
    final color = isPickup ? AppColors.success : AppColors.accent;
    final icon = isPickup ? Icons.my_location_rounded : Icons.location_on_rounded;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2),
              boxShadow: [
                BoxShadow(
                  color: color.withOpacity(0.5),
                  blurRadius: 8,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: Icon(icon, color: Colors.black, size: 16),
          ),
          const SizedBox(height: 2),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.85),
              borderRadius: BorderRadius.circular(3),
            ),
            child: Text(
              isPickup ? 'PICKUP' : 'DESTINATION',
              style: TextStyle(
                color: color,
                fontSize: 7.5,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showDriverDetailsSheet(LiveDriverLocation driver, double userLat, double userLng) {
    final double distKm = GeoUtils.haversineDistance(userLat, userLng, driver.lat, driver.lng);
    final int etaMins = (distKm / 32.0 * 60).round().clamp(2, 60);
    final bool isAvailable = driver.status == 'available';

    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      isScrollControlled: true,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusXl)),
        side: BorderSide(color: AppColors.border, width: 1),
      ),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.borderLight,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      color: isAvailable ? const Color(0xFF0D2818) : const Color(0xFF2D2006),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isAvailable ? const Color(0xFF10B981) : const Color(0xFFE5A93C),
                        width: 1.8,
                      ),
                    ),
                    child: Icon(
                      Icons.drive_eta_rounded,
                      color: isAvailable ? const Color(0xFF10B981) : const Color(0xFFE5A93C),
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              driver.name,
                              style: AppTypography.titleMedium.copyWith(fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(width: 6),
                            const Icon(Icons.verified_rounded, size: 16, color: AppColors.accent),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Plate: ${driver.plate.isNotEmpty ? driver.plate : "SAFARI"} • ${driver.tier ?? "Safari Cruiser"}',
                          style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  if (driver.rating != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppColors.accentMuted,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        border: Border.all(color: AppColors.accent.withOpacity(0.3), width: 0.8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.star_rounded, size: 15, color: AppColors.accent),
                          const SizedBox(width: 4),
                          Text(
                            driver.rating!.toStringAsFixed(1),
                            style: AppTypography.labelSmall.copyWith(
                              fontWeight: FontWeight.w700,
                              color: AppColors.accent,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              // Telemetry & Distance Row
              Container(
                padding: const EdgeInsets.all(AppSpacing.sm),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.borderLight, width: 0.8),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildMetricCol(
                      icon: Icons.near_me_rounded,
                      label: 'Distance',
                      value: '${distKm.toStringAsFixed(1)} km',
                      color: AppColors.accent,
                    ),
                    Container(width: 1, height: 30, color: AppColors.borderLight),
                    _buildMetricCol(
                      icon: Icons.access_time_rounded,
                      label: 'Est. Arrival',
                      value: '$etaMins mins',
                      color: const Color(0xFF00D2FF),
                    ),
                    Container(width: 1, height: 30, color: AppColors.borderLight),
                    _buildMetricCol(
                      icon: Icons.speed_rounded,
                      label: 'Telemetry',
                      value: driver.speed > 0 ? '${driver.speed.toStringAsFixed(0)} km/h' : 'Stationary',
                      color: const Color(0xFF10B981),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: isAvailable ? AppColors.success : AppColors.warning,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    isAvailable
                        ? 'Active & Ready for instant dispatch'
                        : 'Currently completing a safari leg in transit',
                    style: AppTypography.bodySmall.copyWith(
                      color: isAvailable ? AppColors.success : AppColors.warning,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.flash_on_rounded, size: 20),
                  label: Text(
                    isAvailable
                        ? 'Request Drive with ${driver.name.split(" ").first}'
                        : 'Driver Currently in Transit',
                    style: AppTypography.titleSmall.copyWith(
                      color: isAvailable ? Colors.black : Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isAvailable ? AppColors.accent : AppColors.surfaceElevated,
                    foregroundColor: isAvailable ? Colors.black : Colors.white60,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    ),
                    elevation: isAvailable ? 2 : 0,
                  ),
                  onPressed: isAvailable
                      ? () {
                          Navigator.pop(ctx);
                          if (widget.onDriverSelected != null) {
                            widget.onDriverSelected!(driver);
                          } else {
                            context.push(
                              '/rides/vehicle-select',
                              extra: {
                                'preferredDriver': driver.name,
                                'driverId': driver.driverId,
                              },
                            );
                          }
                        }
                      : null,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildMetricCol({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
            Text(
              label,
              style: AppTypography.labelSmall.copyWith(
                color: AppColors.textTertiary,
                fontSize: 10,
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          value,
          style: AppTypography.titleSmall.copyWith(
            fontWeight: FontWeight.w700,
            fontSize: 13,
            color: AppColors.textPrimary,
          ),
        ),
      ],
    );
  }


  Widget _buildTurnByTurnBanner(NavigationManeuver maneuver) {
    IconData maneuverIcon;
    switch (maneuver.type) {
      case ManeuverType.turnLeft:
        maneuverIcon = Icons.turn_left_rounded;
        break;
      case ManeuverType.turnRight:
        maneuverIcon = Icons.turn_right_rounded;
        break;
      case ManeuverType.slightLeft:
        maneuverIcon = Icons.turn_slight_left_rounded;
        break;
      case ManeuverType.slightRight:
        maneuverIcon = Icons.turn_slight_right_rounded;
        break;
      case ManeuverType.uTurn:
        maneuverIcon = Icons.u_turn_left_rounded;
        break;
      case ManeuverType.sharpTurn:
        maneuverIcon = Icons.turn_sharp_right_rounded;
        break;
      case ManeuverType.roundabout:
        maneuverIcon = Icons.roundabout_right_rounded;
        break;
      case ManeuverType.arrive:
        maneuverIcon = Icons.flag_rounded;
        break;
      case ManeuverType.straight:
        maneuverIcon = Icons.straight_rounded;
        break;
    }

    final String? effectiveEta = _mapboxDurationText ?? widget.etaText;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated.withOpacity(0.96),
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.borderLight, width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.6),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
              border: Border.all(color: AppColors.borderLight, width: 1),
            ),
            child: Icon(
              maneuverIcon,
              size: 26,
              color: AppColors.accent,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  maneuver.instruction,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.titleSmall.copyWith(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Text(
                      maneuver.distanceMeters > 1000
                          ? 'In ${(maneuver.distanceMeters / 1000).toStringAsFixed(1)} km'
                          : 'In ${maneuver.distanceMeters.round()} m',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.accent,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (widget.distanceText != null || effectiveEta != null) ...[
                      Text(' • ', style: AppTypography.bodySmall.copyWith(color: AppColors.textTertiary)),
                      Text(
                        '${widget.distanceText ?? ''} ${effectiveEta != null ? '($effectiveEta)' : ''}',
                        style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDeviationAlert() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated.withOpacity(0.95),
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        border: Border.all(color: AppColors.error.withOpacity(0.6), width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 10,
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.warning_amber_rounded,
            size: 16,
            color: AppColors.error,
          ),
          const SizedBox(width: 8),
          Text(
            'Route deviation detected. Recalculating path...',
            style: AppTypography.labelSmall.copyWith(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConnectionPill(TelemetryConnectionState state, int queued) {
    Color dotColor;
    String label;

    switch (state) {
      case TelemetryConnectionState.online:
        dotColor = AppColors.success;
        label = 'ONLINE';
        break;
      case TelemetryConnectionState.connecting:
        dotColor = AppColors.accent;
        label = 'CONNECTING...';
        break;
      case TelemetryConnectionState.weakConnection:
        dotColor = AppColors.accent;
        label = 'WEAK SIGNAL';
        break;
      case TelemetryConnectionState.syncing:
        dotColor = AppColors.accent;
        label = 'SYNCING QUEUE...';
        break;
      case TelemetryConnectionState.offline:
        dotColor = AppColors.error;
        label = queued > 0 ? 'OFFLINE ($queued QUEUED)' : 'OFFLINE';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated.withOpacity(0.92),
        borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
        border: Border.all(color: AppColors.borderLight, width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 8,
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: dotColor,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.labelSmall.copyWith(
              color: AppColors.textSecondary,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _MapControlButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final Color? iconColor;

  const _MapControlButton({
    required this.icon,
    required this.onTap,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceElevated.withValues(alpha: 0.92),
      shape: const CircleBorder(),
      elevation: 4,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.borderLight, width: 0.8),
          ),
          child: Icon(icon, size: 18, color: iconColor ?? AppColors.iconPrimary),
        ),
      ),
    );
  }
}
