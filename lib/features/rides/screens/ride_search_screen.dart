import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/config/remote_config_service.dart';
import '../../../core/services/mapbox_service.dart';
import '../../../core/services/user_location_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/models/location_model.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../tourism/services/tourism_api_service.dart';
import '../models/ride_model.dart';
import '../ride_provider.dart';

enum PickupChoice {
  kampalaCenter,
  currentLocation,
  manual,
}

class RideSearchScreen extends ConsumerStatefulWidget {
  const RideSearchScreen({super.key});

  @override
  ConsumerState<RideSearchScreen> createState() => _RideSearchScreenState();
}

class _RideSearchScreenState extends ConsumerState<RideSearchScreen> {
  PickupChoice _pickupChoice = PickupChoice.kampalaCenter;
  late TextEditingController _pickupController;
  late TextEditingController _destController;
  LocationModel? _pickup = LocationModel.kampalaCentral;
  LocationModel? _selectedDestination;
  int _selectedVehicleIndex = 1; // Default to Safaris Go
  String _destinationQuery = '';

  List<LocationModel> _mapboxSearchResults = [];
  List<LocationModel> _manualPickupResults = [];
  bool _isSearchingMapbox = false;
  bool _isSearchingManualPickup = false;
  bool _isResolvingRoute = false;
  double? _verifiedRoadDistanceKm;
  int? _verifiedDurationMinutes;

  Timer? _destDebounce;
  Timer? _pickupDebounce;
  int _destSearchSeq = 0;
  int _pickupSearchSeq = 0;

  @override
  void initState() {
    super.initState();
    _pickupController = TextEditingController(text: 'Kampala City Centre');
    _destController = TextEditingController();
  }

  @override
  void dispose() {
    _destDebounce?.cancel();
    _pickupDebounce?.cancel();
    _pickupController.dispose();
    _destController.dispose();
    super.dispose();
  }

  Future<void> _onPickupChoiceChanged(PickupChoice choice) async {
    setState(() {
      _pickupChoice = choice;
      _manualPickupResults = [];
    });

    if (choice == PickupChoice.kampalaCenter) {
      setState(() {
        _pickup = LocationModel.kampalaCentral;
        _pickupController.text = 'Kampala City Centre';
      });
      _resolveVerifiedRouteIfReady();
    } else if (choice == PickupChoice.currentLocation) {
      var userLoc = ref.read(userLocationProvider);
      if (!userLoc.hasCoordinates) {
        await ref
            .read(userLocationProvider.notifier)
            .requestLocationAggressively();
        userLoc = ref.read(userLocationProvider);
      }
      if (!mounted) return;
      if (userLoc.hasCoordinates) {
        setState(() {
          _pickup = LocationModel(
            id: 'current_gps',
            title: 'My Current Location',
            address: userLoc.locality.isNotEmpty
                ? userLoc.locality
                : 'GPS (${userLoc.latitude!.toStringAsFixed(4)}, ${userLoc.longitude!.toStringAsFixed(4)})',
            city: userLoc.locality.split(',').first,
            latitude: userLoc.latitude!,
            longitude: userLoc.longitude!,
          );
          _pickupController.text = 'My Current Location (${userLoc.locality})';
        });
        _resolveVerifiedRouteIfReady();
      } else {
        setState(() {
          _pickup = null;
          _pickupController.text = 'GPS Unavailable — Select or search pickup';
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Hardware GPS is unavailable. Please enable Location or search your pickup location manually.',
            ),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } else {
      // Manual entry: require the customer to select a verified Uganda location from autocomplete
      setState(() {
        _pickup = null;
        _pickupController.clear();
        _verifiedRoadDistanceKm = null;
        _verifiedDurationMinutes = null;
      });
    }
  }

  /// Searches Uganda locations for manual pickup — never assigns hardcoded Kampala coordinates (`0.3136, 32.5811`)
  void _onManualPickupChanged(String value) {
    _pickupDebounce?.cancel();
    setState(() {
      _pickup = null;
      _verifiedRoadDistanceKm = null;
    });

    final trimmed = value.trim();
    if (trimmed.length < 2) {
      setState(() {
        _manualPickupResults = [];
        _isSearchingManualPickup = false;
      });
      return;
    }

    setState(() => _isSearchingManualPickup = true);
    final seq = ++_pickupSearchSeq;

    _pickupDebounce = Timer(const Duration(milliseconds: 280), () async {
      final userLoc = ref.read(userLocationProvider);
      final results = await MapboxService().searchPlaces(
        trimmed,
        proximityLat: userLoc.latitude,
        proximityLng: userLoc.longitude,
        limit: 8,
      );
      if (!mounted || seq != _pickupSearchSeq) return;
      setState(() {
        _manualPickupResults = results;
        _isSearchingManualPickup = false;
      });
    });
  }

  void _selectManualPickup(LocationModel loc) {
    if (!loc.hasValidUgandaCoordinates) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _pickup = loc;
      _pickupController.text = loc.title;
      _manualPickupResults = [];
    });
    _resolveVerifiedRouteIfReady();
  }

