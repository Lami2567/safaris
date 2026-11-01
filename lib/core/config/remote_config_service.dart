import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/location_model.dart';
import '../network/api_client.dart';
import 'environment_config.dart';

enum AppServiceType {
  rides,
  airportPickup,
  tourism,
  tourGuides,
  delivery,
  hotelBooking,
  carRental,
}

class QuickPlaceConfig {
  final String id;
  final String title;
  final String? subtitle;
  final double latitude;
  final double longitude;
  final String city;

  const QuickPlaceConfig({
    required this.id,
    required this.title,
    this.subtitle,
    required this.latitude,
    required this.longitude,
    this.city = 'Uganda',
  });

  LocationModel toLocationModel() {
    return LocationModel(
      id: id,
      title: title,
      address: subtitle != null && subtitle!.isNotEmpty ? subtitle! : title,
      city: city,
      latitude: latitude,
      longitude: longitude,
    );
  }

  factory QuickPlaceConfig.fromJson(Map<String, dynamic> json) {
    return QuickPlaceConfig(
      id: json['id']?.toString() ?? 'place_${DateTime.now().millisecondsSinceEpoch}',
      title: json['title']?.toString() ?? json['name']?.toString() ?? 'Uganda Destination',
      subtitle: json['subtitle']?.toString() ?? json['region']?.toString() ?? json['city']?.toString(),
      latitude: (json['latitude'] ?? json['lat'] as num?)?.toDouble() ?? 0.3136,
      longitude: (json['longitude'] ?? json['lng'] as num?)?.toDouble() ?? 32.5811,
      city: json['city']?.toString() ?? json['region']?.toString() ?? 'Uganda',
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'subtitle': subtitle,
    'latitude': latitude,
    'longitude': longitude,
    'city': city,
  };
}

class RemoteServiceConfig {
  final AppServiceType type;
  final String id;
  final String title;
  final String subtitle;
  final String iconName;
  final String imageUrl;
  final bool isEnabled;
  final bool isNew;
  final int displayOrder;

  const RemoteServiceConfig({
    required this.type,
    required this.id,
    required this.title,
    required this.subtitle,
    required this.iconName,
    this.imageUrl = '',
    required this.isEnabled,
    this.isNew = false,
    required this.displayOrder,
  });

  RemoteServiceConfig copyWith({bool? isEnabled, int? displayOrder, String? imageUrl}) {
    return RemoteServiceConfig(
      type: type,
      id: id,
      title: title,
      subtitle: subtitle,
      iconName: iconName,
      imageUrl: imageUrl ?? this.imageUrl,
      isEnabled: isEnabled ?? this.isEnabled,
      isNew: isNew,
      displayOrder: displayOrder ?? this.displayOrder,
    );
  }

  /// Authoritative image URL for the service card (with high-res CDN fallback)
  String get effectiveImageUrl {
    if (imageUrl.trim().isNotEmpty) {
      return imageUrl.trim();
    }
    switch (type) {
      case AppServiceType.rides:
        return 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790757298938-a7b2dcfc-images.jpg';
      case AppServiceType.airportPickup:
        return 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795569261-e26390d7-images_3_.jpg';
      case AppServiceType.tourism:
        return 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795682684-8b6eccfc-lions-by-landy-on-safari.jpg';
      case AppServiceType.tourGuides:
        return 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795831699-713d1d3e-Uganda-Tour-Guides.jpg';
      case AppServiceType.delivery:
        return 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795966223-d96e63e4-images_4_.jpg';
      case AppServiceType.hotelBooking:
        return 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790796080298-71e70511-4x4-safari-land-cruisers.jpg';
      case AppServiceType.carRental:
        return 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790796080298-71e70511-4x4-safari-land-cruisers.jpg';
    }
  }
}

class PromoBannerConfig {
  final String id;
  final String headline;
  final String tag;
  final String discountText;
  final String destinationId;
  final String imagePlaceholder;
  final String imageUrl;

