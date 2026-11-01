import 'dart:math' as math;
import '../../../shared/models/location_model.dart';

enum VehicleTier {
  boda,
  go,
  comfort,
  safari4x4,
  tourVan,
}

enum RideStatus {
  idle,
  selectingLocations,
  selectingVehicle,
  searching,
  driverAssigned,
  driverArriving,
  driverArrived,
  inProgress,
  completed,
  cancelled,
}

class VehicleDistanceBand {
  final double minKm;
  final double? maxKm;
  final double ratePerKmUGX;

  const VehicleDistanceBand({
    required this.minKm,
    this.maxKm,
    required this.ratePerKmUGX,
  });

  factory VehicleDistanceBand.fromJson(Map<String, dynamic> json) {
    return VehicleDistanceBand(
      minKm: (json['minKm'] as num?)?.toDouble() ?? 0.0,
      maxKm: (json['maxKm'] as num?)?.toDouble(),
      ratePerKmUGX:
          ((json['ratePerKmUgx'] ?? json['ratePerKmUGX']) as num?)?.toDouble() ??
              2000.0,
    );
  }
}

class VehicleOption {
  final String id;
  final VehicleTier tier;
  final String title;
  final String subtitle;
  final double baseFareUGX;
  final double perKmUGX;
  final double minimumFareUGX;
  final double perMinuteUGX;
  final double waitingFeePerMinUGX;
  final double bookingFeeUGX;
  final double peakMultiplier;
  final String calculationMode; // 'BAND_MATCH' | 'PROGRESSIVE'
  final List<VehicleDistanceBand> distanceBands;
  final int pricingVersion;
  final int capacity;
  final int etaMinutes;
  final String iconName;

  const VehicleOption({
    this.id = '',
    required this.tier,
    required this.title,
    required this.subtitle,
    required this.baseFareUGX,
    required this.perKmUGX,
    this.minimumFareUGX = 0,
    this.perMinuteUGX = 0,
    this.waitingFeePerMinUGX = 0,
    this.bookingFeeUGX = 0,
    this.peakMultiplier = 1.0,
    this.calculationMode = 'BAND_MATCH',
    this.distanceBands = const [],
    this.pricingVersion = 1,
    required this.capacity,
    required this.etaMinutes,
    required this.iconName,
  });

  String get name => title;
  String get description => subtitle;

  VehicleOption copyWith({
    String? id,
    VehicleTier? tier,
    String? title,
    String? subtitle,
    double? baseFareUGX,
    double? perKmUGX,
    double? minimumFareUGX,
    double? perMinuteUGX,
    double? waitingFeePerMinUGX,
    double? bookingFeeUGX,
    double? peakMultiplier,
    String? calculationMode,
    List<VehicleDistanceBand>? distanceBands,
    int? pricingVersion,
    int? capacity,
    int? etaMinutes,
    String? iconName,
  }) {
    return VehicleOption(
      id: id ?? this.id,
      tier: tier ?? this.tier,
      title: title ?? this.title,
      subtitle: subtitle ?? this.subtitle,
      baseFareUGX: baseFareUGX ?? this.baseFareUGX,
      perKmUGX: perKmUGX ?? this.perKmUGX,
      minimumFareUGX: minimumFareUGX ?? this.minimumFareUGX,
      perMinuteUGX: perMinuteUGX ?? this.perMinuteUGX,
      waitingFeePerMinUGX: waitingFeePerMinUGX ?? this.waitingFeePerMinUGX,
      bookingFeeUGX: bookingFeeUGX ?? this.bookingFeeUGX,
      peakMultiplier: peakMultiplier ?? this.peakMultiplier,
      calculationMode: calculationMode ?? this.calculationMode,
      distanceBands: distanceBands ?? this.distanceBands,
      pricingVersion: pricingVersion ?? this.pricingVersion,
      capacity: capacity ?? this.capacity,
      etaMinutes: etaMinutes ?? this.etaMinutes,
      iconName: iconName ?? this.iconName,
    );
  }

  /// Resolves the effective admin-configured per-km rate for a given road distance (in km).
  double effectivePerKmRate(double verifiedRoadDistanceKm) {
    if (perKmUGX > 0 && distanceBands.isEmpty) {
      return perKmUGX;
    }
    if (distanceBands.isNotEmpty) {
      final cleanDist = math.max(0.0, verifiedRoadDistanceKm);
      final sorted = [...distanceBands]
        ..sort((a, b) => a.minKm.compareTo(b.minKm));
      for (final band in sorted) {
        final aboveMin = cleanDist >= band.minKm;
        final belowMax = band.maxKm == null || cleanDist <= band.maxKm!;
        if (aboveMin && belowMax) {
          return band.ratePerKmUGX;
        }
      }
      return sorted.last.ratePerKmUGX;
    }
    return perKmUGX;
  }

