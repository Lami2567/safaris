import 'dart:math' as math;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';
import '../../core/network/socket_service.dart';
import '../../core/utils/geo_utils.dart';
import '../../shared/models/location_model.dart';
import 'models/ride_model.dart';

class RideBookingNotifier extends Notifier<RideBookingState> {
  static final RideBookingState _initialState = RideBookingState(
    pickup: LocationModel.kampalaCentral,
    destination: LocationModel.acaciaMall,
    selectedVehicle: VehicleOption.options[1], // Safaris Go
  );

  @override
  RideBookingState build() => _initialState;

  void setLocations(LocationModel pickup, LocationModel destination) {
    final dist = GeoUtils.haversineDistance(
      pickup.latitude,
      pickup.longitude,
      destination.latitude,
      destination.longitude,
    );
    final roundedDist = math.max(1.2, (dist * 10).round() / 10);
    final fare = state.selectedVehicle.calculateFare(roundedDist);

    state = state.copyWith(
      pickup: pickup,
      destination: destination,
      distanceKm: roundedDist,
      estimatedFareUGX: fare,
    );
    _fetchServerRideQuote();
  }

  void selectVehicle(VehicleOption vehicle) {
    final fare = vehicle.calculateFare(state.distanceKm);
    state = state.copyWith(
      selectedVehicle: vehicle,
      estimatedFareUGX: fare,
    );
    _fetchServerRideQuote();
  }

  Future<void> _fetchServerRideQuote() async {
    try {
      final api = ApiClient();
      final res = await api.post<Map<String, dynamic>>('/pricing/quote', body: {
        'serviceType': 'RIDE',
        'vehicleTier': state.selectedVehicle.tier.name,
        'distanceKm': state.distanceKm,
        'durationMinutes': state.selectedVehicle.calculateTripMinutes(state.distanceKm),
      });
      if (res.success && res.data != null) {
        final serverTotal = (res.data!['totalPriceUgx'] as num?)?.toDouble();
        if (serverTotal != null && serverTotal > 0) {
          state = state.copyWith(estimatedFareUGX: serverTotal);
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
  }) {
    state = state.copyWith(
      driverLat: lat,
      driverLng: lng,
      driverHeading: heading,
    );
  }

  Future<void> startSearching() async {
    state = state.copyWith(status: RideStatus.searching);

    try {
      final api = ApiClient();
      final socket = RealtimeSocketService();
      socket.connect(userId: 'customer_live', role: 'customer');

      socket.on('trip:driver_assigned', (data) {
        if (data != null && data['driver'] != null) {
          final d = data['driver'];
          final driverModel = DriverModel(
            id: (d['driverId'] ?? d['id'] ?? '').toString(),
            fullName: (d['fullName'] ?? 'Approved Driver').toString(),
            phone: (d['phone'] ?? '').toString(),
            rating: (d['rating'] as num?)?.toDouble() ?? 5.0,
            totalTrips: (d['totalTrips'] as num?)?.toInt() ?? 0,
            vehicleModel: (d['vehicleModel'] ?? 'Safari 4x4').toString(),
            licensePlate: (d['licensePlate'] ?? '').toString(),
            vehicleColor: (d['vehicleColor'] ?? '').toString(),
          );
          final lat = (d['currentLat'] as num?)?.toDouble();
          final lng = (d['currentLng'] as num?)?.toDouble();
          state = state.copyWith(
            status: RideStatus.driverAssigned,
            driver: driverModel,
            driverLat: lat ?? state.driverLat,
            driverLng: lng ?? state.driverLng,
          );
        }
      });

      socket.on('trip:status_changed', (data) {
        if (data != null) {
          final statusStr = (data['status'] ?? '').toString();
          if (statusStr == 'DRIVER_ASSIGNED') {
            state = state.copyWith(status: RideStatus.driverAssigned);
          } else if (statusStr == 'DRIVER_ARRIVING' || statusStr == 'DRIVER_ARRIVED') {
            state = state.copyWith(status: RideStatus.driverArriving);
          } else if (statusStr == 'TRIP_STARTED') {
            state = state.copyWith(status: RideStatus.inProgress);
          } else if (statusStr == 'TRIP_COMPLETED') {
            state = state.copyWith(status: RideStatus.completed);
          } else if (statusStr == 'CANCELLED') {
            state = state.copyWith(status: RideStatus.cancelled, driver: null);
          }
        }
      });

      socket.on('trip:driver_location', (data) {
        if (data != null) {
          final lat = (data['lat'] as num?)?.toDouble();
          final lng = (data['lng'] as num?)?.toDouble();
          final heading = (data['heading'] as num?)?.toDouble() ?? 0.0;
          if (lat != null && lng != null) {
            updateDriverLocation(lat: lat, lng: lng, heading: heading);
          }
        }
      });

      final res = await api.post('/trips', body: {
        'pickupTitle': state.pickup.title,
        'pickupAddress': state.pickup.address,
        'pickupLat': state.pickup.latitude,
        'pickupLng': state.pickup.longitude,
        'destTitle': state.destination.title,
        'destAddress': state.destination.address,
        'destLat': state.destination.latitude,
        'destLng': state.destination.longitude,
        'vehicleTier': state.selectedVehicle.tier.name,
        'distanceKm': state.distanceKm,
        'paymentMethod': state.paymentMethod,
      });

      if (res.success && res.data is Map && res.data['customerId'] != null) {
        socket.connect(userId: res.data['customerId'].toString(), role: 'customer');
      }
    } catch (_) {
      // Keep searching status active until driver accepts or user cancels
    }
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
      if (res.success && res.data != null) {
        final trip = res.data;
        final statusStr = trip['status'] as String? ?? '';
        RideStatus mappedStatus = RideStatus.searching;
        if (statusStr == 'DRIVER_ASSIGNED') {
          mappedStatus = RideStatus.driverAssigned;
        } else if (statusStr == 'DRIVER_ARRIVING' || statusStr == 'DRIVER_ARRIVED') {
          mappedStatus = RideStatus.driverArriving;
        } else if (statusStr == 'TRIP_STARTED') {
          mappedStatus = RideStatus.inProgress;
        } else if (statusStr == 'TRIP_COMPLETED') {
          mappedStatus = RideStatus.completed;
        }

        DriverModel? driver;
        if (trip['driver'] != null) {
          final d = trip['driver'];
          driver = DriverModel(
            id: (d['driverId'] ?? d['id'] ?? '').toString(),
            fullName: (d['fullName'] ?? 'Driver').toString(),
            phone: (d['phone'] ?? '').toString(),
            rating: (d['rating'] as num?)?.toDouble() ?? 5.0,
            totalTrips: (d['totalTrips'] as num?)?.toInt() ?? 0,
            vehicleModel: (d['vehicleModel'] ?? 'Vehicle').toString(),
            licensePlate: (d['licensePlate'] ?? '').toString(),
            vehicleColor: (d['vehicleColor'] ?? '').toString(),
          );
        }

        state = state.copyWith(
          status: mappedStatus,
          driver: driver,
        );
      }
    } catch (_) {}
  }

  void startTrip() {
    state = state.copyWith(status: RideStatus.inProgress);
  }

  void completeTrip() {
    state = state.copyWith(status: RideStatus.completed);
  }

  void cancelRide() {
    state = state.copyWith(status: RideStatus.cancelled, driver: null);
  }

  void reset() {
    state = _initialState;
  }
}

final rideBookingProvider =
    NotifierProvider<RideBookingNotifier, RideBookingState>(RideBookingNotifier.new);
