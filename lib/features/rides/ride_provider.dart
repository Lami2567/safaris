import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';
import '../../core/network/socket_service.dart';
import '../../core/services/device_location_service.dart';
import '../../core/services/mapbox_service.dart';
import '../../shared/models/location_model.dart';
import '../authentication/session_provider.dart';
import 'models/ride_model.dart';

/// Fetches admin-configured Ride-Hailing vehicles and dynamic distance bands from `/catalogue/vehicles?service=ride_hailing`
final rideCatalogueVehiclesProvider =
    FutureProvider<List<VehicleOption>>((ref) async {
  try {
    final res = await ApiClient().get<dynamic>(
      '/catalogue/vehicles',
      queryParams: {'service': 'ride_hailing'},
    );
    if (res.success && res.data is List && (res.data as List).isNotEmpty) {
      return (res.data as List)
          .whereType<Map<String, dynamic>>()
          .map((json) => VehicleOption.fromBackendJson(json))
          .toList();
    }
  } catch (_) {}
  return VehicleOption.options;
});

class RideBookingNotifier extends Notifier<RideBookingState> {
  static final RideBookingState _initialState = RideBookingState(
    pickup: LocationModel.kampalaCentral,
    destination: LocationModel.acaciaMall,
    selectedVehicle: VehicleOption.options[1], // Safaris Go
  );

  int _routeSeq = 0;

  @override
  RideBookingState build() => _initialState;

  /// Sets verified pickup and destination locations, fetches the verified road route
  /// via MapboxService (backend `/maps/route` + Mapbox/OSRM Directions), and requests
  /// the authoritative server pricing quote.
  Future<void> setLocations(
    LocationModel pickup,
    LocationModel destination, {
    double? verifiedRoadDistanceKm,
    int? verifiedDurationMinutes,
  }) async {
    if (!pickup.isVerified ||
        !destination.isVerified ||
        !pickup.hasValidUgandaCoordinates ||
        !destination.hasValidUgandaCoordinates) {
      state = state.copyWith(
        isLoadingRoute: false,
        isRouteUnavailable: true,
        routeErrorMessage:
            'Both pickup and destination must have verified Uganda coordinates.',
      );
      return;
    }

    final seq = ++_routeSeq;

    if (verifiedRoadDistanceKm != null && verifiedRoadDistanceKm > 0) {
      final cleanDist = double.parse(verifiedRoadDistanceKm.toStringAsFixed(2));
      final durMins = verifiedDurationMinutes ??
          state.selectedVehicle.calculateTripMinutes(cleanDist);
      final fare = state.selectedVehicle.calculateFare(
        cleanDist,
        durationMinutes: durMins,
      );

      state = state.copyWith(
        pickup: pickup,
        destination: destination,
        distanceKm: cleanDist,
        verifiedDurationMinutes: durMins,
        estimatedFareUGX: fare,
        isLoadingRoute: false,
        isRouteUnavailable: false,
        routeErrorMessage: null,
        clearServerQuote: true,
        priceChangedSinceQuote: false,
      );
      await _fetchServerRideQuote();
      return;
    }

    state = state.copyWith(
      pickup: pickup,
      destination: destination,
      isLoadingRoute: true,
      isRouteUnavailable: false,
      routeErrorMessage: null,
      clearServerQuote: true,
      priceChangedSinceQuote: false,
    );

    final route = await MapboxService().getDirections(
      originLat: pickup.latitude,
      originLng: pickup.longitude,
      destLat: destination.latitude,
      destLng: destination.longitude,
    );

    if (seq != _routeSeq) return;

    if (!route.isValid || route.distanceKm <= 0) {
      state = state.copyWith(
        isLoadingRoute: false,
        isRouteUnavailable: true,
        routeErrorMessage: route.errorMessage ??
            'Road route is temporarily unavailable. Please check network connectivity and retry.',
      );
      return;
    }

    final cleanDist = double.parse(route.distanceKm.toStringAsFixed(2));
    final durMins = route.durationMinutes > 0
        ? route.durationMinutes
        : state.selectedVehicle.calculateTripMinutes(cleanDist);
    final fare = state.selectedVehicle.calculateFare(
      cleanDist,
      durationMinutes: durMins,
    );

    state = state.copyWith(
      distanceKm: cleanDist,
      verifiedDurationMinutes: durMins,
      estimatedFareUGX: fare,
      isLoadingRoute: false,
      isRouteUnavailable: false,
      routeErrorMessage: null,
    );

    await _fetchServerRideQuote();
  }

