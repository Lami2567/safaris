import '../../../shared/models/location_model.dart';

class RichContentBlockModel {
  final String id;
  final String type; // 'heading' | 'paragraph' | 'image' | 'video' | 'audio' | 'list' | 'quote' | 'link'
  final String text;
  final String url;
  final String title;
  final String caption;
  final List<String> items;
  final int order;

  const RichContentBlockModel({
    required this.id,
    required this.type,
    this.text = '',
    this.url = '',
    this.title = '',
    this.caption = '',
    this.items = const [],
    this.order = 0,
  });

  factory RichContentBlockModel.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    final List<String> parsedItems = rawItems is List
        ? rawItems.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList()
        : [];
    return RichContentBlockModel(
      id: (json['id'] ?? '').toString(),
      type: (json['type'] ?? 'paragraph').toString(),
      text: (json['text'] ?? '').toString(),
      url: (json['url'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      caption: (json['caption'] ?? '').toString(),
      items: parsedItems,
      order: (json['order'] as num?)?.toInt() ?? 0,
    );
  }
}

class TouristPricingTierModel {
  final int minTourists;
  final int maxTourists;
  final double priceUgx;
  final String pricingMode; // 'PER_PERSON' | 'GROUP_TOTAL'
  final double extraPersonChargeUgx;
  final String notes;

  const TouristPricingTierModel({
    required this.minTourists,
    required this.maxTourists,
    required this.priceUgx,
    this.pricingMode = 'PER_PERSON',
    this.extraPersonChargeUgx = 0,
    this.notes = '',
  });

  factory TouristPricingTierModel.fromJson(Map<String, dynamic> json) {
    return TouristPricingTierModel(
      minTourists: (json['minTourists'] ?? json['min_tourists'] as num?)?.toInt() ?? 1,
      maxTourists: (json['maxTourists'] ?? json['max_tourists'] as num?)?.toInt() ?? 10,
      priceUgx: (json['priceUgx'] ?? json['price_ugx'] as num?)?.toDouble() ?? 0,
      pricingMode: (json['pricingMode'] ?? json['pricing_mode'] ?? 'PER_PERSON').toString(),
      extraPersonChargeUgx: (json['extraPersonChargeUgx'] as num?)?.toDouble() ?? 0,
      notes: (json['notes'] ?? '').toString(),
    );
  }
}

class DestinationModel {
  final String id;
  final String title;
  final String subtitle;
  final String country;
  final String region;
  final String district;
  final String locationAddress;
  final String shortDescription;
  final String description;
  final List<RichContentBlockModel> contentBlocks;
  final List<String> highlights;
  final List<String> activities;
  final List<String> inclusions;
  final List<String> exclusions;
  final String bestTimeToVisit;
  final int distanceHoursFromKampala;
  final String recommendedDuration;
  final String heroTag;
  final double latitude;
  final double longitude;
  final String imageUrl;
  final List<String> galleryImages;
  final double rating;
  final String category;
  final double basePriceUgx;
  final List<TouristPricingTierModel> touristPricingTiers;
  final List<String> assignedVehicleIds;
  final List<String> assignedGuideIds;
  final bool bookingAvailable;
  final String publicationStatus;
  final int displayOrder;
  final int contentVersion;

  const DestinationModel({
    required this.id,
    required this.title,
    required this.subtitle,
    this.country = 'Uganda',
    required this.region,
    this.district = '',
    this.locationAddress = '',
    this.shortDescription = '',
    required this.description,
    this.contentBlocks = const [],
    required this.highlights,
    this.activities = const [],
    this.inclusions = const [],
    this.exclusions = const [],
    required this.bestTimeToVisit,
    required this.distanceHoursFromKampala,
    this.recommendedDuration = '3 Days / 2 Nights',
    required this.heroTag,
    this.latitude = 0.3136,
    this.longitude = 32.5811,
    this.imageUrl = '',
    this.galleryImages = const [],
    this.rating = 4.9,
    this.category = 'national_park',
    this.basePriceUgx = 0,
    this.touristPricingTiers = const [],
    this.assignedVehicleIds = const [],
    this.assignedGuideIds = const [],
    this.bookingAvailable = true,
    this.publicationStatus = 'PUBLISHED',
    this.displayOrder = 0,
    this.contentVersion = 1,
  });

  /// Returns the configured image URL from admin panel (Cloudflare R2)
  String get effectiveImageUrl {
    return imageUrl.trim();
  }