  /// Calculates the dynamic fare using the exact admin-configured pricing rules:
  /// `Distance-based fare = Verified road distance in kilometres × Admin-configured price per kilometre`
  /// plus configured base fare, minimum fare, duration/waiting fees, booking fee, and peak multiplier.
  double calculateFare(
    double verifiedRoadDistanceKm, {
    int durationMinutes = 0,
    int waitingMinutes = 0,
  }) {
    final cleanDistKm = math.max(0.0, verifiedRoadDistanceKm);
    double distanceCharge = 0.0;

    if (perKmUGX > 0 && distanceBands.isEmpty) {
      distanceCharge = cleanDistKm * perKmUGX;
    } else if (distanceBands.isNotEmpty) {
      final sorted = [...distanceBands]
        ..sort((a, b) => a.minKm.compareTo(b.minKm));
      if (calculationMode == 'PROGRESSIVE') {
        for (final band in sorted) {
          if (cleanDistKm <= band.minKm) break;
          final upper = band.maxKm != null
              ? math.min(cleanDistKm, band.maxKm!)
              : cleanDistKm;
          final sliceKm = math.max(0.0, upper - band.minKm);
          if (sliceKm > 0) {
            distanceCharge += sliceKm * band.ratePerKmUGX;
          }
        }
      } else {
        // BAND_MATCH: Verified road distance in km × Admin-configured rate for the matched band
        VehicleDistanceBand matched = sorted.last;
        for (final band in sorted) {
          final aboveMin = cleanDistKm >= band.minKm;
          final belowMax = band.maxKm == null || cleanDistKm <= band.maxKm!;
          if (aboveMin && belowMax) {
            matched = band;
            break;
          }
        }
        distanceCharge = cleanDistKm * matched.ratePerKmUGX;
      }
    } else {
      distanceCharge = cleanDistKm * perKmUGX;
    }

    double additionalCharges = 0.0;
    if (durationMinutes > 0 && perMinuteUGX > 0) {
      additionalCharges += durationMinutes * perMinuteUGX;
    }
    if (waitingMinutes > 0 && waitingFeePerMinUGX > 0) {
      additionalCharges += waitingMinutes * waitingFeePerMinUGX;
    }
    if (bookingFeeUGX > 0) {
      additionalCharges += bookingFeeUGX;
    }

    double subtotal = baseFareUGX + distanceCharge + additionalCharges;
    if (peakMultiplier > 1.0) {
      subtotal += subtotal * (peakMultiplier - 1.0);
    }

    return math.max(minimumFareUGX, subtotal).roundToDouble();
  }

  /// Calculates travel duration in minutes to the destination based on distance and vehicle tier
  int calculateTripMinutes(double distanceKm) {
    if (distanceKm <= 0) return 0;
    double avgSpeedKmH;
    switch (tier) {
      case VehicleTier.boda:
        avgSpeedKmH = distanceKm <= 10 ? 28.0 : 35.0;
        break;
      case VehicleTier.go:
        avgSpeedKmH = distanceKm <= 10 ? 26.0 : (distanceKm <= 40 ? 38.0 : 55.0);
        break;
      case VehicleTier.comfort:
        avgSpeedKmH = distanceKm <= 10 ? 28.0 : (distanceKm <= 40 ? 42.0 : 60.0);
        break;
      case VehicleTier.safari4x4:
        avgSpeedKmH = distanceKm <= 10 ? 25.0 : (distanceKm <= 50 ? 45.0 : 65.0);
        break;
      case VehicleTier.tourVan:
        avgSpeedKmH = distanceKm <= 10 ? 24.0 : (distanceKm <= 50 ? 40.0 : 58.0);
        break;
    }
    final mins = ((distanceKm / avgSpeedKmH) * 60).round();
    return math.max(3, mins);
  }

  /// Formats travel duration dynamically (e.g., "12 mins", "1h 15m", "5h 30m")
  String formatTripDuration(double distanceKm, {int? overrideMinutes}) {
    final mins = (overrideMinutes != null && overrideMinutes > 0)
        ? overrideMinutes
        : calculateTripMinutes(distanceKm);
    if (mins >= 60) {
      final hours = mins ~/ 60;
      final remMins = mins % 60;
      if (remMins == 0) {
        return '${hours}h';
      }
      return '${hours}h ${remMins}m';
    }
    return '$mins mins';
  }