  void _onDestinationQueryChanged(String val) {
    _destDebounce?.cancel();
    setState(() {
      _destinationQuery = val;
      if (_selectedDestination != null && _selectedDestination!.title != val) {
        _selectedDestination = null;
        _verifiedRoadDistanceKm = null;
        _verifiedDurationMinutes = null;
      }
    });

    final trimmed = val.trim();
    if (trimmed.length >= 2) {
      setState(() => _isSearchingMapbox = true);
      final seq = ++_destSearchSeq;
      _destDebounce = Timer(const Duration(milliseconds: 280), () async {
        final results = await MapboxService().searchPlaces(
          trimmed,
          proximityLat: _pickup?.latitude,
          proximityLng: _pickup?.longitude,
          limit: 12,
        );
        if (mounted && seq == _destSearchSeq) {
          setState(() {
            _mapboxSearchResults = results;
            _isSearchingMapbox = false;
          });
        }
      });
    } else {
      setState(() {
        _mapboxSearchResults = [];
        _isSearchingMapbox = false;
      });
    }
  }

  List<LocationModel> _getAllDestinations() {
    final live = ref.read(destinationsListProvider).value;
    if (live != null && live.isNotEmpty) {
      return live
          .map((d) => d.toLocationModel())
          .where((l) => l.hasValidUgandaCoordinates)
          .toList();
    }
    return LocationModel.presets;
  }

