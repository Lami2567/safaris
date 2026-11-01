import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/config/remote_config_service.dart';
import '../../../core/services/live_fleet_service.dart';
import '../../../core/services/navigation_service.dart';
import '../../../core/services/user_location_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/utils/geo_utils.dart';
import '../../../shared/components/safaris_map_view.dart';
import '../../../shared/models/location_model.dart';
import '../../rides/models/ride_model.dart';
import '../../rides/ride_provider.dart';
import '../../tourism/services/tourism_api_service.dart';

enum MapPickupChoice {
  kampalaCenter,
  currentLocation,
  manual,
}

/// Production Full-Screen Map Navigation & Route Planning Screen
class LiveMapboxScreen extends ConsumerStatefulWidget {
  final LocationModel? initialDestination;

  const LiveMapboxScreen({
    super.key,
    this.initialDestination,
  });

  @override
  ConsumerState<LiveMapboxScreen> createState() => _LiveMapboxScreenState();
}

class _LiveMapboxScreenState extends ConsumerState<LiveMapboxScreen> {
  MapPickupChoice _pickupChoice = MapPickupChoice.kampalaCenter;
  LocationModel _pickupLocation = LocationModel.kampalaCentral;
  LocationModel? _destinationLocation;
  bool _isNavigating = false;
  int _selectedVehicleIndex = 1; // Default to Safaris Go (Economy)
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _manualPickupController = TextEditingController();
  bool _isSearching = false;
  bool _showManualPickupInput = false;
  List<LocationModel> _filteredPresets = [];

  final NavigationManeuver _demoManeuver = NavigationManeuver(
    type: ManeuverType.turnRight,
    instruction: 'In 300m, turn right onto Entebbe Expressway (Tollway)',
    distanceMeters: 300,
    estimatedSeconds: 25,
    roadName: 'Entebbe Expressway',
  );

  @override
  void initState() {
    super.initState();
    if (widget.initialDestination != null) {
      _destinationLocation = widget.initialDestination;
      _searchController.text = widget.initialDestination!.title;
    }
    _filteredPresets = LocationModel.presets;
  }

  @override
  void dispose() {
    _searchController.dispose();
    _manualPickupController.dispose();
    super.dispose();
  }

  List<LocationModel> _getAllDestinations() {
    final live = ref.read(destinationsListProvider).value;
    if (live != null && live.isNotEmpty) {
      return live.map((d) => d.toLocationModel()).toList();
    }
    return LocationModel.presets;
  }

  void _onPickupChoiceChanged(MapPickupChoice choice) {
    setState(() {
      _pickupChoice = choice;
      if (choice == MapPickupChoice.kampalaCenter) {
        _pickupLocation = LocationModel.kampalaCentral;
        _showManualPickupInput = false;
      } else if (choice == MapPickupChoice.currentLocation) {
        _showManualPickupInput = false;
        final userLoc = ref.read(userLocationProvider);
        if (userLoc.hasCoordinates) {
          _pickupLocation = LocationModel(
            id: 'current_gps',
            title: 'My Current Location',
            address: userLoc.locality.isNotEmpty ? userLoc.locality : 'Kampala, Uganda',
            city: userLoc.locality.split(',').first,
            latitude: userLoc.latitude!,
            longitude: userLoc.longitude!,
          );
        } else {
          _pickupLocation = LocationModel.kampalaCentral;
        }
      } else {
        // Manual entry
        _showManualPickupInput = true;
      }
    });
  }

  void _onManualPickupEntered(String value) {
    if (value.trim().isNotEmpty) {
      setState(() {
        _pickupLocation = LocationModel(
          id: 'manual_pickup',
          title: value.trim(),
          address: value.trim(),
          city: 'Kampala',
          latitude: 0.3136,
          longitude: 32.5811,
        );
      });
    }
  }

  void _onSearchChanged(String query) {
    final all = _getAllDestinations();
    setState(() {
      if (query.trim().isEmpty) {
        _filteredPresets = all;
      } else {
        _filteredPresets = all.where((loc) {
          return loc.title.toLowerCase().contains(query.toLowerCase()) ||
              loc.address.toLowerCase().contains(query.toLowerCase()) ||
              loc.city.toLowerCase().contains(query.toLowerCase());
        }).toList();
      }
    });
  }

  void _selectDestination(LocationModel destination) {
    setState(() {
      _destinationLocation = destination;
      _searchController.text = destination.title;
      _isSearching = false;
      _isNavigating = false;
    });
    FocusScope.of(context).unfocus();
  }

  void _clearDestination() {
    setState(() {
      _destinationLocation = null;
      _searchController.clear();
      _isSearching = false;
      _isNavigating = false;
      _filteredPresets = _getAllDestinations();
    });
  }