  const PromoBannerConfig({
    required this.id,
    required this.headline,
    required this.tag,
    required this.discountText,
    required this.destinationId,
    required this.imagePlaceholder,
    this.imageUrl = '',
  });

  /// Authoritative banner image URL (with high-res CDN fallback)
  String get effectiveImageUrl {
    if (imageUrl.trim().isNotEmpty) {
      return imageUrl.trim();
    }
    if (id.contains('entebbe') || imagePlaceholder.contains('airport') || imagePlaceholder.contains('cuisine')) {
      return 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/banners/1790794322136-2bfcab93-luwombo.jpg';
    }
    if (id.contains('murchison')) {
      return 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790750196777-b5c00805-murchison-falls-national-park-1-3.jpg';
    }
    return 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790793736631-51949ed3-park-entry-fees-bwindi.jpg';
  }
}

class VersionCheckConfig {
  final String minimumVersion;
  final String latestVersion;
  final bool forceUpdate;
  final bool recommendedUpdate;
  final String updateMessage;
  final bool maintenanceMode;
  final String maintenanceMessage;

  const VersionCheckConfig({
    required this.minimumVersion,
    required this.latestVersion,
    this.forceUpdate = false,
    this.recommendedUpdate = false,
    this.updateMessage = 'A new version of DRIVER is available.',
    this.maintenanceMode = false,
    this.maintenanceMessage = 'DRIVER is undergoing scheduled maintenance.',
  });
}

class AppPaymentMethodConfig {
  final String id;
  final String name;
  final String description;
  final bool enabled;
  final bool isOnline;
  final bool supportsCardInput;
  final int minAmountUGX;
  final int maxAmountUGX;

  const AppPaymentMethodConfig({
    required this.id,
    required this.name,
    this.description = '',
    required this.enabled,
    this.isOnline = true,
    this.supportsCardInput = false,
    this.minAmountUGX = 500,
    this.maxAmountUGX = 10000000,
  });

  factory AppPaymentMethodConfig.fromJson(Map<String, dynamic> json) {
    final id = (json['id'] ?? '').toString().toUpperCase().trim();
    return AppPaymentMethodConfig(
      id: id,
      name: (json['name'] ?? json['title'] ?? id).toString(),
      description: (json['description'] ?? '').toString(),
      enabled: json['enabled'] == true || json['isEnabled'] == true || json['enabled'] == null,
      isOnline: json['isOnline'] != false,
      supportsCardInput: id == 'CARD' || json['supportsCardInput'] == true,
      minAmountUGX: (json['minAmountUGX'] as num?)?.toInt() ?? 500,
      maxAmountUGX: (json['maxAmountUGX'] as num?)?.toInt() ?? 10000000,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'enabled': enabled,
    'isOnline': isOnline,
    'supportsCardInput': supportsCardInput,
    'minAmountUGX': minAmountUGX,
    'maxAmountUGX': maxAmountUGX,
  };
}

class AppRemoteConfigState {
  final List<RemoteServiceConfig> services;
  final List<PromoBannerConfig> banners;
  final VersionCheckConfig versionConfig;
  final Map<String, bool> featureFlags;
  final List<String> supportedCities;
  final String mapboxAccessToken;
  final Map<String, dynamic> pricing;
  final List<Map<String, dynamic>> catalogueVehicles;
  final Map<String, dynamic> servicePricingRules;
  final List<QuickPlaceConfig> quickPlaces;
  final List<AppPaymentMethodConfig> paymentMethods;

  static const List<AppPaymentMethodConfig> defaultPaymentMethods = [
    AppPaymentMethodConfig(
      id: 'MTN_MOMO',
      name: 'MTN Mobile Money',
      description: 'Instant MoMo push prompt (*165#)',
      enabled: true,
      isOnline: true,
    ),
    AppPaymentMethodConfig(
      id: 'AIRTEL_MONEY',
      name: 'Airtel Money',
      description: 'Instant Airtel Money push prompt (*185#)',
      enabled: true,
      isOnline: true,
    ),
    AppPaymentMethodConfig(
      id: 'CARD',
      name: 'Credit / Debit Card',
      description: 'Visa, MasterCard, American Express via DPO Gateway',
      enabled: true,
      isOnline: true,
      supportsCardInput: true,
    ),
    AppPaymentMethodConfig(
      id: 'WALLET',
      name: 'DRIVER Wallet',
      description: 'Pay instantly with your verified DRIVER balance',
      enabled: true,
      isOnline: true,
    ),
  ];

