import 'dart:math' as math;

/// Geographic bounding box for the Republic of Uganda:
/// Latitude:  -1.55° S (Kisoro / Kabale border) to +4.30° N (Moyo / Nimule / Kidepo border)
/// Longitude: 29.50° E (Semuliki / Bwindi DRC border) to 35.10° E (Amudat / Moroto Kenya border)
class UgandaGeoBounds {
  static const double minLat = -1.55;
  static const double maxLat = 4.30;
  static const double minLng = 29.50;
  static const double maxLng = 35.10;

  static const double kampalaCenterLat = 0.3476;
  static const double kampalaCenterLng = 32.5825;
  static const double legacyKampalaLat = 0.3136;
  static const double legacyKampalaLng = 32.5811;
}

class LocationModel {
  final String id;
  final String title;
  final String address;
  final double latitude;
  final double longitude;
  final String city;
  final String category;
  final String? district;
  final String? region;
  final String source;
  final bool isVerified;

  const LocationModel({
    required this.id,
    required this.title,
    String? address,
    String? subtitle,
    required this.latitude,
    required this.longitude,
    this.city = 'Uganda',
    this.category = 'place',
    this.district,
    this.region,
    this.source = 'verified',
    this.isVerified = true,
  }) : address = address ?? subtitle ?? '';

  /// Alias used by UI components expecting `subtitle`
  String get subtitle => address;

  /// Validates that [lat] and [lng] are finite, non-zero, and within Earth bounds.
  static bool isValidCoordinate(double? lat, double? lng) {
    if (lat == null || lng == null) return false;
    if (lat.isNaN || lng.isNaN || lat.isInfinite || lng.isInfinite) return false;
    if (lat.abs() < 0.00001 && lng.abs() < 0.00001) return false;
    if (lat < -90.0 || lat > 90.0) return false;
    if (lng < -180.0 || lng > 180.0) return false;
    return true;
  }

  /// Validates that [lat] and [lng] lie within Uganda's geographic boundaries.
  static bool isWithinUganda(double? lat, double? lng) {
    if (!isValidCoordinate(lat, lng)) return false;
    return lat! >= UgandaGeoBounds.minLat &&
        lat <= UgandaGeoBounds.maxLat &&
        lng! >= UgandaGeoBounds.minLng &&
        lng <= UgandaGeoBounds.maxLng;
  }

  /// Detects if a caller accidentally passed `[longitude, latitude]` as `(lat, lng)`.
  static bool isLikelyReversedUgandaCoordinate(double lat, double lng) {
    return lat >= UgandaGeoBounds.minLng &&
        lat <= UgandaGeoBounds.maxLng &&
        lng >= UgandaGeoBounds.minLat &&
        lng <= UgandaGeoBounds.maxLat;
  }

  /// Detects if coordinates match the legacy hardcoded Kampala fallback coordinates.
  static bool isDefaultKampalaCoordinate(double lat, double lng) {
    final matchesLegacy = (lat - UgandaGeoBounds.legacyKampalaLat).abs() < 0.0008 &&
        (lng - UgandaGeoBounds.legacyKampalaLng).abs() < 0.0008;
    final matchesCentral = (lat - UgandaGeoBounds.kampalaCenterLat).abs() < 0.0008 &&
        (lng - UgandaGeoBounds.kampalaCenterLng).abs() < 0.0008;
    return matchesLegacy || matchesCentral;
  }

  bool get hasValidCoordinates => isValidCoordinate(latitude, longitude);

  bool get hasValidUgandaCoordinates => isWithinUganda(latitude, longitude);