  factory VehicleOption.fromBackendJson(Map<String, dynamic> v) {
    final id = (v['id'] ?? v['code'] ?? '').toString();
    final idLower = id.toLowerCase();
    final cat = (v['category'] ?? v['code'] ?? '').toString().toLowerCase();

    VehicleTier tier = VehicleTier.go;
    String icon = 'directions_car';
    if (idLower.contains('boda') || cat.contains('motorbike') || cat.contains('boda')) {
      tier = VehicleTier.boda;
      icon = 'two_wheeler';
    } else if (idLower.contains('comfort') || cat.contains('sedan') || cat.contains('suv')) {
      tier = VehicleTier.comfort;
      icon = 'car_rental';
    } else if (idLower.contains('safari') || cat.contains('safari') || idLower.contains('4x4')) {
      tier = VehicleTier.safari4x4;
      icon = 'airport_shuttle';
    } else if (idLower.contains('van') || cat.contains('van')) {
      tier = VehicleTier.tourVan;
      icon = 'rv_hookup';
    }

    final sp = v['service_pricing'] is Map
        ? Map<String, dynamic>.from(v['service_pricing'] as Map)
        : <String, dynamic>{};
    final rh = sp['ride_hailing'] is Map
        ? Map<String, dynamic>.from(sp['ride_hailing'] as Map)
        : <String, dynamic>{};

    final rawBands = (rh['distanceBands'] ?? v['distanceBands']) as List<dynamic>? ?? [];
    final parsedBands = rawBands
        .whereType<Map>()
        .map((b) => VehicleDistanceBand.fromJson(Map<String, dynamic>.from(b)))
        .toList();

    final baseFare = ((rh['baseFareUgx'] ?? v['baseFareUgx']) as num?)?.toDouble() ?? 5000.0;
    final minFare = ((rh['minimumFareUgx'] ?? v['minimumFareUgx']) as num?)?.toDouble() ?? baseFare;
    double perKm = ((rh['perKmRateUgx'] ?? rh['perKmUgx'] ?? v['perKmRateUgx']) as num?)?.toDouble() ?? 0.0;
    if (perKm <= 0 && parsedBands.isNotEmpty) {
      perKm = parsedBands.first.ratePerKmUGX;
    }
    if (perKm <= 0) {
      perKm = 1800.0;
    }

    return VehicleOption(
      id: id,
      tier: tier,
      title: (v['name'] ?? 'Safari Vehicle').toString(),
      subtitle: (v['description'] ?? '').toString(),
      baseFareUGX: baseFare,
      perKmUGX: perKm,
      minimumFareUGX: minFare,
      perMinuteUGX: ((rh['perMinuteUgx'] ?? v['perMinuteUgx']) as num?)?.toDouble() ?? 0.0,
      waitingFeePerMinUGX:
          ((rh['waitingFeePerMinUgx'] ?? v['waitingFeePerMinUgx']) as num?)?.toDouble() ?? 0.0,
      bookingFeeUGX: ((rh['bookingFeeUgx'] ?? v['bookingFeeUgx']) as num?)?.toDouble() ?? 0.0,
      peakMultiplier: ((rh['peakMultiplier'] ?? v['peakMultiplier']) as num?)?.toDouble() ?? 1.0,
      calculationMode: (rh['calculationMode'] ?? v['calculationMode'] ?? 'BAND_MATCH').toString(),
      distanceBands: parsedBands,
      pricingVersion: ((v['pricing_version'] ?? v['pricingVersion']) as num?)?.toInt() ?? 1,
      capacity: ((v['passengerCapacity'] ?? v['passenger_capacity']) as num?)?.toInt() ?? 4,
      etaMinutes: tier == VehicleTier.boda ? 2 : 5,
      iconName: icon,
    );
  }

