import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/environment_config.dart';
import '../network/api_client.dart';
import '../../shared/models/location_model.dart';
import 'navigation_service.dart';

/// Representation of a GPS coordinate for Mapbox/OSRM
class MapboxCoordinate {
  final double latitude;
  final double longitude;

  const MapboxCoordinate(this.latitude, this.longitude);

  Map<String, dynamic> toJson() => {
        'latitude': latitude,
        'longitude': longitude,
      };

  factory MapboxCoordinate.fromJson(Map<String, dynamic> json) =>
      MapboxCoordinate(
        (json['latitude'] as num).toDouble(),
        (json['longitude'] as num).toDouble(),
      );
}

/// Result returned from Road Routing Engine (Backend / Mapbox Directions v5 / OSRM)
class MapboxRouteResult {
  final List<MapboxCoordinate> coordinates;
  final double distanceMeters;
  final double durationSeconds;
  final List<NavigationManeuver> maneuvers;
  final String summary;
  final bool isFromCache;
  final bool isRouteUnavailable;
  final String? errorMessage;
  final String provider;

  const MapboxRouteResult({
    required this.coordinates,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.maneuvers,
    this.summary = '',
    this.isFromCache = false,
    this.isRouteUnavailable = false,
    this.errorMessage,
    this.provider = 'mapbox',
  });

  factory MapboxRouteResult.unavailable(String reason) {
    return MapboxRouteResult(
      coordinates: const [],
      distanceMeters: 0,
      durationSeconds: 0,
      maneuvers: const [],
      summary: 'Route Unavailable',
      isRouteUnavailable: true,
      errorMessage: reason,
      provider: 'unavailable',
    );
  }

  bool get isValid =>
      !isRouteUnavailable && coordinates.length >= 2 && distanceMeters > 0;

  double get distanceKm => distanceMeters / 1000.0;

  int get durationMinutes => (durationSeconds / 60.0).ceil();

  String get formattedDistance {
    if (distanceMeters >= 1000) {
      return '${(distanceMeters / 1000).toStringAsFixed(1)} km';
    }
    return '${distanceMeters.toStringAsFixed(0)} m';
  }

  String get formattedDuration {
    final minutes = (durationSeconds / 60).round();
    if (minutes >= 60) {
      final hours = minutes ~/ 60;
      final remMins = minutes % 60;
      if (remMins == 0) return '${hours}h';
      return '${hours}h ${remMins}m';
    }
    return '$minutes mins';
  }
}

typedef DirectionsRouteResult = MapboxRouteResult;

class _CachedRouteEntry {
  final MapboxRouteResult result;
  final DateTime expiresAt;
  final double originLat;
  final double originLng;
  final double destLat;
  final double destLng;

  const _CachedRouteEntry({
    required this.result,
    required this.expiresAt,
    required this.originLat,
    required this.originLng,
    required this.destLat,
    required this.destLng,
  });

  bool isValidFor(double oLat, double oLng, double dLat, double dLng) {
    if (DateTime.now().isAfter(expiresAt)) return false;
    return (originLat - oLat).abs() < 0.0005 &&
        (originLng - oLng).abs() < 0.0005 &&
        (destLat - dLat).abs() < 0.0005 &&
        (destLng - dLng).abs() < 0.0005;
  }
}

/// Production-Grade Mapbox + OSRM Routing & Uganda-Wide Multi-Source Geocoding Service
class MapboxService {
  static final MapboxService _instance = MapboxService._internal();
  factory MapboxService() => _instance;
  MapboxService._internal();

  static const String _apiBaseUrl = 'https://api.mapbox.com';
  static const String _cachePrefix = 'mapbox_route_cache_v2_';
  static const String _offlineRegionsKey = 'mapbox_offline_safari_regions';
  static const Duration _cacheTtl = Duration(minutes: 15);

  final Map<String, _CachedRouteEntry> _memoryCache = {};
  int _activeSearchRequestId = 0;

  String _resolveMapboxToken() {
    return EnvironmentConfig.mapboxAccessToken.trim();
  }

  /// Mapbox Streets Light Style Tile URL for tile layers
  static String getLightTileUrl(int z, int x, int y) {
    final token = EnvironmentConfig.mapboxAccessToken.trim();
    if (token.isEmpty) {
      return '';
    }
    return '$_apiBaseUrl/styles/v1/mapbox/streets-v12/tiles/256/$z/$x/$y@2x?access_token=$token';
  }