  NavigationManeuver _buildNavigationManeuver(LocationModel destination, double distKm) {
    final title = destination.title.toLowerCase();
    String road = 'Primary Route Corridor';
    String instruction = 'Proceed towards ${destination.title}';
    if (title.contains('airport') || title.contains('entebbe')) {
      road = 'Entebbe Expressway (Tollway)';
      instruction = 'Take Entebbe Expressway South towards Entebbe Airport';
    } else if (title.contains('jinja') || title.contains('source')) {
      road = 'Kampala-Jinja Highway';
      instruction = 'Proceed East on Kampala-Jinja Highway towards Nile Bridge';
    } else if (title.contains('bwindi') || title.contains('mbarara') || title.contains('queen')) {
      road = 'Masaka-Mbarara Highway';
      instruction = 'Continue South-West along Masaka-Mbarara Highway';
    } else if (title.contains('murchison') || title.contains('gulu')) {
      road = 'Gulu-Kampala Highway';
      instruction = 'Follow Gulu Highway North towards Murchison Falls';
    } else {
      road = destination.address.isNotEmpty ? destination.address.split(',').first : 'Main Corridor';
      instruction = 'Head towards ${destination.title} via $road';
    }
    return NavigationManeuver(
      type: ManeuverType.straight,
      instruction: instruction,
      distanceMeters: (distKm * 1000).clamp(100, 20000),
      estimatedSeconds: (distKm * 65).clamp(30, 7200).round(),
      roadName: road,
    );
  }

  void _onDriverSelected(LiveDriverLocation driver) {
    if (_destinationLocation != null) {
      ref.read(rideBookingProvider.notifier).setLocations(_pickupLocation, _destinationLocation!);
      context.push(
        '/rides/vehicle-select',
        extra: {
          'pickup': _pickupLocation,
          'destination': _destinationLocation,
          'preferredDriver': driver.name,
          'driverId': driver.driverId,
        },
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Selected ${driver.name} (${driver.plate}). Select destination to plan route.'),
          backgroundColor: AppColors.surfaceElevated,
          duration: const Duration(seconds: 3),
        ),
      );
      setState(() => _isSearching = true);
    }
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
    final fleetState = ref.watch(liveFleetProvider);
    final nearbyDrivers = fleetState.drivers;
    final userLoc = ref.watch(userLocationProvider);
    final double? userLat = userLoc.latitude;
    final double? userLng = userLoc.longitude;

    final remoteConfig = ref.watch(remoteConfigProvider);
    final vehicleOptions = VehicleOption.getOptionsWithPricing(remoteConfig.pricing);

    final destinationsAsync = ref.watch(destinationsListProvider);
    final liveDestinations = destinationsAsync.value ?? [];
    final availableDestinations = liveDestinations.isNotEmpty
        ? liveDestinations.map((d) => d.toLocationModel()).toList()
        : LocationModel.presets;

    double distanceKm = 0.0;
    int durationMins = 0;
    if (_destinationLocation != null) {
      distanceKm = math.max(
        1.2,
        GeoUtils.haversineDistance(
          _pickupLocation.latitude,
          _pickupLocation.longitude,
          _destinationLocation!.latitude,
          _destinationLocation!.longitude,
        ),
      );
      final speed = distanceKm > 35 ? 55.0 : 32.0;
      durationMins = math.max(3, (distanceKm / speed * 60).round());
    }