  static const List<QuickPlaceConfig> defaultQuickPlaces = [
    QuickPlaceConfig(id: 'dest_entebbe', title: 'Entebbe Airport', subtitle: 'Airport Corridor', latitude: 0.0444, longitude: 32.4469, city: 'Entebbe'),
    QuickPlaceConfig(id: 'dest_jinja', title: 'Jinja Nile Source', subtitle: 'Adventure Hub', latitude: 0.4356, longitude: 33.2032, city: 'Jinja'),
    QuickPlaceConfig(id: 'dest_bwindi', title: 'Bwindi Gorillas', subtitle: 'National Park', latitude: -1.0478, longitude: 29.7028, city: 'Bwindi'),
    QuickPlaceConfig(id: 'dest_murchison', title: 'Murchison Falls', subtitle: 'Safari & Wildlife', latitude: 2.2856, longitude: 31.6845, city: 'Murchison'),
    QuickPlaceConfig(id: 'dest_queen_elizabeth', title: 'Queen Elizabeth', subtitle: 'Tree Climbing Lions', latitude: -0.2289, longitude: 29.9741, city: 'Kasese'),
    QuickPlaceConfig(id: 'dest_lake_mburo', title: 'Lake Mburo', subtitle: 'Zebra Sanctuary', latitude: -0.6358, longitude: 30.9328, city: 'Kiruhura'),
  ];

  static const Map<String, dynamic> defaultPricing = {
    'boda': {'baseFare': 3000, 'perKm': 1200},
    'go': {'baseFare': 6000, 'perKm': 2200},
    'economy': {'baseFare': 6000, 'perKm': 2200},
    'comfort': {'baseFare': 10000, 'perKm': 3200},
    'safari4x4': {'baseFare': 50000, 'perKm': 6500},
    'safari': {'baseFare': 50000, 'perKm': 6500},
    'tour_van': {'baseFare': 65000, 'perKm': 7500},
  };

  const AppRemoteConfigState({
    required this.services,
    required this.banners,
    required this.versionConfig,
    required this.featureFlags,
    required this.supportedCities,
    this.mapboxAccessToken = '',
    this.pricing = defaultPricing,
    this.catalogueVehicles = const [],
    this.servicePricingRules = const {},
    this.quickPlaces = defaultQuickPlaces,
    this.paymentMethods = defaultPaymentMethods,
  });

  List<RemoteServiceConfig> get enabledServices {
    final list = services.where((s) => s.isEnabled).toList();
    list.sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
    return list;
  }

  List<AppPaymentMethodConfig> get enabledPaymentMethods =>
      paymentMethods.where((m) => m.enabled && m.id != 'CASH').toList();

  bool isPaymentMethodEnabled(String id) {
    final upper = id.toUpperCase().trim();
    if (upper == 'CASH') return false;
    return enabledPaymentMethods.any((m) => m.id == upper);
  }