  /// Multi-source Uganda destination search:
  /// 1. Local verified Uganda presets & gazetteer
  /// 2. Backend `/maps/search` (60+ Uganda districts, municipalities, towns, trading centres, parks + Mapbox + OSM Nominatim)
  /// 3. Direct Mapbox Geocoding API (`country=ug`, dynamic proximity only when caller supplies valid coordinates)
  /// 4. Direct OpenStreetMap Nominatim Uganda (`countrycodes=ug`)
  Future<List<LocationModel>> searchPlaces(
    String query, {
    double? proximityLat,
    double? proximityLng,
    int limit = 12,
  }) async {
    final cleanQuery = query.trim();
    if (cleanQuery.length < 2) return const [];

    final requestId = ++_activeSearchRequestId;
    final hasValidProximity =
        LocationModel.isWithinUganda(proximityLat, proximityLng);

    final merged = <LocationModel>[];
    final seenKeys = <String>{};

    void addDeduplicated(LocationModel loc) {
      if (!loc.hasValidUgandaCoordinates) return;
      final normTitle =
          loc.title.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
      final key =
          '${normTitle}_${loc.latitude.toStringAsFixed(2)}_${loc.longitude.toStringAsFixed(2)}';
      if (seenKeys.contains(key)) return;
      seenKeys.add(key);
      merged.add(loc);
    }

    // 1. Instant local verified Uganda gazetteer match
    final qLower = cleanQuery.toLowerCase();
    for (final preset in LocationModel.presets) {
      if (preset.title.toLowerCase().contains(qLower) ||
          preset.address.toLowerCase().contains(qLower) ||
          (preset.district?.toLowerCase().contains(qLower) ?? false)) {
        addDeduplicated(preset);
      }
    }

    // 2. Backend `/maps/search`
    try {
      final queryParams = <String, String>{
        'q': cleanQuery,
        'limit': limit.toString(),
        if (hasValidProximity) 'proximityLat': proximityLat!.toStringAsFixed(5),
        if (hasValidProximity) 'proximityLng': proximityLng!.toStringAsFixed(5),
      };
      final apiRes = await ApiClient().get<dynamic>(
        '/maps/search',
        queryParams: queryParams,
      );
      if (requestId != _activeSearchRequestId) return merged;
      if (apiRes.success && apiRes.data is List) {
        for (final item in apiRes.data as List) {
          if (item is Map<String, dynamic>) {
            addDeduplicated(LocationModel.fromBackendJson(item));
          } else if (item is Map) {
            addDeduplicated(
                LocationModel.fromBackendJson(Map<String, dynamic>.from(item)));
          }
        }
      }
    } catch (_) {}

    if (requestId != _activeSearchRequestId) return merged;

    // 3. Direct Mapbox Geocoding API v5 (`country=ug`, dynamic proximity)
    final token = _resolveMapboxToken();
    if (token.isNotEmpty && token.startsWith('pk.') && merged.length < limit) {
      try {
        final params = <String, String>{
          'country': 'ug',
          'types': 'district,region,place,locality,neighborhood,address,poi',
          'autocomplete': 'true',
          'limit': '10',
          'language': 'en',
          'access_token': token,
          if (hasValidProximity)
            'proximity':
                '${proximityLng!.toStringAsFixed(5)},${proximityLat!.toStringAsFixed(5)}',
        };
        final uri = Uri.parse(
          '$_apiBaseUrl/geocoding/v5/mapbox.places/${Uri.encodeComponent(cleanQuery)}.json',
        ).replace(queryParameters: params);

        final res = await http.get(uri).timeout(const Duration(seconds: 6));
        if (res.statusCode == 200) {
          final body = jsonDecode(res.body) as Map<String, dynamic>;
          final features = body['features'] as List<dynamic>? ?? const [];
          for (final f in features) {
            if (f is Map<String, dynamic>) {
              final loc = LocationModel.fromMapboxFeature(f);
              if (loc != null) addDeduplicated(loc);
            }
          }
        }
      } catch (_) {}
    }

    if (requestId != _activeSearchRequestId) return merged;

    // 4. Direct OpenStreetMap Nominatim Uganda (`countrycodes=ug`) for villages, parishes & trading centres
    if (merged.length < 6) {
      try {
        final nomUri =
            Uri.parse('https://nominatim.openstreetmap.org/search').replace(
          queryParameters: {
            'q': cleanQuery,
            'countrycodes': 'ug',
            'format': 'jsonv2',
            'addressdetails': '1',
            'limit': '10',
            'bounded': '1',
            'viewbox':
                '${UgandaGeoBounds.minLng},${UgandaGeoBounds.maxLat},${UgandaGeoBounds.maxLng},${UgandaGeoBounds.minLat}',
          },
        );
        final res = await http.get(
          nomUri,
          headers: {
            'User-Agent': 'MumweSafarisUganda/1.0',
            'Accept': 'application/json',
          },
        ).timeout(const Duration(seconds: 6));

        if (res.statusCode == 200) {
          final items = jsonDecode(res.body) as List<dynamic>;
          for (final raw in items) {
            if (raw is Map) {
              final lat = double.tryParse((raw['lat'] ?? '').toString());
              final lon = double.tryParse((raw['lon'] ?? '').toString());
              if (lat == null ||
                  lon == null ||
                  !LocationModel.isWithinUganda(lat, lon)) {
                continue;
              }
              final addr = raw['address'] is Map
                  ? Map<String, dynamic>.from(raw['address'] as Map)
                  : <String, dynamic>{};
              final title = (raw['name'] ??
                      addr['village'] ??
                      addr['town'] ??
                      addr['suburb'] ??
                      addr['city'] ??
                      (raw['display_name'] ?? '')
                          .toString()
                          .split(',')
                          .first)
                  .toString()
                  .trim();
              if (title.isEmpty) continue;
              final district =
                  (addr['county'] ?? addr['state_district'] ?? addr['city'])
                      ?.toString();
              final region = addr['state']?.toString();
              final subParts = <String>[
                if (addr['suburb'] != null && addr['suburb'] != title)
                  addr['suburb'].toString(),
                if (district != null && district != title) district,
                if (region != null) region,
                'Uganda',
              ];
              addDeduplicated(
                LocationModel(
                  id: 'osm_${raw['place_id'] ?? '${lat.toStringAsFixed(4)}_${lon.toStringAsFixed(4)}'}',
                  title: title,
                  address: subParts.join(', '),
                  city: district ?? region ?? 'Uganda',
                  latitude: lat,
                  longitude: lon,
                  category: (raw['type'] ?? raw['category'] ?? 'place').toString(),
                  district: district,
                  region: region,
                  source: 'openstreetmap',
                  isVerified: true,
                ),
              );
            }
          }
        }
      } catch (_) {}
    }

    // Sort by relevance + proximity when caller provided valid Uganda coordinates
    merged.sort((a, b) {
      final aExact = a.title.toLowerCase() == qLower ? 1 : 0;
      final bExact = b.title.toLowerCase() == qLower ? 1 : 0;
      if (aExact != bExact) return bExact.compareTo(aExact);

      final aStarts = a.title.toLowerCase().startsWith(qLower) ? 1 : 0;
      final bStarts = b.title.toLowerCase().startsWith(qLower) ? 1 : 0;
      if (aStarts != bStarts) return bStarts.compareTo(aStarts);

      if (hasValidProximity) {
        final distA = a.proximityDistanceKmTo(proximityLat!, proximityLng!);
        final distB = b.proximityDistanceKmTo(proximityLat, proximityLng);
        return distA.compareTo(distB);
      }
      return 0;
    });

    return merged.take(limit).toList();
  }

