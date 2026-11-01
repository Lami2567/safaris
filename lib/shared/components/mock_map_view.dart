import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../models/location_model.dart';

class MockMapView extends StatefulWidget {
  final LocationModel? pickupLocation;
  final LocationModel? destinationLocation;
  final bool showDriver;
  final bool showNearbyDrivers;
  final String? etaText;
  final String? distanceText;
  final bool isLiveTrip;
  final VoidCallback? onRecenter;

  const MockMapView({
    super.key,
    this.pickupLocation,
    this.destinationLocation,
    this.showDriver = false,
    this.showNearbyDrivers = true,
    this.etaText,
    this.distanceText,
    this.isLiveTrip = false,
    this.onRecenter,
  });

  @override
  State<MockMapView> createState() => _MockMapViewState();
}

class _MockMapViewState extends State<MockMapView>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  double _zoomLevel = 1.0;
  bool _trafficEnabled = false;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 8),
    )..repeat();
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Map Canvas
        AnimatedBuilder(
          animation: _animController,
          builder: (context, child) {
            return CustomPaint(
              size: Size.infinite,
              painter: _MapCanvasPainter(
                progress: _animController.value,
                zoom: _zoomLevel,
                traffic: _trafficEnabled,
                showNearbyDrivers: widget.showNearbyDrivers,
                showDriver: widget.showDriver,
                isLiveTrip: widget.isLiveTrip,
                hasDestination: widget.destinationLocation != null,
              ),
            );
          },
        ),

        // Pickup / Dropoff Labels on top of Map
        if (widget.pickupLocation != null)
          Positioned(
            left: 24,
            top: 24,
            child: _LocationPinBadge(
              title: widget.pickupLocation!.title,
              isPickup: true,
            ),
          ),

        if (widget.destinationLocation != null)
          Positioned(
            right: 24,
            top: 72,
            child: _LocationPinBadge(
              title: widget.destinationLocation!.title,
              isPickup: false,
            ),
          ),

        // ETA / Distance Header Overlay
        if (widget.etaText != null || widget.distanceText != null)
          Positioned(
            top: 16,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated.withOpacity(0.92),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                  border: Border.all(color: AppColors.borderLight, width: 1),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.4),
                      blurRadius: 10,
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
                    if (widget.etaText != null)
                      Text(
                        widget.etaText!,
                        style: AppTypography.labelMedium.copyWith(
                          color: AppColors.textPrimary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    if (widget.etaText != null && widget.distanceText != null)
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

        // Map Interactive Action Controls (Recenter, Zoom, Traffic)
        Positioned(
          right: 16,
          bottom: 24,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _MapControlButton(
                icon: _trafficEnabled
                    ? Icons.traffic_rounded
                    : Icons.traffic_outlined,
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
                  setState(() {
                    _zoomLevel = math.min(1.6, _zoomLevel + 0.15);
                  });
                },
              ),
              const SizedBox(height: 8),
              _MapControlButton(
                icon: Icons.remove_rounded,
                onTap: () {
                  setState(() {
                    _zoomLevel = math.max(0.7, _zoomLevel - 0.15);
                  });
                },
              ),
              const SizedBox(height: 8),
              _MapControlButton(
                icon: Icons.my_location_rounded,
                iconColor: AppColors.accent,
                onTap: widget.onRecenter ??
                    () {
                      setState(() {
                        _zoomLevel = 1.0;
                      });
                    },
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LocationPinBadge extends StatelessWidget {
  final String title;
  final bool isPickup;

  const _LocationPinBadge({required this.title, required this.isPickup});

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(maxWidth: 180),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated.withOpacity(0.9),
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        border: Border.all(
          color: isPickup ? AppColors.accent : AppColors.textPrimary,
          width: 1,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isPickup ? Icons.radio_button_checked : Icons.location_on_rounded,
            size: 14,
            color: isPickup ? AppColors.accent : AppColors.textPrimary,
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w600,
                fontSize: 11,
              ),
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
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.borderLight, width: 0.8),
          ),
          child: Icon(icon, size: 20, color: iconColor ?? AppColors.iconPrimary),
        ),
      ),
    );
  }
}