  AppRemoteConfigState copyWith({
    List<RemoteServiceConfig>? services,
    List<PromoBannerConfig>? banners,
    VersionCheckConfig? versionConfig,
    Map<String, bool>? featureFlags,
    List<String>? supportedCities,
    String? mapboxAccessToken,
    Map<String, dynamic>? pricing,
    List<Map<String, dynamic>>? catalogueVehicles,
    Map<String, dynamic>? servicePricingRules,
    List<QuickPlaceConfig>? quickPlaces,
    List<AppPaymentMethodConfig>? paymentMethods,
  }) {
    return AppRemoteConfigState(
      services: services ?? this.services,
      banners: banners ?? this.banners,
      versionConfig: versionConfig ?? this.versionConfig,
      featureFlags: featureFlags ?? this.featureFlags,
      supportedCities: supportedCities ?? this.supportedCities,
      mapboxAccessToken: mapboxAccessToken ?? this.mapboxAccessToken,
      pricing: pricing ?? this.pricing,
      catalogueVehicles: catalogueVehicles ?? this.catalogueVehicles,
      servicePricingRules: servicePricingRules ?? this.servicePricingRules,
      quickPlaces: quickPlaces ?? this.quickPlaces,
      paymentMethods: paymentMethods ?? this.paymentMethods,
    );
  }
}

class RemoteConfigNotifier extends Notifier<AppRemoteConfigState> {
  static final AppRemoteConfigState _initialConfig = AppRemoteConfigState(
    services: const [
      RemoteServiceConfig(
        type: AppServiceType.rides,
        id: 'rides',
        title: 'Ride Hailing',
        subtitle: 'Boda, Cars & Comfort in Kampala',
        iconName: 'car',
        imageUrl: 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790757298938-a7b2dcfc-images.jpg',
        isEnabled: true,
        displayOrder: 1,
      ),
      RemoteServiceConfig(
        type: AppServiceType.airportPickup,
        id: 'airport_pickup',
        title: 'Airport Shuttle',
        subtitle: 'Entebbe International transfers',
        iconName: 'airplane',
        imageUrl: 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795569261-e26390d7-images_3_.jpg',
        isEnabled: true,
        displayOrder: 2,
      ),
      RemoteServiceConfig(
        type: AppServiceType.tourism,
        id: 'tourism',
        title: 'Uganda Safaris',
        subtitle: 'Gorillas, Murchison, Jinja & Parks',
        iconName: 'compass',
        imageUrl: 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795682684-8b6eccfc-lions-by-landy-on-safari.jpg',
        isEnabled: true,
        displayOrder: 3,
      ),
      RemoteServiceConfig(
        type: AppServiceType.tourGuides,
        id: 'tour_guides',
        title: 'Tour Guides',
        subtitle: 'Certified Ugandan guides on demand',
        iconName: 'badge',
        imageUrl: 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795831699-713d1d3e-Uganda-Tour-Guides.jpg',
        isEnabled: true,
        displayOrder: 4,
      ),
      RemoteServiceConfig(
        type: AppServiceType.delivery,
        id: 'delivery',
        title: 'Express Delivery',
        subtitle: 'Packages, parcels & documents',
        iconName: 'box',
        imageUrl: 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795966223-d96e63e4-images_4_.jpg',
        isEnabled: true,
        displayOrder: 5,
      ),
      RemoteServiceConfig(
        type: AppServiceType.hotelBooking,
        id: 'hotel_booking',
        title: 'Safari Lodges',
        subtitle: 'Eco-lodges & hotels booking',
        iconName: 'hotel',
        imageUrl: 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790796080298-71e70511-4x4-safari-land-cruisers.jpg',
        isEnabled: false,
        isNew: true,
        displayOrder: 6,
      ),
      RemoteServiceConfig(
        type: AppServiceType.carRental,
        id: 'car_rental',
        title: '4x4 Self-Drive',
        subtitle: 'Land Cruisers with rooftop tents',
        iconName: 'truck',
        imageUrl: 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790796080298-71e70511-4x4-safari-land-cruisers.jpg',
        isEnabled: false,
        isNew: true,
        displayOrder: 7,
      ),
    ],
    banners: const [
      PromoBannerConfig(
        id: 'bwindi_promo',
        headline: 'Bwindi Gorilla Trekking',
        tag: 'SPECIAL SAFARI',
        discountText: 'Save 15% on Permits & Guides',
        destinationId: 'dest_bwindi',
        imagePlaceholder: 'bwindi',
        imageUrl: 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790793736631-51949ed3-park-entry-fees-bwindi.jpg',
      ),
      PromoBannerConfig(
        id: 'entebbe_express',
        headline: 'Entebbe Airport Express',
        tag: 'AIRPORT RIDE',
        discountText: 'Flat UGX 110,000 from Kampala',
        destinationId: 'dest_entebbe',
        imagePlaceholder: 'airport',
        imageUrl: 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/banners/1790794322136-2bfcab93-luwombo.jpg',
      ),
      PromoBannerConfig(
        id: 'murchison_safari',
        headline: 'Murchison Falls 2-Day Safari',
        tag: 'POPULAR TOUR',
        discountText: 'Exclusive 4x4 Prado with Ranger',
        destinationId: 'dest_murchison',
        imagePlaceholder: 'murchison',
        imageUrl: 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790750196777-b5c00805-murchison-falls-national-park-1-3.jpg',
      ),
    ],
    versionConfig: const VersionCheckConfig(
      minimumVersion: '1.0.0',
      latestVersion: '1.0.0',
      forceUpdate: false,
      recommendedUpdate: false,
    ),
    featureFlags: const {
      'instant_mobile_money_pay': true,
      'boda_rides_enabled': true,
      'night_rides_surcharge': false,
      'custom_guide_selection': true,
      'split_fare': false,
    },
    supportedCities: const [
      'Kampala',
      'Entebbe',
      'Jinja',
      'Mbarara',
      'Fort Portal',
      'Gulu',
    ],
  );