  /// Resolves a verified driving road route between [originLat, originLng] and [destLat, destLng].
  /// Never fabricates Bezier curves or `1.35x` Haversine distances.
  Future<MapboxRouteResult> getDirections({
    required double originLat,
    required double originLng,
    required double destLat,
    required double destLng,
    List<MapboxCoordinate>? waypoints,
    bool bypassCache = false,
  }) async {
    if (!LocationModel.isValidCoordinate(originLat, originLng) ||
        !LocationModel.isValidCoordinate(destLat, destLng)) {
      return MapboxRouteResult.unavailable(
          'Invalid pickup or destination coordinates.');
    }

    final cacheKey =
        _generateCacheKey(originLat, originLng, destLat, destLng, waypoints);

    // 1. Check in-memory cache with strict endpoint & TTL validation
    if (!bypassCache) {
      final memCached = _memoryCache[cacheKey];
      if (memCached != null &&
          memCached.isValidFor(originLat, originLng, destLat, destLng)) {
        return memCached.result;
      }
    }

    // 2. Check persistent disk cache
    final diskCached = await _loadCachedRoute(cacheKey);

    // 3. Query Backend `/maps/route`
    try {
      final apiRes = await ApiClient().get<dynamic>(
        '/maps/route',
        queryParams: {
          'originLat': originLat.toStringAsFixed(6),
          'originLng': originLng.toStringAsFixed(6),
          'destLat': destLat.toStringAsFixed(6),
          'destLng': destLng.toStringAsFixed(6),
        },
      );
      if (apiRes.success && apiRes.data is Map) {
        final data = Map<String, dynamic>.from(apiRes.data as Map);
        final rawGeo = data['geometry'] as List<dynamic>? ?? const [];
        final coords = <MapboxCoordinate>[];
        for (final pt in rawGeo) {
          if (pt is List && pt.length >= 2) {
            coords.add(MapboxCoordinate(
              (pt[0] as num).toDouble(),
              (pt[1] as num).toDouble(),
            ));
          }
        }
        final distMeters = (data['distanceMeters'] as num?)?.toDouble() ?? 0.0;
        final durSecs = (data['durationSeconds'] as num?)?.toDouble() ?? 0.0;
        if (coords.length >= 2 && distMeters > 0) {
          final rawManeuvers = data['maneuvers'] as List<dynamic>? ?? const [];
          final maneuvers = rawManeuvers.whereType<Map>().map((m) {
            return NavigationManeuver(
              type: _parseManeuverType(m['type']?.toString(), null),
              instruction: (m['instruction'] ?? 'Continue').toString(),
              distanceMeters: (m['distanceMeters'] as num?)?.toDouble() ?? 0.0,
              estimatedSeconds: (m['durationSeconds'] as num?)?.round() ?? 60,
              roadName: (m['roadName'] ?? '').toString(),
              targetLat: (m['latitude'] as num?)?.toDouble() ?? 0.0,
              targetLng: (m['longitude'] as num?)?.toDouble() ?? 0.0,
            );
          }).toList();

          final result = MapboxRouteResult(
            coordinates: coords,
            distanceMeters: distMeters,
            durationSeconds: durSecs,
            maneuvers: maneuvers,
            summary: 'Verified Uganda Road Route',
            isFromCache: false,
            provider: (data['provider'] ?? 'backend').toString(),
          );
          _storeCache(cacheKey, originLat, originLng, destLat, destLng, result);
          return result;
        }
      }
    } catch (_) {}

    // 4. Direct Mapbox Directions API v5
    final token = _resolveMapboxToken();
    if (token.isNotEmpty && token.startsWith('pk.')) {
      try {
        final coordsList = <String>[
          '$originLng,$originLat',
          if (waypoints != null)
            ...waypoints.map((w) => '${w.longitude},${w.latitude}'),
          '$destLng,$destLat',
        ];
        final uri = Uri.parse(
          '$_apiBaseUrl/directions/v5/mapbox/driving/${coordsList.join(';')}'
          '?geometries=geojson&overview=full&steps=true&access_token=$token',
        );
        final response =
            await http.get(uri).timeout(const Duration(seconds: 8));
        if (response.statusCode == 200) {
          final parsed = _parseDirectionsJson(
              jsonDecode(response.body) as Map<String, dynamic>,
              provider: 'mapbox');
          if (parsed != null) {
            _storeCache(
                cacheKey, originLat, originLng, destLat, destLng, parsed);
            return parsed;
          }
        }
      } catch (e) {
        debugPrint('[MapboxService] Mapbox Directions error: $e');
      }
    }

    // 5. Direct OSRM Driving Routing Engine (Real OpenStreetMap road geometry & road distances)
    final osrmEndpoints = [
      'https://router.project-osrm.org/route/v1/driving/$originLng,$originLat;$destLng,$destLat?overview=full&geometries=geojson&steps=true',
      'https://routing.openstreetmap.de/routed-car/route/v1/driving/$originLng,$originLat;$destLng,$destLat?overview=full&geometries=geojson&steps=true',
    ];
    for (final endpoint in osrmEndpoints) {
      try {
        final res = await http.get(
          Uri.parse(endpoint),
          headers: {'User-Agent': 'MumweSafarisUganda/1.0'},
        ).timeout(const Duration(seconds: 8));
        if (res.statusCode == 200) {
          final parsed = _parseDirectionsJson(
              jsonDecode(res.body) as Map<String, dynamic>,
              provider: 'osrm');
          if (parsed != null) {
            _storeCache(
                cacheKey, originLat, originLng, destLat, destLng, parsed);
            return parsed;
          }
        }
      } catch (_) {}
    }

    // 6. Return previously verified cached route if endpoints match
    if (diskCached != null && diskCached.isValid) {
      return diskCached;
    }

    return MapboxRouteResult.unavailable(
      'Road route is temporarily unavailable. Please verify your internet connection and retry.',
    );
  }