  static List<VehicleOption> getOptionsWithPricing(
    Map<String, dynamic>? pricingMap, {
    List<Map<String, dynamic>>? catalogueVehicles,
    String serviceKey = 'ride_hailing',
  }) {
    if (catalogueVehicles != null && catalogueVehicles.isNotEmpty) {
      final eligible = catalogueVehicles.where((v) {
        final isAvail = v['isAvailable'] != false &&
            v['isActive'] != false &&
            v['is_available'] != false &&
            v['is_active'] != false;
        final rawServices = v['assignedServices'] ?? v['assigned_services'];
        final services = (rawServices as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            [];
        return isAvail && (services.isEmpty || services.contains(serviceKey));
      }).toList();

      if (eligible.isNotEmpty) {
        return eligible.map((v) => VehicleOption.fromBackendJson(v)).toList();
      }
    }

    if (pricingMap == null || pricingMap.isEmpty) {
      return options;
    }
    return options.map((opt) {
      String key;
      switch (opt.tier) {
        case VehicleTier.boda:
          key = 'boda';
          break;
        case VehicleTier.go:
          key = pricingMap.containsKey('go') ? 'go' : 'economy';
          break;
        case VehicleTier.comfort:
          key = 'comfort';
          break;
        case VehicleTier.safari4x4:
          key = pricingMap.containsKey('safari4x4') ? 'safari4x4' : 'safari';
          break;
        case VehicleTier.tourVan:
          key = 'tour_van';
          break;
      }

      final tierData = pricingMap[key] as Map<String, dynamic>?;
      if (tierData != null) {
        final base = (tierData['baseFare'] ?? tierData['base'] ?? tierData['baseFareUgx'])
            ?.toDouble();
        final perKm = (tierData['perKm'] ?? tierData['perKmRateUgx'])?.toDouble();
        final minFare = (tierData['minimumFare'] ?? tierData['minimumFareUgx'])?.toDouble();
        final rawBands = tierData['distanceBands'] as List<dynamic>? ?? [];
        final parsedBands = rawBands
            .whereType<Map>()
            .map((b) => VehicleDistanceBand.fromJson(Map<String, dynamic>.from(b)))
            .toList();

        return opt.copyWith(
          baseFareUGX: base ?? opt.baseFareUGX,
          perKmUGX: perKm ?? opt.perKmUGX,
          minimumFareUGX: minFare ?? opt.minimumFareUGX,
          distanceBands: parsedBands.isNotEmpty ? parsedBands : opt.distanceBands,
        );
      }
      return opt;
    }).toList();
  }

  static const List<VehicleOption> options = [
    VehicleOption(
      id: 'veh_boda',
      tier: VehicleTier.boda,
      title: 'Safaris Boda',
      subtitle: 'Fast motorbike beat traffic • Helmet provided',
      baseFareUGX: 3000,
      perKmUGX: 1200,
      minimumFareUGX: 3000,
      capacity: 1,
      etaMinutes: 2,
      iconName: 'two_wheeler',
    ),
    VehicleOption(
      id: 'veh_go',
      tier: VehicleTier.go,
      title: 'Safaris Go',
      subtitle: 'Affordable everyday rides across Uganda',
      baseFareUGX: 6000,
      perKmUGX: 2200,
      minimumFareUGX: 6000,
      capacity: 4,
      etaMinutes: 4,
      iconName: 'directions_car',
    ),
    VehicleOption(
      id: 'veh_comfort',
      tier: VehicleTier.comfort,
      title: 'Safaris Comfort',
      subtitle: 'Premium air-conditioned sedans & top drivers',
      baseFareUGX: 10000,
      perKmUGX: 3200,
      minimumFareUGX: 10000,
      capacity: 4,
      etaMinutes: 5,
      iconName: 'car_rental',
    ),
    VehicleOption(
      id: 'veh_safari_4x4',
      tier: VehicleTier.safari4x4,
      title: 'Safari Prado 4x4',
      subtitle: 'Rugged Land Cruiser for long haul & national parks',
      baseFareUGX: 50000,
      perKmUGX: 6500,
      minimumFareUGX: 50000,
      capacity: 6,
      etaMinutes: 12,
      iconName: 'airport_shuttle',
    ),
    VehicleOption(
      id: 'veh_tour_van',
      tier: VehicleTier.tourVan,
      title: 'Safaris Tour Van',
      subtitle: 'Pop-up roof van for group expeditions & airport',
      baseFareUGX: 65000,
      perKmUGX: 7500,
      minimumFareUGX: 65000,
      capacity: 9,
      etaMinutes: 15,
      iconName: 'rv_hookup',
    ),
  ];

  static List<VehicleOption> get allOptions => options;
}

class DriverModel {
  final String id;
  final String fullName;
  final String phone;
  final double rating;
  final int totalTrips;
  final String vehicleModel;
  final String licensePlate;
  final String vehicleColor;

  const DriverModel({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.rating,
    required this.totalTrips,
    required this.vehicleModel,
    required this.licensePlate,
    required this.vehicleColor,
  });

  String get name => fullName;