    final activeManeuver = _destinationLocation != null
        ? _buildNavigationManeuver(_destinationLocation!, distanceKm)
        : _demoManeuver;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: AppColors.textPrimary),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          'Maps',
          style: AppTypography.titleMedium.copyWith(
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        actions: [
          if (nearbyDrivers.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                    border: Border.all(color: AppColors.success, width: 0.8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: AppColors.success,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        '${nearbyDrivers.length} Online',
                        style: const TextStyle(
                          color: AppColors.success,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 1. Pickup Location Section
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'PICKUP LOCATION',
                    style: AppTypography.labelSmall.copyWith(
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _buildPickupChip('Kampala Center', MapPickupChoice.kampalaCenter),
                      const SizedBox(width: 6),
                      _buildPickupChip('Current GPS', MapPickupChoice.currentLocation),
                      const SizedBox(width: 6),
                      _buildPickupChip('Manual Location', MapPickupChoice.manual),
                    ],
                  ),
                  if (_showManualPickupInput) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        border: Border.all(color: AppColors.border, width: 0.8),
                      ),
                      child: TextField(
                        controller: _manualPickupController,
                        style: AppTypography.bodySmall.copyWith(color: AppColors.textPrimary),
                        decoration: InputDecoration(
                          hintText: 'Enter pickup address in Uganda...',
                          hintStyle: AppTypography.bodySmall.copyWith(color: AppColors.textTertiary),
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(vertical: 8),
                        ),
                        onSubmitted: _onManualPickupEntered,
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Text(
                    'From: ${_pickupLocation.title}',
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.textTertiary,
                      fontSize: 11,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),

            const SizedBox(height: 14),

            // 2. Destination Location Section
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'DESTINATION',
                    style: AppTypography.labelSmall.copyWith(
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceElevated,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                      border: Border.all(color: AppColors.border, width: 0.8),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.search_rounded, size: 18, color: AppColors.accent),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: _searchController,
                            onTap: () => setState(() => _isSearching = true),
                            onChanged: _onSearchChanged,
                            style: AppTypography.bodyMedium.copyWith(
                              color: AppColors.textPrimary,
                              fontSize: 13,
                            ),
                            decoration: InputDecoration(
                              hintText: 'Where to in Uganda? (Search destination)',
                              hintStyle: AppTypography.bodySmall.copyWith(color: AppColors.textTertiary),
                              border: InputBorder.none,
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(vertical: 8),
                            ),
                          ),
                        ),
                        if (_destinationLocation != null || _searchController.text.isNotEmpty)
                          GestureDetector(
                            onTap: _clearDestination,
                            child: Padding(padding: const EdgeInsets.all(4), child: Icon(Icons.close_rounded, size: 16, color: AppColors.iconSecondary)),
                          ),
                      ],
                    ),
                  ),

                  // Quick Destination Scroll Chips (when not actively searching)
                  if (!_isSearching) ...[
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 32,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: availableDestinations.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 6),
                        itemBuilder: (context, index) {
                          final loc = availableDestinations[index];
                          final isSelected = _destinationLocation?.id == loc.id;

                          return GestureDetector(
                            onTap: () => _selectDestination(loc),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: isSelected ? AppColors.accent : AppColors.surfaceElevated,
                                borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                                border: Border.all(
                                  color: isSelected ? AppColors.accent : AppColors.border,
                                  width: 0.8,
                                ),
                              ),
                              child: Text(
                                loc.title.split(',').first,
                                style: AppTypography.labelSmall.copyWith(
                                  fontSize: 11,
                                  color: isSelected ? Colors.black : AppColors.textPrimary,
                                  fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],

                  // Autocomplete Search Results Dropdown
                  if (_isSearching) ...[
                    const SizedBox(height: 8),
                    Container(
                      constraints: const BoxConstraints(maxHeight: 220),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        border: Border.all(color: AppColors.border, width: 1),
                      ),
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        shrinkWrap: true,
                        itemCount: _filteredPresets.length,
                        separatorBuilder: (_, __) => Divider(color: AppColors.border, height: 1),
                        itemBuilder: (context, index) {
                          final loc = _filteredPresets[index];
                          return ListTile(
                            dense: true,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                            title: Text(
                              loc.title,
                              style: AppTypography.titleSmall.copyWith(fontSize: 13, fontWeight: FontWeight.w600),
                            ),
                            subtitle: Text(
                              loc.address,
                              style: AppTypography.bodySmall.copyWith(fontSize: 11, color: AppColors.textSecondary),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: Icon(Icons.north_west_rounded, size: 14, color: AppColors.iconSecondary),
                            onTap: () => _selectDestination(loc),
                          );
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 3. The Map Section (Appears after selecting pickup and destination to show route line connecting the two)
            if (_destinationLocation == null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 50,
                      height: 50,
                      decoration: BoxDecoration(
                        color: AppColors.accent.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.map_rounded, size: 26, color: AppColors.accent),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Select Destination to Preview Route',
                      style: AppTypography.titleSmall.copyWith(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Choose a destination above. The interactive map will display the route line connecting your pickup and destination.',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              )
            else ...[
              // Live Route Map Container
              Container(
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.alt_route_rounded, size: 16, color: AppColors.accent),
                            const SizedBox(width: 6),
                            Text(
                              'ROUTE MAP',
                              style: AppTypography.labelSmall.copyWith(
                                color: AppColors.accent,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                        Text(
                          '${distanceKm.toStringAsFixed(1)} km • $durationMins mins',
                          style: AppTypography.labelSmall.copyWith(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Container(
                      height: 320,
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        border: Border.all(color: AppColors.border, width: 1),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: SafarisMapView(
                        pickupLocation: _pickupLocation,
                        destinationLocation: _destinationLocation,
                        showDriver: false,
                        showNearbyDrivers: true,
                        nearbyDrivers: nearbyDrivers,
                        isLiveTrip: _isNavigating,
                        isNavigating: _isNavigating,
                        activeManeuver: _isNavigating ? activeManeuver : null,
                        etaText: '$durationMins mins',
                        distanceText: '${distanceKm.toStringAsFixed(1)} km',
                        userLat: userLat,
                        userLng: userLng,
                        showUserLocation: true,
                        onDriverSelected: _onDriverSelected,
                        bottomPadding: 16.0,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // 4. Vehicle Selection & Price Calculation Section
              Container(
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                padding: const EdgeInsets.all(14),
                child: _buildRouteDetailsCard(vehicleOptions, distanceKm, durationMins),
              ),
            ],

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildPickupChip(String label, MapPickupChoice choice) {
    final isSelected = _pickupChoice == choice;
    return Expanded(
      child: GestureDetector(
        onTap: () => _onPickupChoiceChanged(choice),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
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
                fontSize: 9,
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

  Widget _buildRouteDetailsCard(
    List<VehicleOption> vehicleOptions,
    double distanceKm,
    int durationMins,
  ) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Icon(Icons.directions_car_filled_rounded, size: 16, color: AppColors.accent),
                const SizedBox(width: 6),
                Text(
                  'SELECT VEHICLE & FARE',
                  style: AppTypography.labelSmall.copyWith(
                    color: AppColors.accent,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
            GestureDetector(
              onTap: _clearDestination,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.border, width: 0.8),
                ),
                child: Icon(Icons.close_rounded, size: 14, color: AppColors.textSecondary),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),

        // Route Summary Bar
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _destinationLocation!.title,
              style: AppTypography.titleSmall.copyWith(
                fontWeight: FontWeight.w700,
                fontSize: 15,
                color: AppColors.textPrimary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              '${distanceKm.toStringAsFixed(1)} km • $durationMins mins from ${_pickupLocation.title.split(',').first}',
              style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary, fontSize: 11),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Horizontally scrollable vehicle options with dynamic Admin calculated fares
        SizedBox(
          height: 84,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: vehicleOptions.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final vehicle = vehicleOptions[index];
              final isSelected = _selectedVehicleIndex == index;
              final fare = vehicle.calculateFare(distanceKm);

              return GestureDetector(
                onTap: () => setState(() => _selectedVehicleIndex = index),
                child: Container(
                  width: 120,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: isSelected ? AppColors.surfaceHigher : AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    border: Border.all(
                      color: isSelected ? AppColors.accent : AppColors.border,
                      width: isSelected ? 1.5 : 0.8,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Icon(
                            _getVehicleIcon(vehicle.tier),
                            size: 18,
                            color: isSelected ? AppColors.accent : AppColors.iconSecondary,
                          ),
                          Text(
                            '${vehicle.capacity} seat',
                            style: AppTypography.bodySmall.copyWith(fontSize: 9, color: AppColors.textTertiary),
                          ),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            vehicle.title,
                            style: AppTypography.labelSmall.copyWith(
                              fontWeight: FontWeight.w700,
                              fontSize: 11,
                              color: isSelected ? AppColors.textPrimary : AppColors.textSecondary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            CurrencyFormatter.formatShort(fare.round()),
                            style: AppTypography.bodySmall.copyWith(
                              fontWeight: FontWeight.w700,
                              fontSize: 10,
                              color: isSelected ? AppColors.accent : AppColors.textTertiary,
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
        const SizedBox(height: 10),

        // Action Buttons Row
        Row(
          children: [
            // GPS Nav toggle button
            OutlinedButton.icon(
              icon: Icon(
                _isNavigating ? Icons.stop_rounded : Icons.navigation_rounded,
                size: 16,
                color: _isNavigating ? AppColors.error : AppColors.accent,
              ),
              label: Text(_isNavigating ? 'Exit Nav' : 'GPS Nav'),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                side: BorderSide(
                  color: _isNavigating ? AppColors.error : AppColors.border,
                  width: 1,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                ),
              ),
              onPressed: () {
                setState(() {
                  _isNavigating = !_isNavigating;
                });
              },
            ),
            const SizedBox(width: 8),

            // Request Vehicle Primary CTA
            Expanded(
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accent,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  ),
                ),
                onPressed: () {
                  final vehicle = vehicleOptions[_selectedVehicleIndex.clamp(0, vehicleOptions.length - 1)];
                  ref.read(rideBookingProvider.notifier).setLocations(_pickupLocation, _destinationLocation!);
                  ref.read(rideBookingProvider.notifier).selectVehicle(vehicle);
                  context.push(
                    '/rides/vehicle-select',
                    extra: {
                      'pickup': _pickupLocation,
                      'destination': _destinationLocation,
                    },
                  );
                },
                child: Text(
                  'Book ${vehicleOptions[_selectedVehicleIndex.clamp(0, vehicleOptions.length - 1)].title}',
                  style: AppTypography.titleSmall.copyWith(
                    color: Colors.black,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