  /// Callback invoked when `SafarisMapView` resolves or updates the road route geometry.
  void onRouteResolved(DirectionsRouteResult route) {
    if (!route.isValid || route.distanceKm <= 0) {
      state = state.copyWith(
        isLoadingRoute: false,
        isRouteUnavailable: true,
        routeErrorMessage: route.errorMessage ??
            'Road route could not be verified for the selected locations.',
      );
      return;
    }

    final cleanDist = double.parse(route.distanceKm.toStringAsFixed(2));
    final durMins = route.durationMinutes > 0
        ? route.durationMinutes
        : state.selectedVehicle.calculateTripMinutes(cleanDist);

    // Avoid redundant updates when distance is unchanged
    if (!state.isRouteUnavailable &&
        !state.isLoadingRoute &&
        (state.distanceKm - cleanDist).abs() < 0.05) {
      return;
    }

    final fare = state.selectedVehicle.calculateFare(
      cleanDist,
      durationMinutes: durMins,
    );

    state = state.copyWith(
      distanceKm: cleanDist,
      verifiedDurationMinutes: durMins,
      estimatedFareUGX: fare,
      isLoadingRoute: false,
      isRouteUnavailable: false,
      routeErrorMessage: null,
      clearServerQuote: true,
    );

    _fetchServerRideQuote();
  }

  void selectVehicle(VehicleOption vehicle) {
    final fare = vehicle.calculateFare(
      state.distanceKm,
      durationMinutes: state.tripMinutes,
    );
    state = state.copyWith(
      selectedVehicle: vehicle,
      estimatedFareUGX: fare,
      pricingVersion: vehicle.pricingVersion,
      clearServerQuote: true,
      priceChangedSinceQuote: false,
    );
    _fetchServerRideQuote();
  }

  String _mapTierToBackend(VehicleTier tier) {
    switch (tier) {
      case VehicleTier.boda:
        return 'boda';
      case VehicleTier.go:
        return 'go';
      case VehicleTier.comfort:
        return 'comfort';
      case VehicleTier.safari4x4:
        return 'safari4x4';
      case VehicleTier.tourVan:
        return 'tour_van';
    }
  }

  Future<void> _fetchServerRideQuote() async {
    if (state.isRouteUnavailable || state.distanceKm <= 0) return;

    try {
      final api = ApiClient();
      final vehicleId = state.selectedVehicle.id.isNotEmpty
          ? state.selectedVehicle.id
          : _mapTierToBackend(state.selectedVehicle.tier);

      final res = await api.post<Map<String, dynamic>>(
        '/pricing/quote',
        body: {
          'serviceType': 'RIDE',
          'vehicleId': vehicleId,
          'vehicleTier': _mapTierToBackend(state.selectedVehicle.tier),
          'pickupLat': state.pickup.latitude,
          'pickupLng': state.pickup.longitude,
          'destLat': state.destination.latitude,
          'destLng': state.destination.longitude,
          'distanceKm': state.distanceKm,
          'durationMinutes': state.tripMinutes,
        },
      );

      if (res.success && res.data != null) {
        final data = res.data!;
        final serverTotal =
            ((data['totalPriceUgx'] ?? data['total_price_ugx']) as num?)
                ?.toDouble();
        final qId = (data['quotationId'] ?? data['id'])?.toString();
        final pVer =
            ((data['pricingVersion'] ?? data['pricing_version']) as num?)
                ?.toInt();
        final serverRoadDist =
            ((data['verifiedRoadDistanceKm'] ?? data['distanceKm']) as num?)
                ?.toDouble();

        if (serverTotal != null && serverTotal > 0) {
          state = state.copyWith(
            estimatedFareUGX: serverTotal,
            serverQuotedFareUGX: serverTotal,
            quotationId: qId,
            pricingVersion: pVer ?? state.pricingVersion,
            distanceKm: (serverRoadDist != null && serverRoadDist > 0)
                ? serverRoadDist
                : state.distanceKm,
          );
        }
      }
    } catch (_) {}
  }