class _MapCanvasPainter extends CustomPainter {
  final double progress;
  final double zoom;
  final bool traffic;
  final bool showNearbyDrivers;
  final bool showDriver;
  final bool isLiveTrip;
  final bool hasDestination;

  _MapCanvasPainter({
    required this.progress,
    required this.zoom,
    required this.traffic,
    required this.showNearbyDrivers,
    required this.showDriver,
    required this.isLiveTrip,
    required this.hasDestination,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // 1. Background — light cream land fill (matches Mapbox streets-v12 light)
    final bgPaint = Paint()..color = const Color(0xFFF5F3EE);
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), bgPaint);

    // 2. Lake Victoria / Water body (soft blue, south side)
    final waterPaint = Paint()..color = const Color(0xFFB8D8F0);
    final waterPath = Path();
    waterPath.moveTo(0, size.height * 0.82);
    waterPath.quadraticBezierTo(
      size.width * 0.4,
      size.height * 0.76,
      size.width,
      size.height * 0.84,
    );
    waterPath.lineTo(size.width, size.height);
    waterPath.lineTo(0, size.height);
    waterPath.close();
    canvas.drawPath(waterPath, waterPaint);

    // 3. Grid road network — light grey minor roads, medium grey arterials
    final minorRoadPaint = Paint()
      ..color = const Color(0xFFDDD8CE)
      ..strokeWidth = 2.0 * zoom;

    final majorRoadPaint = Paint()
      ..color = const Color(0xFFBBB7AE)
      ..strokeWidth = 5.0 * zoom;

