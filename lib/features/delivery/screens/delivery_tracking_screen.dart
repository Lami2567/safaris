import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/components/safaris_map_view.dart';
import '../../../shared/models/location_model.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../models/delivery_model.dart';

class DeliveryTrackingScreen extends StatefulWidget {
  final DeliveryOrderModel order;

  const DeliveryTrackingScreen({super.key, required this.order});

  @override
  State<DeliveryTrackingScreen> createState() => _DeliveryTrackingScreenState();
}

class _DeliveryTrackingScreenState extends State<DeliveryTrackingScreen> {
  bool _isDelivered = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: SafarisAppBar(
        title: 'Package Tracking',
        subtitle: 'ID: ${widget.order.id}',
      ),
      body: Column(
        children: [
          // Live Courier Map
          Expanded(
            flex: 5,
            child: SafarisMapView(
              pickupLocation: LocationModel.kampalaCentral,
              destinationLocation: LocationModel.acaciaMall,
              showDriver: true,
              isLiveTrip: true,
              distanceText: '3.2 km to recipient',
              etaText: _isDelivered ? 'Delivered' : '14 mins',
            ),
          ),

          // Bottom Tracking Drawer
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusXl)),
              border: Border(top: BorderSide(color: AppColors.border, width: 1)),
            ),
            padding: const EdgeInsets.all(AppSpacing.md),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      SafarisBadge(
                        text: _isDelivered ? 'PACKAGE DELIVERED' : 'COURIER IN TRANSIT',
                        variant: _isDelivered ? SafarisBadgeVariant.success : SafarisBadgeVariant.accent,
                      ),
                      Text(
                        CurrencyFormatter.formatUGX(widget.order.priceUGX),
                        style: AppTypography.titleSmall.copyWith(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Divider(color: AppColors.divider),
                  const SizedBox(height: AppSpacing.sm),

                  // Courier Row
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 22,
                        backgroundColor: AppColors.accent,
                        child: Text(
                          widget.order.courierName[0],
                          style: AppTypography.labelLarge.copyWith(color: AppColors.backgroundDark),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.order.courierName,
                              style: AppTypography.titleSmall.copyWith(fontSize: 15, fontWeight: FontWeight.w700),
                            ),
                            Text(
                              widget.order.courierVehicle,
                              style: AppTypography.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceElevated,
                            shape: BoxShape.circle,
                            border: Border.all(color: AppColors.border, width: 0.8),
                          ),
                          child: Icon(Icons.phone_rounded, size: 18, color: AppColors.iconPrimary),
                        ),
                        onPressed: () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Calling courier ${widget.order.courierPhone}...')),
                          );
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),

                  // Recipient & Destination
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceElevated,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                      border: Border.all(color: AppColors.border, width: 0.8),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.person_pin_circle_rounded, size: 20, color: AppColors.accent),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Recipient: ${widget.order.recipientName} (${widget.order.recipientPhone})',
                                style: AppTypography.labelMedium.copyWith(color: AppColors.textPrimary),
                              ),
                              Text(
                                widget.order.dropoffAddress,
                                style: AppTypography.bodySmall.copyWith(fontSize: 11),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),

                  if (!_isDelivered)
                    SafarisButton(
                      text: 'Confirm Package Handover (Simulation)',
                      onPressed: () {
                        setState(() {
                          _isDelivered = true;
                        });
                      },
                    )
                  else
                    SafarisButton(
                      text: 'Return to Home',
                      variant: SafarisButtonVariant.primary,
                      onPressed: () => context.go('/customer'),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
