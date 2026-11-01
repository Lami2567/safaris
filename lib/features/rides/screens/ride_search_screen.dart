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
import '../../../core/utils/geo_utils.dart';
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
  LocationModel _pickup = LocationModel.kampalaCentral;
  LocationModel? _selectedDestination;
  int _selectedVehicleIndex = 1; // Default to Safaris Go (Economy)
  String _destinationQuery = '';

  @override
  void initState() {
    super.initState();
    _pickupController = TextEditingController(text: 'Kampala City Center');
    _destController = TextEditingController();
  }

  @override
  void dispose() {
    _pickupController.dispose();
    _destController.dispose();
    super.dispose();
  }

  void _onPickupChoiceChanged(PickupChoice choice) {
    setState(() {
      _pickupChoice = choice;
      if (choice == PickupChoice.kampalaCenter) {
        _pickup = LocationModel.kampalaCentral;
        _pickupController.text = 'Kampala City Center';
      } else if (choice == PickupChoice.currentLocation) {
        final userLoc = ref.read(userLocationProvider);
        if (userLoc.hasCoordinates) {
          _pickup = LocationModel(
            id: 'current_gps',
            title: 'My Current Location',
            address: userLoc.locality.isNotEmpty ? userLoc.locality : 'Kampala, Uganda',
            city: userLoc.locality.split(',').first,
            latitude: userLoc.latitude!,
            longitude: userLoc.longitude!,
          );
          _pickupController.text = 'My Current Location (${userLoc.locality})';
        } else {
          _pickup = LocationModel.kampalaCentral;
          _pickupController.text = 'Current Location (Kampala)';
        }
      } else {
        // Manual entry
        _pickupController.clear();
      }
    });
  }

  void _onManualPickupChanged(String value) {
    setState(() {
      _pickup = LocationModel(
        id: 'manual_pickup',
        title: value.trim().isNotEmpty ? value.trim() : 'Custom Location',
        address: value.trim().isNotEmpty ? value.trim() : 'Uganda',
        city: 'Kampala',
        latitude: 0.3136,
        longitude: 32.5811,
      );
    });
  }

  List<LocationModel> _mapboxSearchResults = [];
  bool _isSearchingMapbox = false;

  void _onDestinationQueryChanged(String val) async {
    setState(() {
      _destinationQuery = val;
      if (_selectedDestination != null && _selectedDestination!.title != val) {
        _selectedDestination = null;
      }
    });

    final trimmed = val.trim();
    if (trimmed.length >= 2) {
      setState(() => _isSearchingMapbox = true);
      final results = await MapboxService().searchPlaces(trimmed);
      if (mounted && _destinationQuery.trim() == trimmed) {
        setState(() {
          _mapboxSearchResults = results;
          _isSearchingMapbox = false;
        });
      }
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
      return live.map((d) => d.toLocationModel()).toList();
    }
    return LocationModel.presets;
  }

  void _selectDestination(LocationModel loc) {
    FocusScope.of(context).unfocus();
    setState(() {
      _selectedDestination = loc;
      _destController.text = loc.title;
      _destinationQuery = '';
      _mapboxSearchResults = [];
    });
  }

  void _confirmAndProceed(VehicleOption selectedOption) {
    if (_selectedDestination == null) {
      if (_destController.text.trim().isNotEmpty) {
        _selectedDestination = LocationModel(
          id: 'custom_dest',
          title: _destController.text.trim(),
          address: _destController.text.trim(),
          city: 'Uganda',
          latitude: 0.3476,
          longitude: 32.5825,
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: const Text('Please enter or select a destination in Uganda'), backgroundColor: AppColors.surfaceElevated),
        );
        return;
      }
    }

    ref.read(rideBookingProvider.notifier).setLocations(_pickup, _selectedDestination!);
    ref.read(rideBookingProvider.notifier).selectVehicle(selectedOption);

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
    final vehicleOptions = VehicleOption.getOptionsWithPricing(remoteConfig.pricing);

    final allDestinations = _getAllDestinations();
    final matchedAdminDestinations = _destinationQuery.trim().isEmpty
        ? allDestinations
        : allDestinations.where((loc) {
            final q = _destinationQuery.toLowerCase();
            return loc.title.toLowerCase().contains(q) ||
                loc.address.toLowerCase().contains(q) ||
                loc.city.toLowerCase().contains(q);
          }).toList();

    // Prioritize admin-configured destinations first, then append verified Mapbox locations
    final List<LocationModel> filteredDestinations = [
      ...matchedAdminDestinations,
      ..._mapboxSearchResults.where((mb) => !matchedAdminDestinations.any((ad) => ad.title.toLowerCase() == mb.title.toLowerCase())),
    ];

    double distanceKm = 0.0;
    if (_selectedDestination != null) {
      distanceKm = math.max(
        1.2,
        GeoUtils.haversineDistance(
          _pickup.latitude,
          _pickup.longitude,
          _selectedDestination!.latitude,
          _selectedDestination!.longitude,
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const SafarisAppBar(
        title: 'Where to in Uganda',
        subtitle: 'Select Pickup & Destination',
      ),
      body: SafeArea(
        child: CustomScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          slivers: [
            // 1. Pickup Selection Tabs & Input Card
            SliverToBoxAdapter(
              child: Container(
                margin: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.xs),
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Pickup label
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

                    // 3-way toggle: Kampala City Center | Current Location | Manual Location
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

                    // Pickup text field
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
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
                              style: AppTypography.bodyMedium.copyWith(color: AppColors.textPrimary, fontSize: 13),
                              decoration: InputDecoration(
                                hintText: _pickupChoice == PickupChoice.manual
                                    ? 'Type your pickup address in Uganda...'
                                    : 'Pickup location',
                                filled: false,
                                contentPadding: const EdgeInsets.symmetric(vertical: 8),
                                border: InputBorder.none,
                                enabledBorder: InputBorder.none,
                                focusedBorder: InputBorder.none,
                                hintStyle: AppTypography.bodySmall.copyWith(color: AppColors.textTertiary),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

                    // Destination label
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

                    // Destination search field
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
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
                              onSubmitted: (value) async {
                                FocusScope.of(context).unfocus();
                                final trimmed = value.trim();
                                if (trimmed.isNotEmpty) {
                                  final matched = allDestinations.where(
                                    (d) => d.title.toLowerCase().contains(trimmed.toLowerCase()),
                                  );
                                  if (matched.isNotEmpty) {
                                    _selectDestination(matched.first);
                                  } else {
                                    final places = await MapboxService().searchPlaces(trimmed);
                                    if (places.isNotEmpty) {
                                      _selectDestination(places.first);
                                    } else {
                                      _selectDestination(LocationModel(
                                        id: 'custom_dest',
                                        title: trimmed,
                                        address: trimmed,
                                        city: 'Uganda',
                                        latitude: 0.3476,
                                        longitude: 32.5825,
                                      ));
                                    }
                                  }
                                }
                              },
                              style: AppTypography.bodyMedium.copyWith(color: AppColors.textPrimary, fontSize: 13),
                              decoration: InputDecoration(
                                hintText: 'Search destinations, areas or places in Uganda...',
                                filled: false,
                                contentPadding: const EdgeInsets.symmetric(vertical: 8),
                                border: InputBorder.none,
                                enabledBorder: InputBorder.none,
                                focusedBorder: InputBorder.none,
                                hintStyle: AppTypography.bodySmall.copyWith(color: AppColors.textTertiary),
                              ),
                            ),
                          ),
                          if (_isSearchingMapbox)
                            const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 6),
                              child: SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent),
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
                                });
                              },
                              child: Padding(padding: const EdgeInsets.all(4), child: Icon(Icons.close_rounded, size: 16, color: AppColors.iconSecondary)),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // 2. If a destination is selected: Show Dynamic Fares Matrix & Trip Duration
            if (_selectedDestination != null) ...[
              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 6),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'AVAILABLE VEHICLES (${distanceKm.toStringAsFixed(1)} KM • ${vehicleOptions[_selectedVehicleIndex.clamp(0, vehicleOptions.length - 1)].formatTripDuration(distanceKm)})',
                            style: AppTypography.labelSmall.copyWith(
                              color: AppColors.textTertiary,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.6,
                              fontSize: 10,
                            ),
                          ),
                          Text(
                            'Rates set by Admin',
                            style: AppTypography.bodySmall.copyWith(color: AppColors.accent, fontSize: 10),
                          ),
                        ],
                      ),
                    ),

                    // Horizontal vehicle list with dynamic fares & calculated duration
                    Container(
                      height: 110,
                      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: vehicleOptions.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (context, index) {
                          final vehicle = vehicleOptions[index];
                          final isSelected = _selectedVehicleIndex == index;
                          final fare = vehicle.calculateFare(distanceKm);
                          final tripDuration = vehicle.formatTripDuration(distanceKm);

                          return GestureDetector(
                            onTap: () => setState(() => _selectedVehicleIndex = index),
                            child: Container(
                              width: 140,
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: isSelected ? AppColors.surfaceHigher : AppColors.surfaceElevated,
                                borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                                border: Border.all(
                                  color: isSelected ? AppColors.accent : AppColors.border,
                                  width: isSelected ? 1.5 : 1,
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
                                        size: 20,
                                        color: isSelected ? AppColors.accent : AppColors.iconSecondary,
                                      ),
                                      Text(
                                        '~${tripDuration}',
                                        style: AppTypography.bodySmall.copyWith(
                                          fontSize: 10,
                                          color: isSelected ? AppColors.accent : AppColors.textTertiary,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        vehicle.title,
                                        style: AppTypography.labelMedium.copyWith(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 12,
                                          color: AppColors.textPrimary,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        CurrencyFormatter.formatUGX(fare),
                                        style: AppTypography.labelSmall.copyWith(
                                          color: isSelected ? AppColors.accent : AppColors.textPrimary,
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

                    // Confirm and request button
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                      child: SizedBox(
                        width: double.infinity,
                        child: SafarisButton(
                          text: 'Select ${vehicleOptions[_selectedVehicleIndex.clamp(0, vehicleOptions.length - 1)].title} (${vehicleOptions[_selectedVehicleIndex.clamp(0, vehicleOptions.length - 1)].formatTripDuration(distanceKm)})',
                          icon: const Icon(Icons.arrow_forward_rounded, size: 16, color: Colors.black),
                          onPressed: () => _confirmAndProceed(
                            vehicleOptions[_selectedVehicleIndex.clamp(0, vehicleOptions.length - 1)],
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
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 6),
                child: Row(
                  children: [
                    Text(
                      'UGANDA DESTINATIONS',
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
                      contentPadding: const EdgeInsets.symmetric(vertical: 2, horizontal: 4),
                      leading: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: isSelected ? AppColors.accent.withOpacity(0.15) : AppColors.surfaceElevated,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: isSelected ? AppColors.accent : AppColors.border,
                            width: 0.8,
                          ),
                        ),
                        child: Icon(
                          loc.id.contains('airport')
                              ? Icons.flight_rounded
                              : loc.id.contains('gate')
                                  ? Icons.park_rounded
                                  : Icons.location_on_rounded,
                          size: 18,
                          color: isSelected ? AppColors.accent : AppColors.textSecondary,
                        ),
                      ),
                      title: Text(
                        loc.title,
                        style: AppTypography.titleSmall.copyWith(
                          fontSize: 14,
                          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w600,
                          color: isSelected ? AppColors.accent : AppColors.textPrimary,
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