  static const DriverModel sampleDriver = DriverModel(
    id: 'drv_ug_902',
    fullName: 'Moses Okello',
    phone: '+256 701 847291',
    rating: 4.96,
    totalTrips: 1420,
    vehicleModel: 'Toyota Premio (AC)',
    licensePlate: 'UBM 714K',
    vehicleColor: 'Silver Metallic',
  );
}

class RideBookingState {
  final LocationModel pickup;
  final LocationModel destination;
  final VehicleOption selectedVehicle;
  final RideStatus status;
  final DriverModel? driver;
  final double? driverLat;
  final double? driverLng;
  final double driverHeading;
  final DateTime? driverLocationUpdatedAt;
  final double distanceKm;
  final int? verifiedDurationMinutes;
  final double estimatedFareUGX;
  final double? serverQuotedFareUGX;
  final String? tripId;
  final String? quotationId;
  final int pricingVersion;
  final bool priceChangedSinceQuote;
  final bool isLoadingRoute;
  final bool isRouteUnavailable;
  final String? routeErrorMessage;
  final String paymentMethod;

  const RideBookingState({
    required this.pickup,
    required this.destination,
    required this.selectedVehicle,
    this.status = RideStatus.idle,
    this.driver,
    this.driverLat,
    this.driverLng,
    this.driverHeading = 0.0,
    this.driverLocationUpdatedAt,
    this.distanceKm = 8.4,
    this.verifiedDurationMinutes,
    this.estimatedFareUGX = 22480,
    this.serverQuotedFareUGX,
    this.tripId,
    this.quotationId,
    this.pricingVersion = 1,
    this.priceChangedSinceQuote = false,
    this.isLoadingRoute = false,
    this.isRouteUnavailable = false,
    this.routeErrorMessage,
    this.paymentMethod = 'MTN Mobile Money',
  });

  int get totalFareUGX =>
      (serverQuotedFareUGX ?? estimatedFareUGX).round();

  bool get isDriverLocationStale {
    if (driverLocationUpdatedAt == null) return false;
    return DateTime.now().difference(driverLocationUpdatedAt!).inSeconds > 60;
  }

  /// Estimated trip minutes to destination based on road routing or selected vehicle
  int get tripMinutes =>
      (verifiedDurationMinutes != null && verifiedDurationMinutes! > 0)
          ? verifiedDurationMinutes!
          : selectedVehicle.calculateTripMinutes(distanceKm);

  /// Human-readable trip duration formatted string (e.g. "15 mins", "1h 20m")
  String get formattedDuration => selectedVehicle.formatTripDuration(
        distanceKm,
        overrideMinutes: verifiedDurationMinutes,
      );

  RideBookingState copyWith({
    LocationModel? pickup,
    LocationModel? destination,
    VehicleOption? selectedVehicle,
    RideStatus? status,
    DriverModel? driver,
    bool clearDriver = false,
    double? driverLat,
    double? driverLng,
    double? driverHeading,
    DateTime? driverLocationUpdatedAt,
    double? distanceKm,
    int? verifiedDurationMinutes,
    bool clearVerifiedDuration = false,
    double? estimatedFareUGX,
    double? serverQuotedFareUGX,
    bool clearServerQuote = false,
    String? tripId,
    String? quotationId,
    int? pricingVersion,
    bool? priceChangedSinceQuote,
    bool? isLoadingRoute,
    bool? isRouteUnavailable,
    String? routeErrorMessage,
    String? paymentMethod,
  }) {
    return RideBookingState(
      pickup: pickup ?? this.pickup,
      destination: destination ?? this.destination,
      selectedVehicle: selectedVehicle ?? this.selectedVehicle,
      status: status ?? this.status,
      driver: clearDriver ? null : (driver ?? this.driver),
      driverLat: driverLat ?? this.driverLat,
      driverLng: driverLng ?? this.driverLng,
      driverHeading: driverHeading ?? this.driverHeading,
      driverLocationUpdatedAt:
          driverLocationUpdatedAt ?? this.driverLocationUpdatedAt,
      distanceKm: distanceKm ?? this.distanceKm,
      verifiedDurationMinutes: clearVerifiedDuration
          ? null
          : (verifiedDurationMinutes ?? this.verifiedDurationMinutes),
      estimatedFareUGX: estimatedFareUGX ?? this.estimatedFareUGX,
      serverQuotedFareUGX: clearServerQuote
          ? null
          : (serverQuotedFareUGX ?? this.serverQuotedFareUGX),
      tripId: tripId ?? this.tripId,
      quotationId: clearServerQuote ? null : (quotationId ?? this.quotationId),
      pricingVersion: pricingVersion ?? this.pricingVersion,
      priceChangedSinceQuote:
          priceChangedSinceQuote ?? this.priceChangedSinceQuote,
      isLoadingRoute: isLoadingRoute ?? this.isLoadingRoute,
      isRouteUnavailable: isRouteUnavailable ?? this.isRouteUnavailable,
      routeErrorMessage: routeErrorMessage,
      paymentMethod: paymentMethod ?? this.paymentMethod,
    );
  }
}
