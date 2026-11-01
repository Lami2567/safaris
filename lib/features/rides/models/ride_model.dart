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
  searching,
  driverAssigned,
  driverArriving,
  inProgress,
  completed,
  cancelled,
}

class VehicleOption {
  final VehicleTier tier;
  final String title;
  final String subtitle;
  final double baseFareUGX;
  final double perKmUGX;
  final int capacity;
  final int etaMinutes;
  final String iconName;

  const VehicleOption({
    required this.tier,
    required this.title,
    required this.subtitle,
    required this.baseFareUGX,
    required this.perKmUGX,
    required this.capacity,
    required this.etaMinutes,
    required this.iconName,
  });

  VehicleOption copyWith({
    VehicleTier? tier,
    String? title,
    String? subtitle,
    double? baseFareUGX,
    double? perKmUGX,
    int? capacity,
    int? etaMinutes,
    String? iconName,
  }) {
    return VehicleOption(
      tier: tier ?? this.tier,
      title: title ?? this.title,
      subtitle: subtitle ?? this.subtitle,
      baseFareUGX: baseFareUGX ?? this.baseFareUGX,
      perKmUGX: perKmUGX ?? this.perKmUGX,
      capacity: capacity ?? this.capacity,
      etaMinutes: etaMinutes ?? this.etaMinutes,
      iconName: iconName ?? this.iconName,
    );
  }

  static List<VehicleOption> getOptionsWithPricing(
    Map<String, dynamic>? pricingMap, {
    List<Map<String, dynamic>>? catalogueVehicles,
    String serviceKey = 'ride_hailing',
  }) {
    if (catalogueVehicles != null && catalogueVehicles.isNotEmpty) {
      final eligible = catalogueVehicles.where((v) {
        final isAvail = v['isAvailable'] != false && v['isActive'] != false;
        final services = (v['assignedServices'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            [];
        return isAvail && services.contains(serviceKey);
      }).toList();

      if (eligible.isNotEmpty) {
        return eligible.map((v) {
          final id = (v['id'] ?? '').toString().toLowerCase();
          final cat = (v['category'] ?? '').toString().toLowerCase();
          VehicleTier tier = VehicleTier.go;
          String icon = 'directions_car';
          if (id.contains('boda') || cat.contains('motorbike')) {
            tier = VehicleTier.boda;
            icon = 'two_wheeler';
          } else if (id.contains('comfort') || cat.contains('sedan') || cat.contains('suv')) {
            tier = VehicleTier.comfort;
            icon = 'car_rental';
          } else if (id.contains('safari') || cat.contains('safari')) {
            tier = VehicleTier.safari4x4;
            icon = 'airport_shuttle';
          } else if (id.contains('van') || cat.contains('van')) {
            tier = VehicleTier.tourVan;
            icon = 'rv_hookup';
          }
          return VehicleOption(
            tier: tier,
            title: (v['name'] ?? 'Safari Vehicle').toString(),
            subtitle: (v['description'] ?? '').toString(),
            baseFareUGX: (v['baseFareUgx'] as num?)?.toDouble() ?? 5000,
            perKmUGX: (v['perKmRateUgx'] as num?)?.toDouble() ?? 1500,
            capacity: (v['passengerCapacity'] as num?)?.toInt() ?? 4,
            etaMinutes: tier == VehicleTier.boda ? 2 : 5,
            iconName: icon,
          );
        }).toList();
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
        final base = (tierData['baseFare'] ?? tierData['base'])?.toDouble();
        final perKm = tierData['perKm']?.toDouble();
        return opt.copyWith(
          baseFareUGX: base ?? opt.baseFareUGX,
          perKmUGX: perKm ?? opt.perKmUGX,
        );
      }
      return opt;
    }).toList();
  }

  double calculateFare(double distanceKm) {
    return baseFareUGX + (distanceKm * perKmUGX);
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
  String formatTripDuration(double distanceKm) {
    final mins = calculateTripMinutes(distanceKm);
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

  static const List<VehicleOption> options = [
    VehicleOption(
      tier: VehicleTier.boda,
      title: 'Safaris Boda',
      subtitle: 'Fast motorbike beat traffic • Helmet provided',
      baseFareUGX: 3000,
      perKmUGX: 1200,
      capacity: 1,
      etaMinutes: 2,
      iconName: 'two_wheeler',
    ),
    VehicleOption(
      tier: VehicleTier.go,
      title: 'Safaris Go',
      subtitle: 'Affordable everyday rides across Kampala',
      baseFareUGX: 6000,
      perKmUGX: 2200,
      capacity: 4,
      etaMinutes: 4,
      iconName: 'directions_car',
    ),
    VehicleOption(
      tier: VehicleTier.comfort,
      title: 'Safaris Comfort',
      subtitle: 'Premium air-conditioned sedans & top drivers',
      baseFareUGX: 10000,
      perKmUGX: 3200,
      capacity: 4,
      etaMinutes: 5,
      iconName: 'car_rental',
    ),
    VehicleOption(
      tier: VehicleTier.safari4x4,
      title: 'Safari Prado 4x4',
      subtitle: 'Rugged Land Cruiser for long haul & national parks',
      baseFareUGX: 50000,
      perKmUGX: 6500,
      capacity: 6,
      etaMinutes: 12,
      iconName: 'airport_shuttle',
    ),
    VehicleOption(
      tier: VehicleTier.tourVan,
      title: 'Safaris Tour Van',
      subtitle: 'Pop-up roof van for group expeditions & airport',
      baseFareUGX: 65000,
      perKmUGX: 7500,
      capacity: 9,
      etaMinutes: 15,
      iconName: 'rv_hookup',
    ),
  ];
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
  final double distanceKm;
  final double estimatedFareUGX;
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
    this.distanceKm = 8.4,
    this.estimatedFareUGX = 26500,
    this.paymentMethod = 'MTN Mobile Money',
  });

  RideBookingState copyWith({
    LocationModel? pickup,
    LocationModel? destination,
    VehicleOption? selectedVehicle,
    RideStatus? status,
    DriverModel? driver,
    double? driverLat,
    double? driverLng,
    double? driverHeading,
    double? distanceKm,
    double? estimatedFareUGX,
    String? paymentMethod,
  }) {
    return RideBookingState(
      pickup: pickup ?? this.pickup,
      destination: destination ?? this.destination,
      selectedVehicle: selectedVehicle ?? this.selectedVehicle,
      status: status ?? this.status,
      driver: driver ?? this.driver,
      driverLat: driverLat ?? this.driverLat,
      driverLng: driverLng ?? this.driverLng,
      driverHeading: driverHeading ?? this.driverHeading,
      distanceKm: distanceKm ?? this.distanceKm,
      estimatedFareUGX: estimatedFareUGX ?? this.estimatedFareUGX,
      paymentMethod: paymentMethod ?? this.paymentMethod,
    );
  }

  /// Estimated trip minutes to destination based on selected vehicle and distance
  int get tripMinutes => selectedVehicle.calculateTripMinutes(distanceKm);

  /// Human-readable trip duration formatted string (e.g. "15 mins", "1h 20m")
  String get formattedDuration => selectedVehicle.formatTripDuration(distanceKm);
}