  /// Safely converts a Mapbox/GeoJSON `[longitude, latitude]` pair into `[latitude, longitude]`.
  static List<double>? fromGeoJsonCoordinate(List<dynamic>? coord) {
    if (coord == null || coord.length < 2) return null;
    final first = (coord[0] as num?)?.toDouble();
    final second = (coord[1] as num?)?.toDouble();
    if (first == null || second == null) return null;

    // Standard GeoJSON order for Uganda: [lng (29.5..35.1), lat (-1.55..4.30)]
    if (isWithinUganda(second, first)) {
      return [second, first];
    }
    if (isWithinUganda(first, second)) {
      return [first, second];
    }
    if (isValidCoordinate(second, first)) {
      return [second, first];
    }
    return null;
  }

  factory LocationModel.fromBackendJson(Map<String, dynamic> json) {
    final lat = (json['latitude'] ?? json['lat'] as num?)?.toDouble() ?? 0.0;
    final lng = (json['longitude'] ?? json['lng'] as num?)?.toDouble() ?? 0.0;
    final district = json['district']?.toString();
    final region = json['region']?.toString();
    final rawSub = (json['subtitle'] ?? json['address'] ?? '').toString();

    return LocationModel(
      id: (json['id'] ?? 'ug_${lat.toStringAsFixed(4)}_${lng.toStringAsFixed(4)}').toString(),
      title: (json['title'] ?? json['name'] ?? 'Location').toString(),
      address: rawSub.isNotEmpty
          ? rawSub
          : [if (district != null) district, if (region != null) region, 'Uganda'].join(', '),
      city: district ?? (json['city'] ?? 'Uganda').toString(),
      latitude: lat,
      longitude: lng,
      category: (json['category'] ?? 'place').toString(),
      district: district,
      region: region,
      source: (json['source'] ?? 'backend').toString(),
      isVerified: json['verified'] != false && isWithinUganda(lat, lng),
    );
  }