  LocationModel toLocationModel() {
    return LocationModel(
      id: id,
      title: title,
      address: '$subtitle, $region',
      latitude: latitude,
      longitude: longitude,
      city: region,
    );
  }

  /// Offline cache fallback only used when device has no connectivity to API
  static const List<DestinationModel> sampleDestinations = [
    DestinationModel(
      id: 'dest_murchison',
      title: 'Murchison Falls National Park',
      subtitle: 'Uganda’s Largest Savanna & Dramatic Falls',
      region: 'North-Western Uganda',
      description:
          'Witness the world’s most powerful surge of water where the Nile squeezes through a 7-meter gorge. Home to 76 mammal species including lions, leopards, elephants, and Rothschild giraffes.',
      highlights: [
        'Top of the Falls Hike',
        'Nile River Boat Cruise',
        'Big 4 Game Drives',
        'Delta Point Birding',
      ],
      bestTimeToVisit: 'December to February, June to September',
      distanceHoursFromKampala: 5,
      heroTag: 'THE NILE SURGE',
      latitude: 2.2742,
      longitude: 31.7828,
      imageUrl:
          'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790750196777-b5c00805-murchison-falls-national-park-1-3.jpg',
      rating: 4.95,
      category: 'national_park',
      basePriceUgx: 850000,
    ),
    DestinationModel(
      id: 'dest_bwindi',
      title: 'Bwindi Impenetrable Forest National Park',
      subtitle: 'Prime Mountain Gorilla Trekking Sanctuary',
      region: 'South-Western Uganda',
      description:
          'Ancient, Afro-montane rainforest sheltering over 450 mountain gorillas—nearly half the world’s remaining population. UNESCO World Heritage Site with unparalleled biodiversity.',
      highlights: [
        'Gorilla Trekking Buhoma & Rushaga',
        'Batwa Pygmy Cultural Trail',
        'Munyaga River Falls',
        'Bird Watching (350+ species)',
      ],
      bestTimeToVisit: 'June to August, December to February',
      distanceHoursFromKampala: 8,
      heroTag: 'GORILLA SANCTUARY',
      latitude: -1.0494,
      longitude: 29.6896,
      imageUrl:
          'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790793736631-51949ed3-park-entry-fees-bwindi.jpg',
      rating: 4.98,
      category: 'national_park',
      basePriceUgx: 1500000,
    ),
    DestinationModel(
      id: 'dest_mgahinga',
      title: 'Mgahinga Gorilla National Park',
      subtitle: 'Where Gold Meets Silver in the Virunga Volcanoes',
      region: 'South-Western Uganda (Kisoro)',
      description:
          'High-altitude volcanic peaks bordering Rwanda and DR Congo, home to endangered mountain gorillas and golden monkeys.',
      highlights: [
        'Golden Monkey Tracking',
        'Nyakagezi Gorilla Family Trek',
        'Mount Sabinyo Volcano Summit',
      ],
      bestTimeToVisit: 'June to August, December to February',
      distanceHoursFromKampala: 9,
      heroTag: 'VIRUNGA PEAKS',
      latitude: -1.3650,
      longitude: 29.6300,
      imageUrl:
          'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/mgahinga-gorilla-park.jpg',
      rating: 4.92,
      category: 'national_park',
      basePriceUgx: 1200000,
    ),
    DestinationModel(
      id: 'dest_kibale',
      title: 'Kibale Forest National Park',
      subtitle: 'Primate Capital of the World',
      region: 'Western Uganda (Fort Portal)',
      description:
          'Lush tropical rainforest hosting 13 primate species including over 1,500 wild chimpanzees and Bigodi Wetland Sanctuary.',
      highlights: [
        'Chimpanzee Habituation Experience',
        'Bigodi Swamp Walk',
        'Nocturnal Forest Walk',
      ],
      bestTimeToVisit: 'December to February, June to September',
      distanceHoursFromKampala: 5,
      heroTag: 'PRIMATE CAPITAL',
      latitude: 0.4867,
      longitude: 30.3883,
      imageUrl:
          'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/kibale-chimpanzee-park.jpg',
      rating: 4.94,
      category: 'national_park',
      basePriceUgx: 900000,
    ),
    DestinationModel(
      id: 'dest_queen_elizabeth',
      title: 'Queen Elizabeth National Park',
      subtitle: 'Tree-Climbing Lions & Kazinga Channel',
      region: 'Western Uganda (Kasese)',
      description:
          'Uganda’s most popular savanna reserve featuring crater lakes, Kazinga Channel hippos, and Ishasha tree-climbing lions.',
      highlights: [
        'Kazinga Channel Boat Launch',
        'Ishasha Tree-Climbing Lions',
        'Kyambura Gorge Chimps',
      ],
      bestTimeToVisit: 'January to February, June to July',
      distanceHoursFromKampala: 6,
      heroTag: 'KAZINGA WILDLIFE',
      latitude: -0.1972,
      longitude: 30.0028,
      imageUrl:
          'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/queen-elizabeth-park.jpg',
      rating: 4.93,
      category: 'national_park',
      basePriceUgx: 950000,
    ),
    DestinationModel(
      id: 'dest_lake_mburo',
      title: 'Lake Mburo National Park',
      subtitle: 'Whispers of the Wild — Closest Savanna to Kampala',
      region: 'Western Uganda (Kiruhura)',
      description:
          'Compact acacia woodland and wetland park famous for zebras, impalas, elands, and guided walking/horseback safaris.',
      highlights: [
        'Guided Walking Safari',
        'Zebra & Giraffe Viewing',
        'Lake Mburo Boat Trip',
      ],
      bestTimeToVisit: 'June to August, December to February',
      distanceHoursFromKampala: 4,
      heroTag: 'ACACIA SAVANNA',
      latitude: -0.6066,
      longitude: 30.9547,
      imageUrl:
          'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/lake-mburo-park.jpg',
      rating: 4.89,
      category: 'national_park',
      basePriceUgx: 650000,
    ),
  ];
}

class TourPackageModel {
  final String id;
  final String destinationId;
  final String title;
  final int durationDays;
  final double pricePerPersonUGX;
  final String groupType;
  final String description;
  final List<RichContentBlockModel> contentBlocks;
  final List<String> inclusions;
  final List<String> exclusions;
  final List<String> itinerarySummary;
  final List<TouristPricingTierModel> touristPricingTiers;
  final List<String> assignedVehicleIds;
  final List<String> assignedGuideIds;
  final String imageUrl;
  final bool bookingAvailable;
  final String publicationStatus;
  final int contentVersion;