  @override
  AppRemoteConfigState build() {
    // Schedule asynchronous sync from backend API Gateway
    Future.microtask(() => fetchFromBackend());
    return _initialConfig;
  }

  Future<void> fetchFromBackend() async {
    try {
      final client = ApiClient();
      final response = await client.get<Map<String, dynamic>>('/app-config');
      if (response.success && response.data != null) {
        final data = response.data!;
        
        // 1. Parse services
        final rawServices = data['services'] as List<dynamic>?;
        List<RemoteServiceConfig>? parsedServices;
        if (rawServices != null) {
          parsedServices = rawServices.map((item) {
            final map = item as Map<String, dynamic>;
            final id = map['id']?.toString() ?? '';
            final rawType = map['type']?.toString() ?? '';
            AppServiceType sType = AppServiceType.rides;
            if (rawType == 'rides' || id == 'rides' || id.contains('boda') || id.contains('comfort')) {
              sType = AppServiceType.rides;
            } else if (rawType == 'airportPickup' || rawType == 'airport_pickup' || id.contains('airport')) {
              sType = AppServiceType.airportPickup;
            } else if (rawType == 'tourGuides' || rawType == 'tour_guides' || id == 'tour_guides') {
              sType = AppServiceType.tourGuides;
            } else if (rawType == 'tourism' || id == 'tourism' || id.contains('safari')) {
              sType = AppServiceType.tourism;
            } else if (rawType == 'delivery' || id.contains('delivery') || id.contains('package')) {
              sType = AppServiceType.delivery;
            } else if (rawType == 'hotelBooking' || rawType == 'hotel_booking' || id.contains('hotel') || id.contains('lodge')) {
              sType = AppServiceType.hotelBooking;
            } else if (rawType == 'carRental' || rawType == 'car_rental' || id.contains('rental') || id.contains('hire')) {
              sType = AppServiceType.carRental;
            }

            final dynamic rawEnabled = map['enabled'] ?? map['isEnabled'];
            final bool isServiceEnabled = rawEnabled == true || rawEnabled == 1 || rawEnabled == 'true';

            return RemoteServiceConfig(
              type: sType,
              id: id,
              title: map['title']?.toString() ?? 'Service',
              subtitle: map['subtitle']?.toString() ?? '',
              iconName: map['icon']?.toString() ?? 'car',
              imageUrl: map['imageUrl']?.toString() ?? map['image_url']?.toString() ?? map['image']?.toString() ?? '',
              isEnabled: isServiceEnabled,
              displayOrder: (map['displayOrder'] as num?)?.toInt() ?? (map['order'] as num?)?.toInt() ?? 0,
            );
          }).toList();
        }

        // 2. Parse promo banners
        final rawBanners = data['banners'] as List<dynamic>?;
        List<PromoBannerConfig>? parsedBanners;
        if (rawBanners != null) {
          parsedBanners = rawBanners.where((b) {
            final active = (b as Map<String, dynamic>)['active'];
            return active == null || active == true || active == 1 || active == 'true';
          }).map((item) {
            final map = item as Map<String, dynamic>;
            final titleStr = map['title']?.toString().trim();
            final headlineStr = map['headline']?.toString().trim();
            final headline = (titleStr != null && titleStr.isNotEmpty)
                ? titleStr
                : (headlineStr != null && headlineStr.isNotEmpty ? headlineStr : 'Special Safari');

            final subStr = map['subtitle']?.toString().trim();
            final discStr = map['discountText']?.toString().trim();
            final discountText = (subStr != null && subStr.isNotEmpty)
                ? subStr
                : (discStr ?? '');

            final actStr = map['actionValue']?.toString().trim();
            final destStr = map['destinationId']?.toString().trim();
            final actionVal = (actStr != null && actStr.isNotEmpty)
                ? actStr
                : (destStr ?? '');

            final img1 = map['imageUrl']?.toString().trim();
            final img2 = map['image']?.toString().trim();
            final img = (img1 != null && img1.isNotEmpty) ? img1 : (img2 ?? '');

            final tagStr = map['tag']?.toString().trim();
            final tag = (tagStr != null && tagStr.isNotEmpty) ? tagStr : 'SPECIAL SAFARI';

            return PromoBannerConfig(
              id: map['id']?.toString() ?? '',
              headline: headline,
              tag: tag,
              discountText: discountText,
              destinationId: actionVal,
              imagePlaceholder: img.isNotEmpty ? img : 'safari',
              imageUrl: img,
            );
          }).toList();
        }

        // 3. Parse features
        final rawFeatures = data['features'] as Map<String, dynamic>?;
        Map<String, bool>? parsedFeatures;
        if (rawFeatures != null) {
          parsedFeatures = rawFeatures.map((k, v) => MapEntry(k, v == true));
        }

        // 4. Parse version config
        final rawVersion = data['versionConfig'] as Map<String, dynamic>?;
        VersionCheckConfig? parsedVersion;
        if (rawVersion != null) {
          parsedVersion = VersionCheckConfig(
            minimumVersion: rawVersion['minVersion']?.toString() ?? '1.0.0',
            latestVersion: rawVersion['latestVersion']?.toString() ?? '1.0.0',
            forceUpdate: rawVersion['forceUpdate'] == true,
            maintenanceMode: rawVersion['maintenanceMode'] == true,
            maintenanceMessage: rawVersion['maintenanceMessage']?.toString() ?? 'Maintenance mode active.',
          );
        }

        // 5. Parse mapbox access token
        final rawRemote = data['mapboxAccessToken']?.toString() ??
            data['mapboxToken']?.toString() ??
            data['MAPBOX_ACCESS_TOKEN']?.toString();
        final remoteToken = (rawRemote != null && rawRemote.trim().isNotEmpty) ? rawRemote.trim() : null;
        final effectiveToken = remoteToken ?? EnvironmentConfig.mapboxAccessToken;

        if (remoteToken != null) {
          await EnvironmentConfig.saveMapboxToken(remoteToken);
        } else if (EnvironmentConfig.hasMapboxToken) {
          // If local device has a saved token, sync it up to backend database so it's permanent
          try {
            ApiClient().put('/app-config', body: {'mapboxAccessToken': EnvironmentConfig.mapboxAccessToken});
          } catch (_) {}
        }

        // 6. Parse pricing matrix from backend
        final rawPricing = data['pricing'] as Map<String, dynamic>? ??
            data['pricingMatrix'] as Map<String, dynamic>?;
        Map<String, dynamic>? parsedPricing;
        if (rawPricing != null) {
          parsedPricing = Map<String, dynamic>.from(rawPricing);
        }

        // 7. Parse homescreen quick places from backend
        final rawPlaces = data['quickPlaces'] as List<dynamic>? ?? data['quick_places'] as List<dynamic>?;
        List<QuickPlaceConfig>? parsedQuickPlaces;
        if (rawPlaces != null && rawPlaces.isNotEmpty) {
          parsedQuickPlaces = rawPlaces.map((p) => QuickPlaceConfig.fromJson(Map<String, dynamic>.from(p as Map))).toList();
        }

        // 8. Parse payment methods configured by Admin (Single Source of Truth)
        final rawPaymentMethods = data['paymentMethods'] as List<dynamic>?;
        List<AppPaymentMethodConfig>? parsedPaymentMethods;
        if (rawPaymentMethods != null && rawPaymentMethods.isNotEmpty) {
          parsedPaymentMethods = rawPaymentMethods
              .map((m) => AppPaymentMethodConfig.fromJson(Map<String, dynamic>.from(m as Map)))
              .where((m) => m.id != 'CASH')
              .toList();
        }

        // 9. Parse centralized vehicle catalogue & service pricing rules
        final rawCatVehicles = data['catalogueVehicles'] as List<dynamic>?;
        List<Map<String, dynamic>>? parsedCatVehicles;
        if (rawCatVehicles != null) {
          parsedCatVehicles = rawCatVehicles
              .whereType<Map>()
              .map((m) => Map<String, dynamic>.from(m))
              .toList();
        }

        final rawServiceRules = data['servicePricingRules'] as Map<String, dynamic>?;
        Map<String, dynamic>? parsedServiceRules;
        if (rawServiceRules != null) {
          parsedServiceRules = Map<String, dynamic>.from(rawServiceRules);
        }

        state = state.copyWith(
          services: parsedServices,
          banners: parsedBanners,
          featureFlags: parsedFeatures,
          versionConfig: parsedVersion,
          mapboxAccessToken: effectiveToken,
          pricing: parsedPricing ?? state.pricing,
          catalogueVehicles: parsedCatVehicles ?? state.catalogueVehicles,
          servicePricingRules: parsedServiceRules ?? state.servicePricingRules,
          quickPlaces: parsedQuickPlaces ?? state.quickPlaces,
          paymentMethods: parsedPaymentMethods ?? state.paymentMethods,
        );
      }
    } catch (e) {
      debugPrint('[RemoteConfigNotifier fetchFromBackend Error]: $e');
    }
  }