  void setPaymentMethod(String method) {
    state = state.copyWith(paymentMethod: method);
  }

  void updateDriverLocation({
    required double lat,
    required double lng,
    double heading = 0.0,
    int? etaMinutes,
    double? remainingDistanceKm,
  }) {
    if (!LocationModel.isValidCoordinate(lat, lng)) return;
    state = state.copyWith(
      driverLat: lat,
      driverLng: lng,
      driverHeading: heading,
      driverLocationUpdatedAt: DateTime.now(),
      verifiedDurationMinutes: etaMinutes ?? state.verifiedDurationMinutes,
      distanceKm: (remainingDistanceKm != null && remainingDistanceKm > 0)
          ? remainingDistanceKm
          : state.distanceKm,
    );
  }

  Future<void> startSearching() async {
    if (!state.pickup.hasValidUgandaCoordinates ||
        !state.destination.hasValidUgandaCoordinates ||
        state.isRouteUnavailable ||
        state.distanceKm <= 0) {
      return;
    }

    state = state.copyWith(status: RideStatus.searching);

    try {
      final api = ApiClient();
      final socket = RealtimeSocketService();
      final currentUser = ref.read(currentUserProvider);
      final customerUserId = currentUser.id.isNotEmpty ? currentUser.id : 'customer_user';

      // Connect socket with authenticated user credentials
      socket.connect(
        userId: customerUserId,
        role: 'customer',
        authToken: api.authToken,
      );

      if (state.quotationId == null) {
        await _fetchServerRideQuote();
      }

      _registerSocketListeners(socket);

      final vehicleId = state.selectedVehicle.id.isNotEmpty
          ? state.selectedVehicle.id
          : _mapTierToBackend(state.selectedVehicle.tier);

      final res = await api.post('/trips', body: {
        'pickupTitle': state.pickup.title,
        'pickupAddress': state.pickup.address,
        'pickupLat': state.pickup.latitude,
        'pickupLng': state.pickup.longitude,
        'destTitle': state.destination.title,
        'destAddress': state.destination.address,
        'destLat': state.destination.latitude,
        'destLng': state.destination.longitude,
        'vehicleId': vehicleId,
        'vehicleTier': _mapTierToBackend(state.selectedVehicle.tier),
        if (state.quotationId != null) 'quotationId': state.quotationId,
        'distanceKm': state.distanceKm,
        'paymentMethod': state.paymentMethod,
      });

      if (res.success && res.data is Map) {
        final data = res.data as Map;
        final tripId = (data['id'] ?? data['tripId'] ?? '').toString();
        final customerId =
            (data['customerId'] ?? data['customer_id'] ?? '').toString();
        final serverFare =
            ((data['fare_ugx'] ?? data['fareUgx'] ?? data['estimatedPriceUGX'])
                    as num?)
                ?.toDouble();
        final serverDist =
            ((data['distance_km'] ?? data['distanceKm']) as num?)?.toDouble();
        final serverPricingVer =
            ((data['pricing_version'] ?? data['pricingVersion']) as num?)
                ?.toInt();

        final priceChanged = serverFare != null &&
            state.serverQuotedFareUGX != null &&
            (serverFare - state.serverQuotedFareUGX!).abs() > 1.0;

        state = state.copyWith(
          tripId: tripId.isNotEmpty ? tripId : state.tripId,
          estimatedFareUGX: serverFare ?? state.estimatedFareUGX,
          serverQuotedFareUGX: serverFare ?? state.serverQuotedFareUGX,
          distanceKm: (serverDist != null && serverDist > 0)
              ? serverDist
              : state.distanceKm,
          pricingVersion: serverPricingVer ?? state.pricingVersion,
          priceChangedSinceQuote: priceChanged,
        );

        if (customerId.isNotEmpty && customerId != customerUserId) {
          socket.connect(
            userId: customerId,
            role: 'customer',
            authToken: api.authToken,
          );
        }
        if (tripId.isNotEmpty) {
          socket.joinTripRoom(tripId);
        }
      }
    } catch (_) {
      // Keep searching status active until driver accepts or user cancels
    }
  }