    // Horizontal minor roads
    for (double y = 40; y < size.height * 0.8; y += 45 * zoom) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), minorRoadPaint);
    }
    // Vertical minor roads
    for (double x = 30; x < size.width; x += 55 * zoom) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height * 0.8), minorRoadPaint);
    }

    // Kampala Arterial Roads (Entebbe Expressway, Jinja Road, Northern Bypass)
    final expressWayPath = Path();
    expressWayPath.moveTo(size.width * 0.2, 0);
    expressWayPath.cubicTo(
      size.width * 0.35,
      size.height * 0.3,
      size.width * 0.45,
      size.height * 0.5,
      size.width * 0.65,
      size.height * 0.8,
    );
    canvas.drawPath(expressWayPath, majorRoadPaint);

    final jinjaRoadPath = Path();
    jinjaRoadPath.moveTo(0, size.height * 0.45);
    jinjaRoadPath.cubicTo(
      size.width * 0.3,
      size.height * 0.4,
      size.width * 0.7,
      size.height * 0.3,
      size.width,
      size.height * 0.25,
    );
    canvas.drawPath(jinjaRoadPath, majorRoadPaint);

    // Optional Traffic Flow lines
    if (traffic) {
      final trafficCongested = Paint()
        ..color = const Color(0xFFEF4444).withOpacity(0.7)
        ..strokeWidth = 3.0 * zoom
        ..style = PaintingStyle.stroke;
      final trafficSmooth = Paint()
        ..color = const Color(0xFF10B981).withOpacity(0.6)
        ..strokeWidth = 3.0 * zoom
        ..style = PaintingStyle.stroke;

      canvas.drawPath(jinjaRoadPath, trafficSmooth);
      canvas.drawPath(expressWayPath, trafficCongested);
    }

    // Center Coordinate (Simulated Kampala Center / User current location)
    final center = Offset(size.width * 0.45, size.height * 0.48);
    final destination = Offset(size.width * 0.75, size.height * 0.28);

    // 4. Draw Route if destination or trip active
    if (hasDestination || isLiveTrip) {
      final routePath = Path();
      routePath.moveTo(center.dx, center.dy);
      routePath.cubicTo(
        center.dx + 40,
        center.dy - 30,
        destination.dx - 40,
        destination.dy + 40,
        destination.dx,
        destination.dy,
      );

      // Route shadow
      final routeGlowPaint = Paint()
        ..color = Colors.black.withOpacity(0.12)
        ..strokeWidth = 7.0 * zoom
        ..style = PaintingStyle.stroke;
      canvas.drawPath(routePath, routeGlowPaint);

      // Route line
      final routePaint = Paint()
        ..color = AppColors.accent
        ..strokeWidth = 4.0 * zoom
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round;
      canvas.drawPath(routePath, routePaint);

      // Destination Marker — dark dot on light map
      final destMarkerPaint = Paint()..color = AppColors.accent;
      canvas.drawCircle(destination, 7 * zoom, destMarkerPaint);
      canvas.drawCircle(destination, 3 * zoom, Paint()..color = Colors.white);
    }

    // 5. Pickup / User Location Pulse Marker
    final pulseRadius = (12.0 + 8.0 * math.sin(progress * 2 * math.pi)) * zoom;
    final pulsePaint = Paint()
      ..color = AppColors.accent.withOpacity(0.18)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, pulseRadius, pulsePaint);

    final userDotOuter = Paint()..color = AppColors.accent;
    canvas.drawCircle(center, 7 * zoom, userDotOuter);
    final userDotInner = Paint()..color = Colors.white;
    canvas.drawCircle(center, 4 * zoom, userDotInner);

    // 6. Nearby Mock Vehicles / Boda bodas
    if (showNearbyDrivers) {
      final nearbyDrivers = [
        Offset(center.dx - 60, center.dy - 40),
        Offset(center.dx + 50, center.dy + 35),
        Offset(center.dx - 35, center.dy + 70),
        Offset(center.dx + 80, center.dy - 65),
      ];

      for (int i = 0; i < nearbyDrivers.length; i++) {
        final driverBase = nearbyDrivers[i];
        final driftX = math.sin((progress * 2 * math.pi) + i) * 6;
        final driftY = math.cos((progress * 2 * math.pi) + i) * 4;
        final driverPos = Offset(driverBase.dx + driftX, driverBase.dy + driftY);

        _drawVehicleDot(canvas, driverPos, zoom);
      }
    }

    // 7. Assigned Driver Vehicle moving along route
    if (showDriver || isLiveTrip) {
      final t = isLiveTrip ? (progress % 1.0) : 0.35;
      final driverPos = Offset(
        center.dx + (destination.dx - center.dx) * t,
        center.dy + (destination.dy - center.dy) * t - 15 * math.sin(t * math.pi),
      );

      _drawActiveDriverCar(canvas, driverPos, zoom);
    }
  }

  void _drawVehicleDot(Canvas canvas, Offset pos, double zoom) {
    // Light vehicle dot on light map — soft grey with white roof
    final carBg = Paint()..color = const Color(0xFFB0ABA1);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: pos, width: 14 * zoom, height: 22 * zoom),
        Radius.circular(3 * zoom),
      ),
      carBg,
    );

    final carRoof = Paint()..color = Colors.white;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: pos, width: 8 * zoom, height: 12 * zoom),
        Radius.circular(2 * zoom),
      ),
      carRoof,
    );
  }

  void _drawActiveDriverCar(Canvas canvas, Offset pos, double zoom) {
    // Subtle glow on light background
    final glow = Paint()
      ..color = AppColors.accent.withOpacity(0.3)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);
    canvas.drawCircle(pos, 16 * zoom, glow);

    // Car Body
    final carBody = Paint()..color = AppColors.accent;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: pos, width: 18 * zoom, height: 28 * zoom),
        Radius.circular(4 * zoom),
      ),
      carBody,
    );

    // Windshield & Roof — white on light map
    final windshield = Paint()..color = Colors.white.withOpacity(0.9);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: pos, width: 12 * zoom, height: 16 * zoom),
        Radius.circular(3 * zoom),
      ),
      windshield,
    );
  }

  @override
  bool shouldRepaint(covariant _MapCanvasPainter oldDelegate) => true;
}