  Future<void> updatePricing(Map<String, dynamic> newPricing) async {
    state = state.copyWith(pricing: newPricing);
    try {
      await ApiClient().put('/admin/pricing', body: newPricing);
      await ApiClient().put('/app-config', body: {'pricing_matrix': newPricing});
    } catch (e) {
      debugPrint('[RemoteConfigNotifier updatePricing Error]: $e');
    }
  }

  void toggleService(String serviceId, bool isEnabled) {
    state = state.copyWith(
      services: state.services.map((s) {
        if (s.id == serviceId) {
          return s.copyWith(isEnabled: isEnabled);
        }
        return s;
      }).toList(),
    );
  }

  void toggleFeatureFlag(String key, bool value) {
    final updated = Map<String, bool>.from(state.featureFlags);
    updated[key] = value;
    state = state.copyWith(featureFlags: updated);
  }

  void updateMaintenanceMode(bool isMaintenance) {
    state = state.copyWith(
      versionConfig: VersionCheckConfig(
        minimumVersion: state.versionConfig.minimumVersion,
        latestVersion: state.versionConfig.latestVersion,
        forceUpdate: state.versionConfig.forceUpdate,
        recommendedUpdate: state.versionConfig.recommendedUpdate,
        maintenanceMode: isMaintenance,
      ),
    );
  }
}

final remoteConfigProvider =
    NotifierProvider<RemoteConfigNotifier, AppRemoteConfigState>(RemoteConfigNotifier.new);