  MapboxRouteResult? _parseDirectionsJson(
    Map<String, dynamic> data, {
    required String provider,
  }) {
    final routes = data['routes'] as List?;
    if (routes == null || routes.isEmpty) return null;
    final primaryRoute = routes.first as Map<String, dynamic>;
    final geometry = primaryRoute['geometry'] as Map<String, dynamic>?;
    final coordsData = geometry?['coordinates'] as List?;
    if (coordsData == null || coordsData.length < 2) return null;

    final coordinates = <MapboxCoordinate>[];
    for (final c in coordsData) {
      if (c is List && c.length >= 2) {
        final latLng = LocationModel.fromGeoJsonCoordinate(c);
        if (latLng != null) {
          coordinates.add(MapboxCoordinate(latLng[0], latLng[1]));
        }
      }
    }
    if (coordinates.length < 2) return null;

    final distanceMeters =
        (primaryRoute['distance'] as num?)?.toDouble() ?? 0.0;
    final durationSeconds =
        (primaryRoute['duration'] as num?)?.toDouble() ?? 0.0;
    if (distanceMeters <= 0) return null;

    final summary =
        (primaryRoute['legs'] as List?)?.first?['summary'] as String? ??
            'Uganda Highway Route';

    final maneuvers = <NavigationManeuver>[];
    final legs = primaryRoute['legs'] as List?;
    if (legs != null) {
      for (final leg in legs) {
        final steps = leg['steps'] as List?;
        if (steps != null) {
          for (final step in steps) {
            final maneuverJson = step['maneuver'] as Map<String, dynamic>?;
            final locList = maneuverJson?['location'] as List?;
            final stepLatLng = LocationModel.fromGeoJsonCoordinate(locList);
            final roadName = (step['name'] ?? '').toString();
            final rawInstruction =
                (maneuverJson?['instruction'] ?? step['instruction'] ?? '')
                    .toString();
            final mType = _parseManeuverType(
              maneuverJson?['type']?.toString(),
              maneuverJson?['modifier']?.toString(),
            );
            maneuvers.add(
              NavigationManeuver(
                type: mType,
                instruction: rawInstruction.isNotEmpty
                    ? rawInstruction
                    : (roadName.isNotEmpty
                        ? 'Continue onto $roadName'
                        : 'Continue on route'),
                distanceMeters: (step['distance'] as num?)?.toDouble() ?? 0.0,
                estimatedSeconds:
                    ((step['duration'] as num?)?.toDouble() ?? 0.0).round(),
                roadName: roadName,
                targetLat: stepLatLng != null ? stepLatLng[0] : 0.0,
                targetLng: stepLatLng != null ? stepLatLng[1] : 0.0,
              ),
            );
          }
        }
      }
    }

    return MapboxRouteResult(
      coordinates: coordinates,
      distanceMeters: distanceMeters,
      durationSeconds: durationSeconds,
      maneuvers: maneuvers,
      summary: summary,
      isFromCache: false,
      provider: provider,
    );
  }

