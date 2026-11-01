import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/config/remote_config_service.dart';
import '../../../core/services/live_fleet_service.dart';
import '../../../core/services/mapbox_service.dart';
import '../../../core/services/navigation_service.dart';
import '../../../core/services/user_location_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/components/safaris_map_view.dart';
import '../../../shared/models/location_model.dart';
import '../../../shared/widgets/safaris_button.dart';
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
  int _selectedVehicleIndex = 1; // Default to Safaris Go

  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _manualPickupController = TextEditingController();

  bool _isSearching = false;
  bool _isLoadingSearch = false;
  bool _showManualPickupInput = false;
  bool _isLoadingPickupSearch = false;

  List<LocationModel> _destinationSuggestions = [];
  List<LocationModel> _pickupSuggestions = [];
  Timer? _destDebounce;
  Timer? _pickupDebounce;
  int _destSearchSeq = 0;
  int _pickupSearchSeq = 0;

  double _verifiedRoadDistanceKm = 0.0;
  int _verifiedDurationMins = 0;
  bool _isRouteUnavailable = false;
  NavigationManeuver? _activeManeuver;

  @override
  void initState() {
    super.initState();
    if (widget.initialDestination != null &&
        widget.initialDestination!.hasValidUgandaCoordinates) {
      _destinationLocation = widget.initialDestination;
      _searchController.text = widget.initialDestination!.title;
    }
    _destinationSuggestions = LocationModel.presets;
  }

  @override
  void dispose() {
    _destDebounce?.cancel();
    _pickupDebounce?.cancel();
    _searchController.dispose();
    _manualPickupController.dispose();
    super.dispose();
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

  Future<void> _onPickupChoiceChanged(MapPickupChoice choice) async {
    setState(() {
      _pickupChoice = choice;
    });

    if (choice == MapPickupChoice.kampalaCenter) {
      setState(() {
        _pickupLocation = LocationModel.kampalaCentral;
        _showManualPickupInput = false;
        _pickupSuggestions = [];
      });
    } else if (choice == MapPickupChoice.currentLocation) {
      setState(() {
        _showManualPickupInput = false;
        _pickupSuggestions = [];
      });
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
          _pickupLocation = LocationModel(
            id: 'current_gps',
            title: 'My Current Location',
            address: userLoc.locality.isNotEmpty
                ? userLoc.locality
                : 'GPS (${userLoc.latitude!.toStringAsFixed(4)}, ${userLoc.longitude!.toStringAsFixed(4)})',
            city: userLoc.locality.split(',').first,
            latitude: userLoc.latitude!,
            longitude: userLoc.longitude!,
          );
        });
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Hardware GPS is unavailable or denied. Please enable GPS or search your pickup location manually.',
            ),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } else {
      setState(() {
        _showManualPickupInput = true;
      });
    }
  }

  /// Searches Uganda locations for manual pickup — never assigns hardcoded Kampala coordinates
  void _onManualPickupSearchChanged(String query) {
    _pickupDebounce?.cancel();
    final trimmed = query.trim();
    if (trimmed.length < 2) {
      setState(() {
        _pickupSuggestions = [];
        _isLoadingPickupSearch = false;
      });
      return;
    }

    setState(() => _isLoadingPickupSearch = true);
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
        _pickupSuggestions = results;
        _isLoadingPickupSearch = false;
      });
    });
  }

  void _selectManualPickupLocation(LocationModel loc) {
    if (!loc.hasValidUgandaCoordinates) return;
    setState(() {
      _pickupLocation = loc;
      _manualPickupController.text = loc.title;
      _pickupSuggestions = [];
      _verifiedRoadDistanceKm = 0.0;
    });
    FocusScope.of(context).unfocus();
  }

  void _onSearchChanged(String query) {
    _destDebounce?.cancel();
    final trimmed = query.trim();
    if (_destinationLocation != null &&
        _destinationLocation!.title != trimmed) {
      _destinationLocation = null;
      _verifiedRoadDistanceKm = 0.0;
      _verifiedDurationMins = 0;
    }

    if (trimmed.length < 2) {
      setState(() {
        _destinationSuggestions = _getAllDestinations();
        _isLoadingSearch = false;
      });
      return;
    }

    setState(() {
      _isSearching = true;
      _isLoadingSearch = true;
    });
    final seq = ++_destSearchSeq;

    _destDebounce = Timer(const Duration(milliseconds: 280), () async {
      final results = await MapboxService().searchPlaces(
        trimmed,
        proximityLat: _pickupLocation.latitude,
        proximityLng: _pickupLocation.longitude,
        limit: 12,
      );
      if (!mounted || seq != _destSearchSeq) return;
      setState(() {
        _destinationSuggestions = results;
        _isLoadingSearch = false;
      });
    });
  }

  void _selectDestination(LocationModel destination) {
    if (!destination.hasValidUgandaCoordinates) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Selected place does not have verified Uganda coordinates.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }
    setState(() {
      _destinationLocation = destination;
      _searchController.text = destination.title;
      _isSearching = false;
      _isNavigating = false;
      _isRouteUnavailable = false;
    });
    FocusScope.of(context).unfocus();
  }

  void _clearDestination() {
    setState(() {
      _destinationLocation = null;
      _searchController.clear();
      _isSearching = false;
      _isNavigating = false;
      _verifiedRoadDistanceKm = 0.0;
      _verifiedDurationMins = 0;
      _isRouteUnavailable = false;
      _destinationSuggestions = _getAllDestinations();
    });
  }

  void _onRouteResolved(DirectionsRouteResult route) {
    if (!mounted) return;
    if (!route.isValid || route.distanceKm <= 0) {
      setState(() {
        _isRouteUnavailable = true;
        _verifiedRoadDistanceKm = 0.0;
        _verifiedDurationMins = 0;
      });
      return;
    }
    setState(() {
      _isRouteUnavailable = false;
      _verifiedRoadDistanceKm = route.distanceKm;
      _verifiedDurationMins = route.durationMinutes;
      if (route.maneuvers.isNotEmpty) {
        _activeManeuver = route.maneuvers.first;
      }
    });
  }

  void _onDriverSelected(LiveDriverLocation driver) {
    if (_destinationLocation != null &&
        _destinationLocation!.hasValidUgandaCoordinates) {
      ref.read(rideBookingProvider.notifier).setLocations(
            _pickupLocation,
            _destinationLocation!,
            verifiedRoadDistanceKm:
                _verifiedRoadDistanceKm > 0 ? _verifiedRoadDistanceKm : null,
            verifiedDurationMinutes:
                _verifiedDurationMins > 0 ? _verifiedDurationMins : null,
          );
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
          content: Text(
            'Selected ${driver.name} (${driver.plate}). Select a verified destination to plan route.',
          ),
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
    final vehicleOptions = VehicleOption.getOptionsWithPricing(
      remoteConfig.pricing,
      catalogueVehicles: remoteConfig.catalogueVehicles,
      serviceKey: 'ride_hailing',
    );

    final destinationsAsync = ref.watch(destinationsListProvider);
    final liveDestinations = destinationsAsync.value ?? [];
    final availableDestinations = liveDestinations.isNotEmpty
        ? liveDestinations
            .map((d) => d.toLocationModel())
            .where((l) => l.hasValidUgandaCoordinates)
            .toList()
        : LocationModel.presets;

    final double distanceKm = _verifiedRoadDistanceKm;
    final int durationMins = _verifiedDurationMins;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: Icon(
            Icons.arrow_back_ios_new_rounded,
            size: 18,
            color: AppColors.textPrimary,
          ),
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
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
                      _buildPickupChip(
                        'Kampala Center',
                        MapPickupChoice.kampalaCenter,
                      ),
                      const SizedBox(width: 6),
                      _buildPickupChip(
                        'Current GPS',
                        MapPickupChoice.currentLocation,
                      ),
                      const SizedBox(width: 6),
                      _buildPickupChip(
                        'Manual Location',
                        MapPickupChoice.manual,
                      ),
                    ],
                  ),
                  if (_showManualPickupInput) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        border: Border.all(color: AppColors.border, width: 0.8),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _manualPickupController,
                              onChanged: _onManualPickupSearchChanged,
                              style: AppTypography.bodySmall.copyWith(
                                color: AppColors.textPrimary,
                              ),
                              decoration: InputDecoration(
                                hintText:
                                    'Search pickup town, street or landmark in Uganda...',
                                hintStyle: AppTypography.bodySmall.copyWith(
                                  color: AppColors.textTertiary,
                                ),
                                border: InputBorder.none,
                                isDense: true,
                                contentPadding: const EdgeInsets.symmetric(
                                  vertical: 8,
                                ),
                              ),
                            ),
                          ),
                          if (_isLoadingPickupSearch)
                            const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.accent,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (_pickupSuggestions.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Container(
                        constraints: const BoxConstraints(maxHeight: 160),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceElevated,
                          borderRadius:
                              BorderRadius.circular(AppSpacing.radiusSm),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: ListView.separated(
                          shrinkWrap: true,
                          itemCount: _pickupSuggestions.length,
                          separatorBuilder: (_, __) =>
                              Divider(color: AppColors.border, height: 1),
                          itemBuilder: (context, idx) {
                            final loc = _pickupSuggestions[idx];
                            return ListTile(
                              dense: true,
                              title: Text(
                                loc.title,
                                style: AppTypography.titleSmall
                                    .copyWith(fontSize: 12),
                              ),
                              subtitle: Text(
                                loc.address,
                                style: AppTypography.bodySmall
                                    .copyWith(fontSize: 10),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              onTap: () => _selectManualPickupLocation(loc),
                            );
                          },
                        ),
                      ),
                    ],
                  ],
                  const SizedBox(height: 8),
                  Text(
                    'From: ${_pickupLocation.title} (${_pickupLocation.latitude.toStringAsFixed(4)}, ${_pickupLocation.longitude.toStringAsFixed(4)})',
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
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceElevated,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                      border: Border.all(color: AppColors.border, width: 0.8),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.search_rounded,
                          size: 18,
                          color: AppColors.accent,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: _searchController,
                            onTap: () => setState(() => _isSearching = true),
                            onChanged: _onSearchChanged,
                            onSubmitted: (_) {
                              // Never auto-select first search result on Enter
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Please tap a verified Uganda location from the suggestions list below.',
                                  ),
                                ),
                              );
                            },
                            style: AppTypography.bodyMedium.copyWith(
                              color: AppColors.textPrimary,
                              fontSize: 13,
                            ),
                            decoration: InputDecoration(
                              hintText:
                                  'Where to in Uganda? (Mbarara, Kabale, Rukungiri, Gulu...)',
                              hintStyle: AppTypography.bodySmall.copyWith(
                                color: AppColors.textTertiary,
                              ),
                              border: InputBorder.none,
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(
                                vertical: 8,
                              ),
                            ),
                          ),
                        ),
                        if (_isLoadingSearch)
                          const Padding(
                            padding: EdgeInsets.only(right: 6),
                            child: SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.accent,
                              ),
                            ),
                          ),
                        if (_destinationLocation != null ||
                            _searchController.text.isNotEmpty)
                          GestureDetector(
                            onTap: _clearDestination,
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
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? AppColors.accent
                                    : AppColors.surfaceElevated,
                                borderRadius: BorderRadius.circular(
                                  AppSpacing.radiusFull,
                                ),
                                border: Border.all(
                                  color: isSelected
                                      ? AppColors.accent
                                      : AppColors.border,
                                  width: 0.8,
                                ),
                              ),
                              child: Text(
                                loc.title.split(',').first,
                                style: AppTypography.labelSmall.copyWith(
                                  fontSize: 11,
                                  color: isSelected
                                      ? Colors.black
                                      : AppColors.textPrimary,
                                  fontWeight: isSelected
                                      ? FontWeight.w800
                                      : FontWeight.w500,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],

                  // Autocomplete Search Results Dropdown
                  if (_isSearching && _destinationSuggestions.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Container(
                      constraints: const BoxConstraints(maxHeight: 240),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        border: Border.all(color: AppColors.border, width: 1),
                      ),
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        shrinkWrap: true,
                        itemCount: _destinationSuggestions.length,
                        separatorBuilder: (_, __) =>
                            Divider(color: AppColors.border, height: 1),
                        itemBuilder: (context, index) {
                          final loc = _destinationSuggestions[index];
                          return ListTile(
                            dense: true,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 2,
                            ),
                            title: Text(
                              loc.title,
                              style: AppTypography.titleSmall.copyWith(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            subtitle: Text(
                              loc.address,
                              style: AppTypography.bodySmall.copyWith(
                                fontSize: 11,
                                color: AppColors.textSecondary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: Icon(
                              Icons.north_west_rounded,
                              size: 14,
                              color: AppColors.iconSecondary,
                            ),
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

            // 3. The Map Section
            if (_destinationLocation == null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  vertical: 36,
                  horizontal: 20,
                ),
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
                      child: const Icon(
                        Icons.map_rounded,
                        size: 26,
                        color: AppColors.accent,
                      ),
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
                      'Choose a verified Uganda destination above. The interactive map will display the real road route connecting your pickup and destination.',
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
                            const Icon(
                              Icons.alt_route_rounded,
                              size: 16,
                              color: AppColors.accent,
                            ),
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
                          _isRouteUnavailable
                              ? 'Route unavailable'
                              : distanceKm > 0
                                  ? '${distanceKm.toStringAsFixed(1)} km • $durationMins mins'
                                  : 'Calculating road route...',
                          style: AppTypography.labelSmall.copyWith(
                            color: _isRouteUnavailable
                                ? AppColors.error
                                : AppColors.textPrimary,
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
                        activeManeuver: _isNavigating ? _activeManeuver : null,
                        etaText: durationMins > 0 ? '$durationMins mins' : null,
                        distanceText: distanceKm > 0
                            ? '${distanceKm.toStringAsFixed(1)} km'
                            : null,
                        userLat: userLat,
                        userLng: userLng,
                        showUserLocation: true,
                        onDriverSelected: _onDriverSelected,
                        onRouteResolved: _onRouteResolved,
                        bottomPadding: 16.0,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // 4. Vehicle Selection & Dynamic Admin Price Calculation Section
              Container(
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                padding: const EdgeInsets.all(14),
                child: _buildRouteDetailsCard(
                  vehicleOptions,
                  distanceKm,
                  durationMins,
                ),
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
    final safeIdx = _selectedVehicleIndex.clamp(0, vehicleOptions.length - 1);
    final selectedVehicle = vehicleOptions[safeIdx];
    final selectedFare =
        selectedVehicle.calculateFare(distanceKm, durationMinutes: durationMins);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.directions_car_filled_rounded,
                  size: 16,
                  color: AppColors.accent,
                ),
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
                child: Icon(
                  Icons.close_rounded,
                  size: 14,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
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
          _isRouteUnavailable
              ? 'Road route temporarily unavailable'
              : distanceKm > 0
                  ? '${distanceKm.toStringAsFixed(1)} km road route • $durationMins mins from ${_pickupLocation.title.split(',').first}'
                  : 'Resolving road route from ${_pickupLocation.title.split(',').first}...',
          style: AppTypography.bodySmall.copyWith(
            color: _isRouteUnavailable
                ? AppColors.error
                : AppColors.textSecondary,
            fontSize: 11,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 88,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: vehicleOptions.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final vehicle = vehicleOptions[index];
              final isSelected = safeIdx == index;
              final fare = vehicle.calculateFare(
                distanceKm,
                durationMinutes: durationMins,
              );

              return GestureDetector(
                onTap: () => setState(() => _selectedVehicleIndex = index),
                child: Container(
                  width: 132,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? AppColors.surfaceHigher
                        : AppColors.surfaceElevated,
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
                            color: isSelected
                                ? AppColors.accent
                                : AppColors.iconSecondary,
                          ),
                          Text(
                            '${vehicle.capacity}p',
                            style: AppTypography.bodySmall.copyWith(
                              fontSize: 10,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        vehicle.title,
                        style: AppTypography.labelSmall.copyWith(
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        distanceKm > 0
                            ? CurrencyFormatter.formatUGX(fare)
                            : 'Calculating...',
                        style: AppTypography.labelSmall.copyWith(
                          color: isSelected
                              ? AppColors.accent
                              : AppColors.textSecondary,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: SafarisButton(
                text: distanceKm > 0
                    ? 'Book ${selectedVehicle.title} (${CurrencyFormatter.formatUGX(selectedFare)})'
                    : 'Proceed to ${selectedVehicle.title}',
                onPressed: () {
                  if (_isRouteUnavailable) return;
                  ref.read(rideBookingProvider.notifier).selectVehicle(selectedVehicle);
                  ref.read(rideBookingProvider.notifier).setLocations(
                        _pickupLocation,
                        _destinationLocation!,
                        verifiedRoadDistanceKm:
                            distanceKm > 0 ? distanceKm : null,
                        verifiedDurationMinutes:
                            durationMins > 0 ? durationMins : null,
                      );
                  context.push(
                    '/rides/vehicle-select',
                    extra: {
                      'pickup': _pickupLocation,
                      'destination': _destinationLocation,
                    },
                  );
                },
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              icon: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: _isNavigating
                      ? AppColors.accent
                      : AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  border: Border.all(color: AppColors.border),
                ),
                child: Icon(
                  Icons.navigation_rounded,
                  size: 18,
                  color: _isNavigating ? Colors.black : AppColors.accent,
                ),
              ),
              onPressed: () {
                setState(() => _isNavigating = !_isNavigating);
              },
            ),
          ],
        ),
      ],
    );
  }
}
