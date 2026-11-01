import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Accurate geospatial mathematics & screen projection for Uganda coordinates
class GeoUtils {
  GeoUtils._();

  /// Earth radius in kilometers
  static const double earthRadiusKm = 6371.0;

  /// Haversine formula to compute great-circle distance between two GPS coordinates in kilometers
  static double haversineDistance(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    final dLat = _degreesToRadians(lat2 - lat1);
    final dLon = _degreesToRadians(lon2 - lon1);

    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_degreesToRadians(lat1)) *
            math.cos(_degreesToRadians(lat2)) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);

    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  /// Calculates the initial bearing (compass heading in degrees 0..360) from point 1 to point 2
  static double calculateBearing(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    final phi1 = _degreesToRadians(lat1);
    final phi2 = _degreesToRadians(lat2);
    final deltaLambda = _degreesToRadians(lon2 - lon1);

    final y = math.sin(deltaLambda) * math.cos(phi2);
    final x = math.cos(phi1) * math.sin(phi2) -
        math.sin(phi1) * math.cos(phi2) * math.cos(deltaLambda);

    final theta = math.atan2(y, x);
    final bearing = (theta * 180 / math.pi + 360) % 360;
    return bearing;
  }

  /// Projects GPS (latitude, longitude) to 2D screen coordinates (dx, dy)
  /// centered around [centerLat], [centerLng] at a given [zoom] scale.
  static Offset projectToScreen({
    required double lat,
    required double lng,
    required double centerLat,
    required double centerLng,
    required double zoom,
    required Size screenSize,
  }) {
    final center = Offset(screenSize.width / 2, screenSize.height / 2);
    final double scale = 11000.0 * zoom;

    final latRad = _degreesToRadians(centerLat);
    final dx = (lng - centerLng) * math.cos(latRad) * scale;
    final dy = -(lat - centerLat) * scale;

    return center + Offset(dx, dy);
  }

  /// Inverses screen pixel coordinate (dx, dy) back to geographic GPS (latitude, longitude)
  static Map<String, double> unprojectToGeo({
    required Offset screenPoint,
    required double centerLat,
    required double centerLng,
    required double zoom,
    required Size screenSize,
  }) {
    final center = Offset(screenSize.width / 2, screenSize.height / 2);
    final diff = screenPoint - center;

    final double scale = 11000.0 * zoom;
    final latRad = _degreesToRadians(centerLat);

    final dLng = diff.dx / (math.cos(latRad) * scale);
    final dLat = -diff.dy / scale;

    return {
      'latitude': centerLat + dLat,
      'longitude': centerLng + dLng,
    };
  }

  /// Computes intermediate waypoint coordinates for a curved, road-like trajectory
  static List<Offset> getRouteWaypoints({
    required double startLat,
    required double startLng,
    required double destLat,
    required double destLng,
    required double centerLat,
    required double centerLng,
    required double zoom,
    required Size screenSize,
    int segments = 24,
  }) {
    final pStart = projectToScreen(
      lat: startLat,
      lng: startLng,
      centerLat: centerLat,
      centerLng: centerLng,
      zoom: zoom,
      screenSize: screenSize,
    );

    final pEnd = projectToScreen(
      lat: destLat,
      lng: destLng,
      centerLat: centerLat,
      centerLng: centerLng,
      zoom: zoom,
      screenSize: screenSize,
    );

    final dx = pEnd.dx - pStart.dx;
    final dy = pEnd.dy - pStart.dy;
    final perpX = -dy * 0.18;
    final perpY = dx * 0.18;

    final ctrl1 = Offset(
      pStart.dx + dx * 0.35 + perpX,
      pStart.dy + dy * 0.35 + perpY,
    );

    final ctrl2 = Offset(
      pStart.dx + dx * 0.65 - perpX * 0.6,
      pStart.dy + dy * 0.65 - perpY * 0.6,
    );

    final List<Offset> points = [];
    for (int i = 0; i <= segments; i++) {
      final t = i / segments;
      final oneMinusT = 1.0 - t;
      final x = math.pow(oneMinusT, 3) * pStart.dx +
          3 * math.pow(oneMinusT, 2) * t * ctrl1.dx +
          3 * oneMinusT * math.pow(t, 2) * ctrl2.dx +
          math.pow(t, 3) * pEnd.dx;
      final y = math.pow(oneMinusT, 3) * pStart.dy +
          3 * math.pow(oneMinusT, 2) * t * ctrl1.dy +
          3 * oneMinusT * math.pow(t, 2) * ctrl2.dy +
          math.pow(t, 3) * pEnd.dy;
      points.add(Offset(x, y));
    }

    return points;
  }

  /// Computes intermediate GPS coordinates [lat, lng] along a curved highway corridor
  static List<List<double>> getInterpolatedGeoRoute({
    required double startLat,
    required double startLng,
    required double destLat,
    required double destLng,
    int segments = 24,
  }) {
    final dLat = destLat - startLat;
    final dLng = destLng - startLng;
    final perpLat = -dLng * 0.15;
    final perpLng = dLat * 0.15;

    final ctrl1Lat = startLat + dLat * 0.35 + perpLat;
    final ctrl1Lng = startLng + dLng * 0.35 + perpLng;

    final ctrl2Lat = startLat + dLat * 0.65 - perpLat * 0.5;
    final ctrl2Lng = startLng + dLng * 0.65 - perpLng * 0.5;

    final List<List<double>> route = [];
    for (int i = 0; i <= segments; i++) {
      final t = i / segments;
      final oneMinusT = 1.0 - t;
      final lat = math.pow(oneMinusT, 3) * startLat +
          3 * math.pow(oneMinusT, 2) * t * ctrl1Lat +
          3 * oneMinusT * math.pow(t, 2) * ctrl2Lat +
          math.pow(t, 3) * destLat;
      final lng = math.pow(oneMinusT, 3) * startLng +
          3 * math.pow(oneMinusT, 2) * t * ctrl1Lng +
          3 * oneMinusT * math.pow(t, 2) * ctrl2Lng +
          math.pow(t, 3) * destLng;
      route.add([lat.toDouble(), lng.toDouble()]);
    }
    return route;
  }

  static double _degreesToRadians(double degrees) {
    return degrees * (math.pi / 180.0);
  }
}