  void _storeCache(
    String cacheKey,
    double oLat,
    double oLng,
    double dLat,
    double dLng,
    MapboxRouteResult result,
  ) {
    _memoryCache[cacheKey] = _CachedRouteEntry(
      result: result,
      expiresAt: DateTime.now().add(_cacheTtl),
      originLat: oLat,
      originLng: oLng,
      destLat: dLat,
      destLng: dLng,
    );
    _saveRouteToDisk(cacheKey, result);
  }

  /// Download and cache an offline safari route region
  Future<bool> downloadOfflineSafariRegion({
    required String regionName,
    required double minLat,
    required double minLng,
    required double maxLat,
    required double maxLng,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final regions = prefs.getStringList(_offlineRegionsKey) ?? [];

      final regionData = jsonEncode({
        'name': regionName,
        'minLat': minLat,
        'minLng': minLng,
        'maxLat': maxLat,
        'maxLng': maxLng,
        'cachedAt': DateTime.now().toIso8601String(),
      });

      if (!regions.contains(regionData)) {
        regions.add(regionData);
        await prefs.setStringList(_offlineRegionsKey, regions);
      }
      return true;
    } catch (e) {
      debugPrint('[MapboxService] downloadOfflineSafariRegion error: $e');
      return false;
    }
  }