  void _registerSocketListeners(RealtimeSocketService socket) {
    socket.off('trip:driver_assigned');
    socket.off('trip:status_changed');
    socket.off('trip:status_change');
    socket.off('trip:driver_location');
    socket.off('driver:location_update');

    void onDriverAssignedOrStatus(dynamic data) {
      if (data is! Map) return;
      final d = data['driver'] ?? data['trip']?['driver'];
      DriverModel? driverModel = state.driver;
      double? lat = state.driverLat;
      double? lng = state.driverLng;
      double heading = state.driverHeading;

      if (d is Map) {
        driverModel = DriverModel(
          id: (d['driverId'] ?? d['id'] ?? '').toString(),
          fullName: (d['fullName'] ?? d['name'] ?? 'Approved Driver').toString(),
          phone: (d['phone'] ?? '').toString(),
          rating: (d['rating'] as num?)?.toDouble() ?? 5.0,
          totalTrips: (d['totalTrips'] as num?)?.toInt() ?? 0,
          vehicleModel: (d['vehicleModel'] ?? 'Safari 4x4').toString(),
          licensePlate: (d['licensePlate'] ?? '').toString(),
          vehicleColor: (d['vehicleColor'] ?? '').toString(),
        );
        lat = ((d['currentLat'] ?? d['lat']) as num?)?.toDouble() ?? lat;
        lng = ((d['currentLng'] ?? d['lng']) as num?)?.toDouble() ?? lng;
        heading = (d['heading'] as num?)?.toDouble() ?? heading;
      }

      final statusStr =
          (data['status'] ?? data['trip']?['status'] ?? '').toString();

      if (statusStr == 'DRIVER_ASSIGNED' ||
          (statusStr.isEmpty && d is Map)) {
        state = state.copyWith(
          status: RideStatus.driverAssigned,
          driver: driverModel,
          driverLat: lat,
          driverLng: lng,
          driverHeading: heading,
          driverLocationUpdatedAt:
              lat != null ? DateTime.now() : state.driverLocationUpdatedAt,
        );
      } else if (statusStr == 'DRIVER_ARRIVING') {
        state = state.copyWith(
          status: RideStatus.driverArriving,
          driver: driverModel,
          driverLat: lat,
          driverLng: lng,
          driverHeading: heading,
        );
      } else if (statusStr == 'DRIVER_ARRIVED') {
        state = state.copyWith(
          status: RideStatus.driverArrived,
          driver: driverModel,
          driverLat: lat,
          driverLng: lng,
          driverHeading: heading,
        );
      } else if (statusStr == 'TRIP_STARTED' || statusStr == 'IN_PROGRESS') {
        state = state.copyWith(
          status: RideStatus.inProgress,
          driver: driverModel,
          driverLat: lat,
          driverLng: lng,
          driverHeading: heading,
        );
      } else if (statusStr == 'TRIP_COMPLETED' || statusStr == 'COMPLETED') {
        DeviceLocationService().stopForegroundNavigation();
        state = state.copyWith(status: RideStatus.completed);
      } else if (statusStr == 'CANCELLED') {
        DeviceLocationService().stopForegroundNavigation();
        state = state.copyWith(
          status: RideStatus.cancelled,
          clearDriver: true,
        );
      }
    }

    void onDriverLocation(dynamic data) {
      if (data is! Map) return;
      final lat = ((data['lat'] ?? data['latitude']) as num?)?.toDouble();
      final lng = ((data['lng'] ?? data['longitude']) as num?)?.toDouble();
      final heading = (data['heading'] as num?)?.toDouble() ?? 0.0;
      final etaMins = (data['etaMinutes'] as num?)?.toInt();
      final remDistKm = (data['remainingDistanceKm'] as num?)?.toDouble();
      if (lat != null && lng != null) {
        updateDriverLocation(
          lat: lat,
          lng: lng,
          heading: heading,
          etaMinutes: etaMins,
          remainingDistanceKm: remDistKm,
        );
      }
    }

    socket.on('trip:driver_assigned', onDriverAssignedOrStatus);
    socket.on('trip:status_changed', onDriverAssignedOrStatus);
    socket.on('trip:status_change', onDriverAssignedOrStatus);
    socket.on('trip:driver_location', onDriverLocation);
    socket.on('driver:location_update', onDriverLocation);
  }