  const TourPackageModel({
    required this.id,
    required this.destinationId,
    required this.title,
    required this.durationDays,
    required this.pricePerPersonUGX,
    required this.groupType,
    this.description = '',
    this.contentBlocks = const [],
    required this.inclusions,
    this.exclusions = const [],
    required this.itinerarySummary,
    this.touristPricingTiers = const [],
    this.assignedVehicleIds = const [],
    this.assignedGuideIds = const [],
    this.imageUrl = '',
    this.bookingAvailable = true,
    this.publicationStatus = 'PUBLISHED',
    this.contentVersion = 1,
  });

  /// Returns configured image URL from admin panel
  String get effectiveImageUrl {
    return imageUrl.trim();
  }

  /// Offline fallback only used if API cannot be reached
  static const List<TourPackageModel> samplePackages = [
    TourPackageModel(
      id: 'pkg_bwindi_3d',
      destinationId: 'dest_bwindi',
      title: '3-Day Bwindi Ultimate Gorilla Trekking',
      durationDays: 3,
      pricePerPersonUGX: 2800000,
      groupType: 'Small Group (Max 6)',
      inclusions: [
        'UWA Mountain Gorilla Tracking Permit',
        'Safari 4x4 Land Cruiser with pop-up roof',
        'Certified English/French speaking Safari Guide',
      ],
      itinerarySummary: [
        'Day 1: Kampala to Bwindi via Equator Monument & Mbarara',
        'Day 2: Gorilla Trekking in Buhoma Rainforest & Community Walk',
        'Day 3: Scenic return to Kampala or Entebbe Airport drop-off',
      ],
      imageUrl:
          'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790793736631-51949ed3-park-entry-fees-bwindi.jpg',
    ),
    TourPackageModel(
      id: 'pkg_murchison_2d',
      destinationId: 'dest_murchison',
      title: '2-Day Murchison Falls & Nile Boat Safari',
      durationDays: 2,
      pricePerPersonUGX: 1450000,
      groupType: 'Private 4x4 Safari',
      inclusions: [
        'Park Entry Fees & Ferry Crossing',
        'Bottom of the Falls Boat Cruise',
        'Safari 4x4 Land Cruiser & Professional Guide',
      ],
      itinerarySummary: [
        'Day 1: Kampala to Murchison Falls & Top of the Falls Hike',
        'Day 2: Morning Game Drive, Nile Launch Cruise & Return',
      ],
      imageUrl:
          'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790750196777-b5c00805-murchison-falls-national-park-1-3.jpg',
    ),
    TourPackageModel(
      id: 'pkg_jinja_1d',
      destinationId: 'dest_lake_mburo',
      title: '1-Day Lake Mburo Wildlife & Walking Safari',
      durationDays: 1,
      pricePerPersonUGX: 420000,
      groupType: 'Day Excursion',
      inclusions: [
        'UWA Park Entry & Ranger Walking Permit',
        'Equator Stopover & Lunch in Mbarara/Lyantonde',
        '4x4 Safari Vehicle Transport',
      ],
      itinerarySummary: [
        'Day 1: Early departure from Kampala, Equator stop, Game Drive & Boat Cruise',
      ],
      imageUrl:
          'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/lake-mburo-park.jpg',
    ),
  ];
}

class TourGuideModel {
  final String id;
  final String fullName;
  final String title;
  final double rating;
  final int reviewsCount;
  final int expeditionsCount;
  final List<String> languages;
  final List<String> specialties;
  final double dailyRateUGX;
  final double multiDayRateUGX;
  final double fixedTourFeeUGX;
  final double groupSizeSurchargeUGX;
  final bool isUwaCertified;
  final bool isAvailable;
  final String bio;
  final String avatarUrl;