  void _selectDestination(LocationModel loc) {
    if (!loc.hasValidUgandaCoordinates) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a destination with verified Uganda coordinates.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _selectedDestination = loc;
      _destController.text = loc.title;
      _destinationQuery = '';
      _mapboxSearchResults = [];
    });
    _resolveVerifiedRouteIfReady();
  }

  Future<void> _resolveVerifiedRouteIfReady() async {
    final p = _pickup;
    final d = _selectedDestination;
    if (p == null ||
        d == null ||
        !p.hasValidUgandaCoordinates ||
        !d.hasValidUgandaCoordinates) {
      return;
    }

    setState(() => _isResolvingRoute = true);
    final route = await MapboxService().getDirections(
      originLat: p.latitude,
      originLng: p.longitude,
      destLat: d.latitude,
      destLng: d.longitude,
    );
    if (!mounted) return;
    setState(() {
      _isResolvingRoute = false;
      if (route.isValid && route.distanceKm > 0) {
        _verifiedRoadDistanceKm = route.distanceKm;
        _verifiedDurationMinutes = route.durationMinutes;
      } else {
        _verifiedRoadDistanceKm = null;
        _verifiedDurationMinutes = null;
      }
    });
  }

  void _confirmAndProceed(VehicleOption selectedOption) {
    if (_pickup == null || !_pickup!.hasValidUgandaCoordinates) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Please select a verified pickup location from the suggestions list.',
          ),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    if (_selectedDestination == null ||
        !_selectedDestination!.hasValidUgandaCoordinates) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Please select a verified destination in Uganda from the suggestions list.',
          ),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    ref.read(rideBookingProvider.notifier).selectVehicle(selectedOption);
    ref.read(rideBookingProvider.notifier).setLocations(
          _pickup!,
          _selectedDestination!,
          verifiedRoadDistanceKm: _verifiedRoadDistanceKm,
          verifiedDurationMinutes: _verifiedDurationMinutes,
        );

    context.push(
      '/rides/vehicle-select',
      extra: {'pickup': _pickup, 'destination': _selectedDestination},
    );
  }

  IconData _getVehicleIcon(VehicleTier tier) {
    switch (tier) {
      case VehicleTier.boda:
        return Icons.two_wheeler_rounded;
      case VehicleTier.go:
        return Icons.directions_car_rounded;
      case VehicleTier.comfort:
        return Icons.car_rental_rounded;
      case VehicleTier.safari4x4:
        return Icons.airport_shuttle_rounded;
      case VehicleTier.tourVan:
        return Icons.rv_hookup_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final remoteConfig = ref.watch(remoteConfigProvider);
    final vehicleOptions = VehicleOption.getOptionsWithPricing(
      remoteConfig.pricing,
      catalogueVehicles: remoteConfig.catalogueVehicles,
      serviceKey: 'ride_hailing',
    );

    final allDestinations = _getAllDestinations();
    final matchedAdminDestinations = _destinationQuery.trim().isEmpty
        ? allDestinations
        : allDestinations.where((loc) {
            final q = _destinationQuery.toLowerCase();
            return loc.title.toLowerCase().contains(q) ||
                loc.address.toLowerCase().contains(q) ||
                loc.city.toLowerCase().contains(q);
          }).toList();

    final List<LocationModel> filteredDestinations = [
      ...matchedAdminDestinations,
      ..._mapboxSearchResults.where(
        (mb) => !matchedAdminDestinations.any(
          (ad) =>
              ad.title.toLowerCase() == mb.title.toLowerCase() &&
              (ad.latitude - mb.latitude).abs() < 0.01,
        ),
      ),
    ];

    final double distanceKm = _verifiedRoadDistanceKm ?? 0.0;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const SafarisAppBar(
        title: 'Where to in Uganda',
        subtitle: 'Select Verified Pickup & Destination',
      ),
      body: SafeArea(
        child: CustomScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          slivers: [
            // 1. Pickup Selection Tabs & Input Card
            SliverToBoxAdapter(
              child: Container(
                margin: const EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  AppSpacing.sm,
                  AppSpacing.md,
                  AppSpacing.xs,
                ),
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'PICKUP LOCATION',
                      style: AppTypography.labelSmall.copyWith(
                        color: AppColors.textTertiary,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                        fontSize: 10,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        _buildPickupOptionChip(
                          label: 'Kampala City Center',
                          choice: PickupChoice.kampalaCenter,
                        ),
                        const SizedBox(width: 6),
                        _buildPickupOptionChip(
                          label: 'Current Location',
                          choice: PickupChoice.currentLocation,
                        ),
                        const SizedBox(width: 6),
                        _buildPickupOptionChip(
                          label: 'Manual Location',
                          choice: PickupChoice.manual,
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        border: Border.all(color: AppColors.border, width: 0.8),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _pickupController,
                              readOnly: _pickupChoice != PickupChoice.manual,
                              onChanged: _onManualPickupChanged,
                              style: AppTypography.bodyMedium.copyWith(
                                color: AppColors.textPrimary,
                                fontSize: 13,
                              ),
                              decoration: InputDecoration(
                                hintText: _pickupChoice == PickupChoice.manual
                                    ? 'Search your pickup town, road or landmark in Uganda...'
                                    : 'Pickup location',
                                filled: false,
                                contentPadding: const EdgeInsets.symmetric(
                                  vertical: 8,
                                ),
                                border: InputBorder.none,
                                enabledBorder: InputBorder.none,
                                focusedBorder: InputBorder.none,
                                hintStyle: AppTypography.bodySmall.copyWith(
                                  color: AppColors.textTertiary,
                                ),
                              ),
                            ),
                          ),
                          if (_isSearchingManualPickup)
                            const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 6),
                              child: SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppColors.accent,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (_pickupChoice == PickupChoice.manual &&
                        _manualPickupResults.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Container(
                        constraints: const BoxConstraints(maxHeight: 160),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius:
                              BorderRadius.circular(AppSpacing.radiusSm),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: ListView.separated(
                          shrinkWrap: true,
                          itemCount: _manualPickupResults.length,
                          separatorBuilder: (_, __) =>
                              Divider(color: AppColors.divider, height: 1),
                          itemBuilder: (context, idx) {
                            final loc = _manualPickupResults[idx];
                            return ListTile(
                              dense: true,
                              title: Text(
                                loc.title,
                                style: AppTypography.titleSmall
                                    .copyWith(fontSize: 13),
                              ),
                              subtitle: Text(
                                loc.address,
                                style: AppTypography.bodySmall
                                    .copyWith(fontSize: 11),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              onTap: () => _selectManualPickup(loc),
                            );
                          },
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Text(
                      'DESTINATION',
                      style: AppTypography.labelSmall.copyWith(
                        color: AppColors.textTertiary,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                        fontSize: 10,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        border: Border.all(color: AppColors.border, width: 0.8),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _destController,
                              autofocus: false,
                              onChanged: _onDestinationQueryChanged,
                              onSubmitted: (_) {
                                // Never automatically select the first search result or fabricate Kampala coordinates on Enter
                                FocusScope.of(context).unfocus();
                                if (_selectedDestination == null) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        'Please select a verified Uganda location from the suggestions list below.',
                                      ),
                                    ),
                                  );
                                }
                              },
                              style: AppTypography.bodyMedium.copyWith(
                                color: AppColors.textPrimary,
                                fontSize: 13,
                              ),
                              decoration: InputDecoration(
                                hintText:
                                    'Search Mbarara, Kabale, Rukungiri, Gulu, villages or hotels...',
                                filled: false,
                                contentPadding: const EdgeInsets.symmetric(
                                  vertical: 8,
                                ),
                                border: InputBorder.none,
                                enabledBorder: InputBorder.none,
                                focusedBorder: InputBorder.none,
                                hintStyle: AppTypography.bodySmall.copyWith(
                                  color: AppColors.textTertiary,
                                ),
                              ),
                            ),
                          ),
                          if (_isSearchingMapbox || _isResolvingRoute)
                            const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 6),
                              child: SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppColors.accent,
                                ),
                              ),
                            ),
                          if (_destController.text.isNotEmpty)
                            GestureDetector(
                              onTap: () {
                                setState(() {
                                  _destController.clear();
                                  _destinationQuery = '';
                                  _mapboxSearchResults = [];
                                  _selectedDestination = null;
                                  _verifiedRoadDistanceKm = null;
                                  _verifiedDurationMinutes = null;
                                });
                              },
                              child: Padding(
                                padding: const EdgeInsets.all(4),
                                child: Icon(
                                  Icons.close_rounded,
                                  size: 16,
                                  color: AppColors.iconSecondary,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // 2. If a verified destination and pickup are selected: Show Dynamic Fares Matrix & Trip Duration
            if (_selectedDestination != null && _pickup != null) ...[
              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                        vertical: 6,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            distanceKm > 0
                                ? 'AVAILABLE VEHICLES (${distanceKm.toStringAsFixed(1)} KM ROAD • ${vehicleOptions[_selectedVehicleIndex.clamp(0, vehicleOptions.length - 1)].formatTripDuration(distanceKm, overrideMinutes: _verifiedDurationMinutes)})'
                                : _isResolvingRoute
                                    ? 'RESOLVING VERIFIED ROAD ROUTE...'
                                    : 'SELECT VEHICLE TIER',
                            style: AppTypography.labelSmall.copyWith(
                              color: AppColors.textTertiary,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.6,
                              fontSize: 10,
                            ),
                          ),
                          Text(
                            'Rates set by Admin',
                            style: AppTypography.bodySmall.copyWith(
                              color: AppColors.accent,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      height: 110,
                      margin: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                      ),
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: vehicleOptions.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (context, index) {
                          final vehicle = vehicleOptions[index];
                          final isSelected = _selectedVehicleIndex == index;
                          final fare = vehicle.calculateFare(
                            distanceKm,
                            durationMinutes: _verifiedDurationMinutes ?? 0,
                          );
                          final tripDuration = vehicle.formatTripDuration(
                            distanceKm,
                            overrideMinutes: _verifiedDurationMinutes,
                          );

                          return GestureDetector(
                            onTap: () =>
                                setState(() => _selectedVehicleIndex = index),
                            child: Container(
                              width: 140,
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? AppColors.surfaceHigher
                                    : AppColors.surfaceElevated,
                                borderRadius: BorderRadius.circular(
                                  AppSpacing.radiusSm,
                                ),
                                border: Border.all(
                                  color: isSelected
                                      ? AppColors.accent
                                      : AppColors.border,
                                  width: isSelected ? 1.5 : 1,
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Icon(
                                        _getVehicleIcon(vehicle.tier),
                                        size: 20,
                                        color: isSelected
                                            ? AppColors.accent
                                            : AppColors.iconSecondary,
                                      ),
                                      Text(
                                        distanceKm > 0 ? '~$tripDuration' : '',
                                        style: AppTypography.bodySmall.copyWith(
                                          fontSize: 10,
                                          color: isSelected
                                              ? AppColors.accent
                                              : AppColors.textTertiary,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                  Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        vehicle.title,
                                        style:
                                            AppTypography.labelMedium.copyWith(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 12,
                                          color: AppColors.textPrimary,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        distanceKm > 0
                                            ? CurrencyFormatter.formatUGX(fare)
                                            : '${CurrencyFormatter.formatUGX(vehicle.perKmUGX)}/km',
                                        style:
                                            AppTypography.labelSmall.copyWith(
                                          color: isSelected
                                              ? AppColors.accent
                                              : AppColors.textPrimary,
                                          fontWeight: FontWeight.w700,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                      ),
                      child: SizedBox(
                        width: double.infinity,
                        child: SafarisButton(
                          text: distanceKm > 0
                              ? 'Select ${vehicleOptions[_selectedVehicleIndex.clamp(0, vehicleOptions.length - 1)].title} (${vehicleOptions[_selectedVehicleIndex.clamp(0, vehicleOptions.length - 1)].formatTripDuration(distanceKm, overrideMinutes: _verifiedDurationMinutes)})'
                              : 'View Route & Fare for ${vehicleOptions[_selectedVehicleIndex.clamp(0, vehicleOptions.length - 1)].title}',
                          icon: const Icon(
                            Icons.arrow_forward_rounded,
                            size: 16,
                            color: Colors.black,
                          ),
                          onPressed: () => _confirmAndProceed(
                            vehicleOptions[_selectedVehicleIndex.clamp(
                              0,
                              vehicleOptions.length - 1,
                            )],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                  ],
                ),
              ),
            ],

            // 3. Destinations List Section Header
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: 6,
                ),
                child: Row(
                  children: [
                    Text(
                      'UGANDA DESTINATIONS & SEARCH RESULTS',
                      style: AppTypography.labelSmall.copyWith(
                        color: AppColors.textTertiary,
                        letterSpacing: 0.6,
                        fontWeight: FontWeight.w700,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // 4. Destinations Slivers List
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    if (index.isOdd) {
                      return Divider(color: AppColors.divider, height: 1);
                    }
                    final loc = filteredDestinations[index ~/ 2];
                    final isSelected = _selectedDestination?.id == loc.id;

                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        vertical: 2,
                        horizontal: 4,
                      ),
                      leading: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppColors.accent.withValues(alpha: 0.15)
                              : AppColors.surfaceElevated,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: isSelected
                                ? AppColors.accent
                                : AppColors.border,
                            width: 0.8,
                          ),
                        ),
                        child: Icon(
                          loc.category == 'airport' || loc.id.contains('airport')
                              ? Icons.flight_rounded
                              : loc.category == 'safari' || loc.id.contains('gate')
                                  ? Icons.park_rounded
                                  : Icons.location_on_rounded,
                          size: 18,
                          color: isSelected
                              ? AppColors.accent
                              : AppColors.textSecondary,
                        ),
                      ),
                      title: Text(
                        loc.title,
                        style: AppTypography.titleSmall.copyWith(
                          fontSize: 14,
                          fontWeight:
                              isSelected ? FontWeight.w700 : FontWeight.w600,
                          color: isSelected
                              ? AppColors.accent
                              : AppColors.textPrimary,
                        ),
                      ),
                      subtitle: Text(
                        loc.address,
                        style: AppTypography.bodySmall.copyWith(fontSize: 11),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: Icon(
                        Icons.arrow_forward_ios_rounded,
                        size: 12,
                        color: AppColors.iconSecondary,
                      ),
                      onTap: () => _selectDestination(loc),
                    );
                  },
                  childCount: math.max(0, filteredDestinations.length * 2 - 1),
                ),
              ),
            ),

            const SliverToBoxAdapter(
              child: SizedBox(height: 24),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPickupOptionChip({
    required String label,
    required PickupChoice choice,
  }) {
    final isSelected = _pickupChoice == choice;
    return Expanded(
      child: GestureDetector(
        onTap: () => _onPickupChoiceChanged(choice),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.surfaceHigher : AppColors.surface,
            borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
            border: Border.all(
              color: isSelected ? AppColors.accent : AppColors.border,
              width: isSelected ? 1.2 : 0.8,
            ),
          ),
          child: Center(
            child: Text(
              label,
              style: AppTypography.labelSmall.copyWith(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected ? AppColors.accent : AppColors.textSecondary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
      ),
    );
  }
}