  /// Get list of pre-cached safari regions
  Future<List<Map<String, dynamic>>> getOfflineSafariRegions() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final regions = prefs.getStringList(_offlineRegionsKey) ?? [];
      return regions.map((r) => jsonDecode(r) as Map<String, dynamic>).toList();
    } catch (_) {
      return [];
    }
  }

  String _generateCacheKey(
    double oLat,
    double oLng,
    double dLat,
    double dLng,
    List<MapboxCoordinate>? wp,
  ) {
    final wpStr = wp != null
        ? wp
            .map((w) =>
                '${w.latitude.toStringAsFixed(4)},${w.longitude.toStringAsFixed(4)}')
            .join('|')
        : '';
    return 'route_${oLat.toStringAsFixed(5)}_${oLng.toStringAsFixed(5)}_${dLat.toStringAsFixed(5)}_${dLng.toStringAsFixed(5)}_$wpStr';
  }

  Future<MapboxRouteResult?> _loadCachedRoute(String key) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonStr = prefs.getString('$_cachePrefix$key');
      if (jsonStr == null) return null;

      final data = jsonDecode(jsonStr) as Map<String, dynamic>;
      final savedAt = DateTime.tryParse((data['savedAt'] ?? '').toString());
      if (savedAt != null && DateTime.now().difference(savedAt) > _cacheTtl) {
        return null;
      }

      final coords = (data['coordinates'] as List).map<MapboxCoordinate>((c) {
        return MapboxCoordinate(
          (c['latitude'] as num).toDouble(),
          (c['longitude'] as num).toDouble(),
        );
      }).toList();

      return MapboxRouteResult(
        coordinates: coords,
        distanceMeters: (data['distanceMeters'] as num).toDouble(),
        durationSeconds: (data['durationSeconds'] as num).toDouble(),
        maneuvers: const [],
        summary: data['summary'] as String? ?? 'Cached Verified Route',
        isFromCache: true,
        provider: 'cache',
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _saveRouteToDisk(String key, MapboxRouteResult result) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final data = {
        'coordinates': result.coordinates.map((c) => c.toJson()).toList(),
        'distanceMeters': result.distanceMeters,
        'durationSeconds': result.durationSeconds,
        'summary': result.summary,
        'savedAt': DateTime.now().toIso8601String(),
      };
      await prefs.setString('$_cachePrefix$key', jsonEncode(data));
    } catch (_) {}
  }

  ManeuverType _parseManeuverType(String? type, String? modifier) {
    if (type == 'arrive') return ManeuverType.arrive;
    if (type == 'roundabout' || type == 'rotary') return ManeuverType.roundabout;
    if (modifier == 'uturn') return ManeuverType.uTurn;
    if (modifier == 'sharp right' || modifier == 'sharp left') {
      return ManeuverType.sharpTurn;
    }
    if (modifier == 'slight right') return ManeuverType.slightRight;
    if (modifier == 'slight left') return ManeuverType.slightLeft;
    if (modifier == 'right') return ManeuverType.turnRight;
    if (modifier == 'left') return ManeuverType.turnLeft;
    return ManeuverType.straight;
  }
}