  void assignDriverFromData(DriverModel driver) {
    state = state.copyWith(
      status: RideStatus.driverAssigned,
      driver: driver,
    );
  }

  /// Checks for any active in-progress trip on the backend
  Future<void> checkActiveTrip() async {
    try {
      final api = ApiClient();
      final res = await api.get('/trips/active');
      if (res.success && res.data is Map) {
        final trip = Map<String, dynamic>.from(res.data as Map);
        final statusStr = trip['status'] as String? ?? '';
        RideStatus mappedStatus = RideStatus.searching;
        if (statusStr == 'DRIVER_ASSIGNED') {
          mappedStatus = RideStatus.driverAssigned;
        } else if (statusStr == 'DRIVER_ARRIVING') {
          mappedStatus = RideStatus.driverArriving;
        } else if (statusStr == 'DRIVER_ARRIVED') {
          mappedStatus = RideStatus.driverArrived;
        } else if (statusStr == 'TRIP_STARTED' || statusStr == 'IN_PROGRESS') {
          mappedStatus = RideStatus.inProgress;
        } else if (statusStr == 'TRIP_COMPLETED' || statusStr == 'COMPLETED') {
          mappedStatus = RideStatus.completed;
        }

        DriverModel? driver;
        double? dLat = state.driverLat;
        double? dLng = state.driverLng;
        if (trip['driver'] is Map) {
          final d = Map<String, dynamic>.from(trip['driver'] as Map);
          driver = DriverModel(
            id: (d['driverId'] ?? d['id'] ?? '').toString(),
            fullName: (d['fullName'] ?? d['name'] ?? 'Driver').toString(),
            phone: (d['phone'] ?? '').toString(),
            rating: (d['rating'] as num?)?.toDouble() ?? 5.0,
            totalTrips: (d['totalTrips'] as num?)?.toInt() ?? 0,
            vehicleModel: (d['vehicleModel'] ?? 'Vehicle').toString(),
            licensePlate: (d['licensePlate'] ?? '').toString(),
            vehicleColor: (d['vehicleColor'] ?? '').toString(),
          );
          dLat = ((d['currentLat'] ?? d['lat']) as num?)?.toDouble() ?? dLat;
          dLng = ((d['currentLng'] ?? d['lng']) as num?)?.toDouble() ?? dLng;
        }

        state = state.copyWith(
          status: mappedStatus,
          driver: driver,
          driverLat: dLat,
          driverLng: dLng,
          driverLocationUpdatedAt:
              dLat != null ? DateTime.now() : state.driverLocationUpdatedAt,
        );
      }
    } catch (_) {}
  }

  Future<void> refreshTripState() => checkActiveTrip();

  void startTrip() {
    state = state.copyWith(status: RideStatus.inProgress);
  }

  void completeTrip() {
    DeviceLocationService().stopForegroundNavigation();
    state = state.copyWith(status: RideStatus.completed);
  }

  void cancelRide() {
    if (state.tripId != null && state.tripId!.isNotEmpty) {
      ApiClient().put(
        '/trips/${state.tripId}/status',
        body: {'status': 'CANCELLED'},
      );
      RealtimeSocketService().leaveTripRoom(state.tripId!);
    }
    DeviceLocationService().stopForegroundNavigation();
    state = state.copyWith(status: RideStatus.cancelled, clearDriver: true);
  }

  void reset() {
    DeviceLocationService().stopForegroundNavigation();
    state = _initialState;
  }
}

final rideBookingProvider =
    NotifierProvider<RideBookingNotifier, RideBookingState>(
        RideBookingNotifier.new);
