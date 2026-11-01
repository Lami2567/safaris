import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../models/tourism_model.dart';

class TourismApiService {
  final ApiClient _client = ApiClient();

  static List<String> _parseStringList(dynamic raw) {
    if (raw is List) {
      return raw.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
    }
    if (raw is String && raw.isNotEmpty) {
      return raw
          .split(RegExp(r'[\n,]'))
          .map((e) => e.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    }
    return [];
  }

  static List<RichContentBlockModel> _parseBlocks(dynamic raw) {
    if (raw is List) {
      return raw
          .whereType<Map>()
          .map((m) => RichContentBlockModel.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    }
    return [];
  }

  static List<TouristPricingTierModel> _parseTiers(dynamic raw) {
    if (raw is List) {
      return raw
          .whereType<Map>()
          .map((m) => TouristPricingTierModel.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    }
    return [];
  }

  static DestinationModel _mapJsonToDestination(Map<String, dynamic> map) {
    final lat = (map['lat'] ?? map['latitude'] as num?)?.toDouble() ?? 0.3136;
    final lng = (map['lng'] ?? map['longitude'] as num?)?.toDouble() ?? 32.5811;
    final name = map['name']?.toString().trim();
    final rawTitle = map['title']?.toString().trim();
    final title = (name != null && name.isNotEmpty)
        ? name
        : ((rawTitle != null && rawTitle.isNotEmpty) ? rawTitle : 'Uganda Safari');

    final rawCategory = map['category']?.toString();
    final category = (rawCategory != null && rawCategory.isNotEmpty)
        ? rawCategory.replaceAll('_', ' ').toUpperCase()
        : null;
    final rawSubtitle = (map['shortDescription'] ?? map['short_description'] ?? map['subtitle'])?.toString().trim();
    final subtitle = (rawSubtitle != null && rawSubtitle.isNotEmpty)
        ? rawSubtitle
        : (category ?? 'SAFARI DESTINATION');

    final distStr = map['distance_hours_from_kampala']?.toString() ?? map['distanceFromKampala']?.toString() ?? '5';
    final hours = int.tryParse(distStr.replaceAll(RegExp(r'[^0-9]'), '')) ?? 5;
    final heroTag = (map['hero_tag']?.toString().trim().isNotEmpty ?? false)
        ? map['hero_tag'].toString().trim().toUpperCase()
        : (category ?? 'NATIONAL PARK');
    final rawRegion = map['region']?.toString().trim();
    final region = (rawRegion != null && rawRegion.isNotEmpty) ? rawRegion : 'Uganda';

    final rawDestImg = (map['imageUrl'] ?? map['image_placeholder'] ?? map['image'] ?? map['photo'] ?? map['coverImage'] ?? map['heroImage'] ?? map['thumbnail'])?.toString().trim();
    final destId = map['id']?.toString() ?? '';
    final destImg = (rawDestImg != null && rawDestImg.isNotEmpty) ? rawDestImg : '';
    final rating = (map['rating'] as num?)?.toDouble() ?? 4.9;
    final basePrice = (map['basePriceUgx'] ?? map['base_price_ugx'] as num?)?.toDouble() ?? 0.0;

    return DestinationModel(
      id: destId,
      title: title,
      subtitle: subtitle,
      country: map['country']?.toString() ?? 'Uganda',
      region: region,
      district: map['district']?.toString() ?? '',
      locationAddress: map['locationAddress']?.toString() ?? map['location_address']?.toString() ?? '',
      shortDescription: map['shortDescription']?.toString() ?? map['short_description']?.toString() ?? '',
      description: map['description']?.toString() ?? '',
      contentBlocks: _parseBlocks(map['contentBlocks'] ?? map['content_blocks']),
      highlights: _parseStringList(map['highlights']),
      activities: _parseStringList(map['activities']),
      inclusions: _parseStringList(map['inclusions']),
      exclusions: _parseStringList(map['exclusions']),
      bestTimeToVisit: map['best_time_to_visit']?.toString() ?? map['bestTimeToVisit']?.toString() ?? 'Year-round',
      distanceHoursFromKampala: hours,
      recommendedDuration: map['recommendedDuration']?.toString() ?? map['recommended_duration']?.toString() ?? '3 Days / 2 Nights',
      heroTag: heroTag,
      latitude: lat,
      longitude: lng,
      imageUrl: destImg,
      galleryImages: _parseStringList(map['galleryImages'] ?? map['gallery_images']),
      rating: rating,
      category: rawCategory ?? 'national_park',
      basePriceUgx: basePrice,
      touristPricingTiers: _parseTiers(map['touristPricingTiers'] ?? map['tourist_pricing_tiers']),
      assignedVehicleIds: _parseStringList(map['assignedVehicleIds'] ?? map['assigned_vehicle_ids']),
      assignedGuideIds: _parseStringList(map['assignedGuideIds'] ?? map['assigned_guide_ids']),
      bookingAvailable: map['bookingAvailable'] != false && map['booking_available'] != false,
      publicationStatus: (map['publicationStatus'] ?? map['publication_status'] ?? 'PUBLISHED').toString(),
      displayOrder: (map['displayOrder'] ?? map['display_order'] as num?)?.toInt() ?? 0,
      contentVersion: (map['contentVersion'] ?? map['content_version'] as num?)?.toInt() ?? 1,
    );
  }

  static TourPackageModel _mapJsonToPackage(Map<String, dynamic> map) {
    final price = (map['price_per_person_ugx'] ?? map['priceUgx'] as num?)?.toDouble() ?? 0.0;
    final duration = (map['duration_days'] ?? map['durationDays'] as num?)?.toInt() ?? 3;
    final pkgId = map['id']?.toString() ?? '';
    final pkgTitle = map['title']?.toString() ?? 'Uganda Tour Package';
    final rawPkgImg = (map['imageUrl'] ?? map['image_placeholder'] ?? map['image'] ?? map['photo'] ?? map['coverImage'] ?? map['heroImage'] ?? map['thumbnail'])?.toString().trim();
    final pkgImg = (rawPkgImg != null && rawPkgImg.isNotEmpty) ? rawPkgImg : '';

    return TourPackageModel(
      id: pkgId,
      destinationId: map['destination_id']?.toString() ?? map['destinationId']?.toString() ?? '',
      title: pkgTitle,
      durationDays: duration,
      pricePerPersonUGX: price,
      groupType: map['group_type']?.toString() ?? map['groupType']?.toString() ?? 'Small Group (Max 6)',
      description: map['description']?.toString() ?? '',
      contentBlocks: _parseBlocks(map['contentBlocks'] ?? map['content_blocks']),
      inclusions: _parseStringList(map['inclusions']),
      exclusions: _parseStringList(map['exclusions']),
      itinerarySummary: _parseStringList(map['itinerary_summary'] ?? map['itinerarySummary']),
      touristPricingTiers: _parseTiers(map['touristPricingTiers'] ?? map['tourist_pricing_tiers']),
      assignedVehicleIds: _parseStringList(map['assignedVehicleIds'] ?? map['assigned_vehicle_ids']),
      assignedGuideIds: _parseStringList(map['assignedGuideIds'] ?? map['assigned_guide_ids']),
      imageUrl: pkgImg,
      bookingAvailable: map['bookingAvailable'] != false && map['booking_available'] != false,
      publicationStatus: (map['publicationStatus'] ?? map['publication_status'] ?? 'PUBLISHED').toString(),
      contentVersion: (map['contentVersion'] ?? map['content_version'] as num?)?.toInt() ?? 1,
    );
  }

  Future<List<DestinationModel>> fetchDestinations() async {
    try {
      final response = await _client.get<List<dynamic>>('/tourism/destinations').timeout(const Duration(seconds: 12));
      if (response.success && response.data != null && response.data is List) {
        final list = (response.data as List<dynamic>).map((json) {
          return _mapJsonToDestination(Map<String, dynamic>.from(json as Map));
        }).toList();

        if (list.isNotEmpty) {
          return list;
        }
      }
    } catch (e) {
      debugPrint('[TourismApiService fetchDestinations Error]: $e');
    }
    return DestinationModel.sampleDestinations;
  }

  Future<DestinationModel?> fetchDestinationById(String id) async {
    try {
      final response = await _client.get<Map<String, dynamic>>('/tourism/destinations/$id').timeout(const Duration(seconds: 10));
      if (response.success && response.data != null) {
        return _mapJsonToDestination(Map<String, dynamic>.from(response.data!));
      }
    } catch (e) {
      debugPrint('[TourismApiService fetchDestinationById Error]: $e');
    }
    try {
      return DestinationModel.sampleDestinations.firstWhere((d) => d.id == id);
    } catch (_) {
      return null;
    }
  }

  Future<List<TourPackageModel>> fetchPackages({String? destinationId}) async {
    try {
      final endpoint = destinationId != null
          ? '/tourism/packages?destinationId=$destinationId'
          : '/tourism/packages';
      final response = await _client.get<List<dynamic>>(endpoint).timeout(const Duration(seconds: 12));
      if (response.success && response.data != null && response.data is List) {
        final list = (response.data as List<dynamic>).map((json) {
          return _mapJsonToPackage(Map<String, dynamic>.from(json as Map));
        }).toList();

        if (list.isNotEmpty) {
          return list;
        }
      }
    } catch (e) {
      debugPrint('[TourismApiService fetchPackages Error]: $e');
    }
    return TourPackageModel.samplePackages;
  }

  Future<List<TourGuideModel>> fetchGuides() async {
    try {
      final response = await _client.get<List<dynamic>>('/guides').timeout(const Duration(seconds: 8));
      if (response.success && response.data != null && response.data is List) {
        final list = (response.data as List<dynamic>).map((json) {
          final map = Map<String, dynamic>.from(json as Map);
          final rate = (map['pricePerDayUgx'] ?? map['dailyRateUGX'] ?? map['daily_rate_ugx'] as num?)?.toDouble() ?? 150000.0;
          final rating = (map['rating'] as num?)?.toDouble() ?? 4.9;
          final experience = (map['yearsOfExperience'] as num?)?.toInt() ?? 5;

          return TourGuideModel(
            id: map['id']?.toString() ?? '',
            fullName: map['name']?.toString() ?? map['fullName']?.toString() ?? 'Certified Safari Guide',
            title: 'UWA Certified Wildlife Specialist',
            rating: rating,
            reviewsCount: 48,
            expeditionsCount: experience * 25,
            languages: _parseStringList(map['languages']),
            specialties: _parseStringList(map['specialties']),
            dailyRateUGX: rate,
            multiDayRateUGX: (map['multiDayRateUgx'] ?? map['multi_day_rate_ugx'] as num?)?.toDouble() ?? 0,
            fixedTourFeeUGX: (map['fixedTourFeeUgx'] ?? map['fixed_tour_fee_ugx'] as num?)?.toDouble() ?? 0,
            groupSizeSurchargeUGX: (map['groupSizeSurchargeUgx'] ?? map['group_size_surcharge_ugx'] as num?)?.toDouble() ?? 0,
            isUwaCertified: map['isCertified'] == true || map['isUwaCertified'] == true,
            isAvailable: map['isAvailable'] != false,
            bio: map['bio']?.toString() ?? 'Professional Uganda Wildlife Authority licensed guide.',
            avatarUrl: map['avatarUrl']?.toString() ?? map['avatar_url']?.toString() ?? '',
          );
        }).toList();

        if (list.isNotEmpty) {
          return list;
        }
      }
    } catch (e) {
      debugPrint('[TourismApiService fetchGuides Error]: $e');
    }
    return TourGuideModel.sampleGuides;
  }

  /// Requests an authoritative server quotation for a tour, ride, shuttle, or delivery
  Future<ServerPriceQuotationModel?> fetchPriceQuote({
    required String serviceType,
    String? destinationId,
    String? packageId,
    String? tourGuideId,
    String? vehicleId,
    int guestsCount = 1,
    int durationDays = 1,
    double distanceKm = 0,
    int durationMins = 0,
    String? packageCategory,
    double weightKg = 0,
  }) async {
    try {
      final response = await _client.post<Map<String, dynamic>>('/pricing/quote', body: {
        'serviceType': serviceType,
        if (destinationId != null && destinationId.isNotEmpty) 'destinationId': destinationId,
        if (packageId != null && packageId.isNotEmpty) 'packageId': packageId,
        if (tourGuideId != null && tourGuideId.isNotEmpty) 'guideId': tourGuideId,
        if (vehicleId != null && vehicleId.isNotEmpty) 'vehicleId': vehicleId,
        'guestCount': guestsCount,
        'durationDays': durationDays,
        'distanceKm': distanceKm,
        'durationMinutes': durationMins,
        if (packageCategory != null) 'packageCategory': packageCategory,
        'weightKg': weightKg,
      }).timeout(const Duration(seconds: 8));

      if (response.success && response.data != null) {
        return ServerPriceQuotationModel.fromJson(Map<String, dynamic>.from(response.data!));
      }
    } catch (e) {
      debugPrint('[TourismApiService fetchPriceQuote Error]: $e');
    }
    return null;
  }
}

final tourismApiServiceProvider = Provider<TourismApiService>((ref) => TourismApiService());

final destinationsListProvider = FutureProvider<List<DestinationModel>>((ref) async {
  return ref.watch(tourismApiServiceProvider).fetchDestinations();
});

final packagesListProvider = FutureProvider<List<TourPackageModel>>((ref) async {
  return ref.watch(tourismApiServiceProvider).fetchPackages();
});

final guidesListProvider = FutureProvider<List<TourGuideModel>>((ref) async {
  return ref.watch(tourismApiServiceProvider).fetchGuides();
});