  const TourGuideModel({
    required this.id,
    required this.fullName,
    required this.title,
    required this.rating,
    required this.reviewsCount,
    required this.expeditionsCount,
    required this.languages,
    required this.specialties,
    required this.dailyRateUGX,
    this.multiDayRateUGX = 0,
    this.fixedTourFeeUGX = 0,
    this.groupSizeSurchargeUGX = 0,
    required this.isUwaCertified,
    this.isAvailable = true,
    required this.bio,
    this.avatarUrl = '',
  });

  static const List<TourGuideModel> sampleGuides = [
    TourGuideModel(
      id: 'gd_01',
      fullName: 'Patrick Mukasa',
      title: 'Senior Primate & Gorilla Specialist',
      rating: 4.98,
      reviewsCount: 146,
      expeditionsCount: 310,
      languages: ['English', 'Luganda', 'Rukiga', 'French'],
      specialties: ['Bwindi Gorillas', 'Birding', 'Nature Photography'],
      dailyRateUGX: 180000,
      isUwaCertified: true,
      bio: 'Patrick has 12 years of experience guiding visitors through Bwindi and Mgahinga.',
      avatarUrl: '',
    ),
  ];
}

class PriceBreakdownItemModel {
  final String label;
  final double amountUgx;
  final String? details;

  const PriceBreakdownItemModel({
    required this.label,
    required this.amountUgx,
    this.details,
  });

  factory PriceBreakdownItemModel.fromJson(Map<String, dynamic> json) {
    return PriceBreakdownItemModel(
      label: (json['label'] ?? 'Charge').toString(),
      amountUgx: (json['amountUgx'] as num?)?.toDouble() ?? 0,
      details: json['details']?.toString(),
    );
  }
}

class ServerPriceQuotationModel {
  final String quotationId;
  final String serviceType;
  final int pricingVersion;
  final double subtotalUgx;
  final double totalAmountUgx;
  final List<PriceBreakdownItemModel> breakdown;

  const ServerPriceQuotationModel({
    required this.quotationId,
    required this.serviceType,
    required this.pricingVersion,
    required this.subtotalUgx,
    required this.totalAmountUgx,
    required this.breakdown,
  });

  factory ServerPriceQuotationModel.fromJson(Map<String, dynamic> json) {
    final rawBreakdown = json['breakdown'];
    final List<PriceBreakdownItemModel> parsedBreakdown = rawBreakdown is List
        ? rawBreakdown
            .map((b) => PriceBreakdownItemModel.fromJson(Map<String, dynamic>.from(b as Map)))
            .toList()
        : [];
    return ServerPriceQuotationModel(
      quotationId: (json['quotationId'] ?? json['id'] ?? '').toString(),
      serviceType: (json['serviceType'] ?? 'TOUR').toString(),
      pricingVersion: (json['pricingVersion'] as num?)?.toInt() ?? 1,
      subtotalUgx: (json['subtotalUgx'] ?? json['totalPriceUgx'] as num?)?.toDouble() ?? 0,
      totalAmountUgx: (json['totalPriceUgx'] ?? json['totalAmountUgx'] ?? json['total_price_ugx'] as num?)?.toDouble() ?? 0,
      breakdown: parsedBreakdown,
    );
  }
}