  static LocationModel? fromMapboxFeature(Map<String, dynamic> feature) {
    final center = feature['center'] as List<dynamic>?;
    final latLng = fromGeoJsonCoordinate(center);
    if (latLng == null) return null;
    final lat = latLng[0];
    final lng = latLng[1];
    if (!isWithinUganda(lat, lng)) return null;

    final title = (feature['text'] ?? feature['place_name'] ?? 'Location').toString().trim();
    final placeName = (feature['place_name'] ?? title).toString().trim();
    String subtitle = placeName.startsWith(title)
        ? placeName.substring(title.length).replaceFirst(RegExp(r'^[,\s]+'), '').trim()
        : placeName;

    String? district;
    String? region;
    final contextList = feature['context'] as List<dynamic>?;
    if (contextList != null) {
      for (final ctx in contextList) {
        if (ctx is Map) {
          final ctxId = (ctx['id'] ?? '').toString();
          final ctxText = (ctx['text'] ?? '').toString();
          if (ctxId.startsWith('district') || ctxId.startsWith('place')) {
            district ??= ctxText;
          } else if (ctxId.startsWith('region')) {
            region ??= ctxText;
          }
        }
      }
    }

    if (subtitle.isEmpty) {
      subtitle = [
        if (district != null && district.isNotEmpty) district,
        if (region != null && region.isNotEmpty) region,
        'Uganda',
      ].join(', ');
    }

    final placeTypes = (feature['place_type'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList() ??
        const [];

    return LocationModel(
      id: (feature['id'] ?? 'mbx_${lat.toStringAsFixed(5)}_${lng.toStringAsFixed(5)}').toString(),
      title: title,
      address: subtitle,
      city: district ?? region ?? 'Uganda',
      latitude: lat,
      longitude: lng,
      category: placeTypes.isNotEmpty ? placeTypes.first : 'place',
      district: district,
      region: region,
      source: 'mapbox',
      isVerified: true,
    );
  }

  /// Approximate straight-line proximity distance in km (only for search ranking, never road routing)
  double proximityDistanceKmTo(double otherLat, double otherLng) {
    const double r = 6371.0;
    final dLat = (otherLat - latitude) * math.pi / 180.0;
    final dLng = (otherLng - longitude) * math.pi / 180.0;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(latitude * math.pi / 180.0) *
            math.cos(otherLat * math.pi / 180.0) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  static const LocationModel kampalaCentral = LocationModel(
    id: 'loc_kla_cbd',
    title: 'Kampala City Centre',
    address: 'Kampala Road, Central Division',
    latitude: 0.3136,
    longitude: 32.5811,
    city: 'Kampala',
    category: 'city',
    district: 'Kampala',
    region: 'Central',
  );

  static const LocationModel acaciaMall = LocationModel(
    id: 'loc_acacia',
    title: 'Acacia Mall, Kisementi',
    address: 'Acacia Avenue, Kololo',
    latitude: 0.3354,
    longitude: 32.5886,
    city: 'Kampala',
    category: 'landmark',
    district: 'Kampala',
    region: 'Central',
  );

  static const LocationModel entebbeAirport = LocationModel(
    id: 'loc_ebb_airport',
    title: 'Entebbe International Airport (EBB)',
    address: 'Airport Road, Entebbe Peninsula',
    latitude: 0.0424,
    longitude: 32.4435,
    city: 'Entebbe',
    category: 'airport',
    district: 'Wakiso',
    region: 'Central',
  );

  static const LocationModel jinjaNile = LocationModel(
    id: 'loc_jinja_nile',
    title: 'Source of the Nile Bridge',
    address: 'Jinja Town, Lake Victoria Basin',
    latitude: 0.4244,
    longitude: 33.1995,
    city: 'Jinja',
    category: 'safari',
    district: 'Jinja',
    region: 'Eastern',
  );

  static const LocationModel bwindiGate = LocationModel(
    id: 'loc_bwindi_gate',
    title: 'Bwindi Buhoma Park Gate',
    address: 'Bwindi Impenetrable National Park, Kanungu',
    latitude: -0.9880,
    longitude: 29.6150,
    city: 'Bwindi',
    category: 'safari',
    district: 'Kanungu',
    region: 'Western',
  );

  static const LocationModel munyonyoResort = LocationModel(
    id: 'loc_munyonyo',
    title: 'Speke Resort Munyonyo',
    address: 'Wavamunno Road, Lake Victoria Shore',
    latitude: 0.2378,
    longitude: 32.6167,
    city: 'Kampala',
    category: 'hotel',
    district: 'Kampala',
    region: 'Central',
  );

  static const List<LocationModel> presets = [
    kampalaCentral,
    acaciaMall,
    entebbeAirport,
    munyonyoResort,
    jinjaNile,
    bwindiGate,
    LocationModel(
      id: 'ug_mbarara',
      title: 'Mbarara City',
      address: 'High Street, Mbarara District, Western Uganda',
      city: 'Mbarara',
      latitude: -0.6072,
      longitude: 30.6545,
      category: 'city',
      district: 'Mbarara',
      region: 'Western',
    ),
    LocationModel(
      id: 'ug_kabale',
      title: 'Kabale Municipality',
      address: 'Kabale Town, Kigezi Highlands, Kabale District',
      city: 'Kabale',
      latitude: -1.2486,
      longitude: 29.9899,
      category: 'municipality',
      district: 'Kabale',
      region: 'Western',
    ),
    LocationModel(
      id: 'ug_rukungiri',
      title: 'Rukungiri Municipality',
      address: 'Rukungiri Town Centre, Rukungiri District, Western Uganda',
      city: 'Rukungiri',
      latitude: -0.8411,
      longitude: 29.9419,
      category: 'municipality',
      district: 'Rukungiri',
      region: 'Western',
    ),
    LocationModel(
      id: 'ug_kisoro',
      title: 'Kisoro Municipality',
      address: 'Kisoro Town, Virunga Gateway, Kisoro District',
      city: 'Kisoro',
      latitude: -1.2854,
      longitude: 29.6850,
      category: 'municipality',
      district: 'Kisoro',
      region: 'Western',
    ),
    LocationModel(
      id: 'ug_hoima',
      title: 'Hoima Oil City',
      address: 'Hoima Central, Bunyoro Region, Hoima District',
      city: 'Hoima',
      latitude: 1.4331,
      longitude: 31.3524,
      category: 'city',
      district: 'Hoima',
      region: 'Western',
    ),
    LocationModel(
      id: 'ug_fort_portal',
      title: 'Fort Portal Tourism City',
      address: 'Fort Portal CBD, Kabarole District, Western Uganda',
      city: 'Fort Portal',
      latitude: 0.6617,
      longitude: 30.2748,
      category: 'city',
      district: 'Kabarole',
      region: 'Western',
    ),
    LocationModel(
      id: 'ug_kasese',
      title: 'Kasese Municipality',
      address: 'Kasese Town, Rwenzori Foothills, Kasese District',
      city: 'Kasese',
      latitude: 0.1833,
      longitude: 30.0833,
      category: 'municipality',
      district: 'Kasese',
      region: 'Western',
    ),
    LocationModel(
      id: 'ug_gulu',
      title: 'Gulu City',
      address: 'Gulu Central Division, Acholi Sub-Region, Northern Uganda',
      city: 'Gulu',
      latitude: 2.7724,
      longitude: 32.2881,
      category: 'city',
      district: 'Gulu',
      region: 'Northern',
    ),
    LocationModel(
      id: 'ug_arua',
      title: 'Arua City',
      address: 'Arua Central Division, West Nile Sub-Region, Northern Uganda',
      city: 'Arua',
      latitude: 3.0201,
      longitude: 30.9111,
      category: 'city',
      district: 'Arua',
      region: 'Northern',
    ),
    LocationModel(
      id: 'ug_lira',
      title: 'Lira City',
      address: 'Lira Central, Lango Sub-Region, Northern Uganda',
      city: 'Lira',
      latitude: 2.2499,
      longitude: 32.8998,
      category: 'city',
      district: 'Lira',
      region: 'Northern',
    ),
    LocationModel(
      id: 'ug_mbale',
      title: 'Mbale City',
      address: 'Republic Street, Mount Elgon Gateway, Mbale District',
      city: 'Mbale',
      latitude: 1.0821,
      longitude: 34.1750,
      category: 'city',
      district: 'Mbale',
      region: 'Eastern',
    ),
    LocationModel(
      id: 'ug_soroti',
      title: 'Soroti City',
      address: 'Soroti Central, Teso Sub-Region, Eastern Uganda',
      city: 'Soroti',
      latitude: 1.7146,
      longitude: 33.6111,
      category: 'city',
      district: 'Soroti',
      region: 'Eastern',
    ),
    LocationModel(
      id: 'ug_masaka',
      title: 'Masaka City',
      address: 'Masaka Central, Buddu County, Central Uganda',
      city: 'Masaka',
      latitude: -0.3338,
      longitude: 31.7341,
      category: 'city',
      district: 'Masaka',
      region: 'Central',
    ),
    LocationModel(
      id: 'ug_qenp',
      title: 'Queen Elizabeth National Park',
      address: 'Mweya Peninsula & Kazinga Channel, Kasese / Rubirizi',
      city: 'Kasese',
      latitude: -0.1932,
      longitude: 29.8992,
      category: 'safari',
      district: 'Kasese',
      region: 'Western',
    ),
    LocationModel(
      id: 'ug_murchison',
      title: 'Murchison Falls National Park',
      address: 'Paraa Ferry Crossing, Masindi / Nwoya District',
      city: 'Masindi',
      latitude: 2.2775,
      longitude: 31.6853,
      category: 'safari',
      district: 'Nwoya',
      region: 'Northern',
    ),
    LocationModel(
      id: 'ug_kidepo',
      title: 'Kidepo Valley National Park',
      address: 'Apoka Tourism Centre, Kaabong District, Karamoja',
      city: 'Kaabong',
      latitude: 3.7261,
      longitude: 33.7492,
      category: 'safari',
      district: 'Kaabong',
      region: 'Northern',
    ),
  ];
}
