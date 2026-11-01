import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../../shared/widgets/safaris_text_field.dart';
import '../models/delivery_model.dart';
import '../../trips/models/user_activity_model.dart';
import '../../trips/user_activity_provider.dart';
import '../../../core/network/api_client.dart';
import '../../authentication/session_provider.dart';
import '../../payments/screens/dpo_checkout_sheet.dart';

class DeliveryHomeScreen extends ConsumerStatefulWidget {
  const DeliveryHomeScreen({super.key});

  @override
  ConsumerState<DeliveryHomeScreen> createState() => _DeliveryHomeScreenState();
}

class _DeliveryHomeScreenState extends ConsumerState<DeliveryHomeScreen> {
  final TextEditingController _pickupController =
      TextEditingController(text: 'Kampala CBD, Plot 14 Kampala Road');
  final TextEditingController _dropoffController =
      TextEditingController(text: 'Ntinda Shopping Centre, Kiwatule Road');
  final TextEditingController _recipientNameController =
      TextEditingController(text: 'Grace Nakato');
  final TextEditingController _recipientPhoneController =
      TextEditingController(text: '752839102');
  final TextEditingController _descController =
      TextEditingController(text: 'Legal contracts & documents package');

  PackageCategory _category = PackageCategory.documents;
  bool _isBodaSelected = true;
  double? _serverQuotedPriceUGX;
  String? _quotationId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshDeliveryQuote();
    });
  }

  Future<void> _refreshDeliveryQuote() async {
    try {
      final res = await ApiClient().post<Map<String, dynamic>>('/pricing/quote', body: {
        'serviceType': 'DELIVERY',
        'vehicleId': _isBodaSelected ? 'boda' : 'delivery_van',
        'distanceKm': 6.5,
        'packageCategory': _category.name.toUpperCase(),
        'weightKg': _isBodaSelected ? 2.5 : 25.0,
      });
      if (res.success && res.data != null && mounted) {
        setState(() {
          _serverQuotedPriceUGX = (res.data!['totalPriceUgx'] as num?)?.toDouble();
          _quotationId = res.data!['quotationId']?.toString();
        });
      }
    } catch (_) {}
  }

  double get _estimatedPriceUGX {
    if (_serverQuotedPriceUGX != null && _serverQuotedPriceUGX! > 0) {
      return _serverQuotedPriceUGX!;
    }
    double base = _isBodaSelected ? 7000 : 18000;
    if (_category == PackageCategory.heavyCargo) base += 10000;
    return base;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const SafarisAppBar(
        title: 'Safaris Express Delivery',
        subtitle: 'Fast tracked parcel delivery across Uganda',
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            // Vehicle choice (Boda or Car)
            Row(
              children: [
                Expanded(
                  child: _DeliveryTypeCard(
                    title: 'Boda Express',
                    subtitle: 'Fast city transit • Under 15kg',
                    price: 'From 7,000 UGX',
                    icon: Icons.two_wheeler_rounded,
                    isSelected: _isBodaSelected,
                    onTap: () {
                      setState(() => _isBodaSelected = true);
                      _refreshDeliveryQuote();
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _DeliveryTypeCard(
                    title: 'Van / Car Courier',
                    subtitle: 'Secure boxes • Up to 250kg',
                    price: 'From 18,000 UGX',
                    icon: Icons.local_shipping_rounded,
                    isSelected: !_isBodaSelected,
                    onTap: () {
                      setState(() => _isBodaSelected = false);
                      _refreshDeliveryQuote();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),

            // Pickup & Dropoff Inputs
            Text('Locations', style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.xs),
            SafarisTextField(
              labelText: 'Sender Pickup Location',
              hintText: 'Plot, Street, City',
              controller: _pickupController,
              prefixIcon: const Icon(Icons.radio_button_checked, size: 18, color: AppColors.accent),
            ),
            const SizedBox(height: AppSpacing.sm),
            SafarisTextField(
              labelText: 'Delivery Destination',
              hintText: 'Receiver address in Kampala / Wakiso',
              controller: _dropoffController,
              prefixIcon: Icon(Icons.location_on_rounded, size: 18, color: AppColors.textPrimary),
            ),
            const SizedBox(height: AppSpacing.lg),

            // Recipient Details
            Text('Recipient Details', style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.xs),
            SafarisTextField(
              labelText: 'Recipient Full Name',
              hintText: 'e.g. Grace Nakato',
              controller: _recipientNameController,
              prefixIcon: const Icon(Icons.person_outline_rounded, size: 20),
            ),
            const SizedBox(height: AppSpacing.sm),
            SafarisTextField(
              labelText: 'Recipient Phone Number',
              hintText: '7XX XXXXXX',
              keyboardType: TextInputType.phone,
              controller: _recipientPhoneController,
              prefixIcon: const Icon(Icons.phone_outlined, size: 20),
            ),
            const SizedBox(height: AppSpacing.lg),

            // Package Category Selector
            Text('Package Category', style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _CategoryChip(
                  label: 'Documents',
                  isSelected: _category == PackageCategory.documents,
                  onTap: () {
                    setState(() => _category = PackageCategory.documents);
                    _refreshDeliveryQuote();
                  },
                ),
                _CategoryChip(
                  label: 'Electronics',
                  isSelected: _category == PackageCategory.electronics,
                  onTap: () {
                    setState(() => _category = PackageCategory.electronics);
                    _refreshDeliveryQuote();
                  },
                ),
                _CategoryChip(
                  label: 'Food / Perishables',
                  isSelected: _category == PackageCategory.foodAndPerishables,
                  onTap: () {
                    setState(() => _category = PackageCategory.foodAndPerishables);
                    _refreshDeliveryQuote();
                  },
                ),
                _CategoryChip(
                  label: 'Clothing & Goods',
                  isSelected: _category == PackageCategory.generalMerchandise,
                  onTap: () {
                    setState(() => _category = PackageCategory.generalMerchandise);
                    _refreshDeliveryQuote();
                  },
                ),
                _CategoryChip(
                  label: 'Heavy Cargo',
                  isSelected: _category == PackageCategory.heavyCargo,
                  onTap: () {
                    setState(() => _category = PackageCategory.heavyCargo);
                    _refreshDeliveryQuote();
                  },
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            SafarisTextField(
              labelText: 'Package Content Notes',
              hintText: 'What is inside the package?',
              controller: _descController,
            ),
            const SizedBox(height: AppSpacing.xl),

            // Pricing Summary
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.surfaceElevated,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Estimated Delivery Fee', style: AppTypography.labelSmall),
                      Text(
                        CurrencyFormatter.formatUGX(_estimatedPriceUGX),
                        style: AppTypography.titleLarge.copyWith(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    '~25 mins transit',
                    style: AppTypography.bodySmall.copyWith(color: AppColors.success),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            // Submit Button
            SafarisButton(
              text: 'Pay & Dispatch Courier (${CurrencyFormatter.formatUGX(_estimatedPriceUGX)})',
              icon: const Icon(Icons.payment_rounded, size: 18),
              onPressed: () async {
                final pickup = _pickupController.text.trim();
                final dropoff = _dropoffController.text.trim();
                if (pickup.isEmpty || dropoff.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Please specify pickup and dropoff locations.')),
                  );
                  return;
                }

                final user = ref.read(currentUserProvider);
                final now = DateTime.now();
                final orderId = 'del_${now.millisecondsSinceEpoch}';

                await DpoCheckoutSheet.show(
                  context,
                  amountUGX: _estimatedPriceUGX,
                  referenceType: 'DELIVERY',
                  referenceId: orderId,
                  description: 'Safaris Delivery: ${pickup.split(',').first} to ${dropoff.split(',').first}',
                  onPaymentSuccess: () async {
                    try {
                      await ApiClient().post('/delivery/dispatch', body: {
                        'id': orderId,
                        if (_quotationId != null) 'quotationId': _quotationId,
                        'vehicleId': _isBodaSelected ? 'boda' : 'delivery_van',
                        'senderName': user.fullName.isNotEmpty ? user.fullName : 'DRIVER Sender',
                        'senderPhone': user.phone.isNotEmpty ? user.phone : '+256 700 000000',
                        'recipientName': _recipientNameController.text.trim(),
                        'recipientPhone': '+256 ${_recipientPhoneController.text.trim()}',
                        'pickupAddress': pickup,
                        'pickupLat': 0.3136,
                        'pickupLng': 32.5811,
                        'dropoffAddress': dropoff,
                        'dropoffLat': 0.3580,
                        'dropoffLng': 32.6100,
                        'packageCategory': _category.name.toUpperCase(),
                        'packageWeightKg': _isBodaSelected ? 2.5 : 25.0,
                        'packageDescription': _descController.text.trim(),
                        'distanceKm': 6.5,
                      });
                    } catch (_) {}

                    final timeStr = 'Today at ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
                    final order = DeliveryOrderModel(
                      id: orderId,
                      pickupAddress: pickup,
                      dropoffAddress: dropoff,
                      senderPhone: user.phone.isNotEmpty ? user.phone : '+256 772 123456',
                      recipientName: _recipientNameController.text.trim(),
                      recipientPhone: '+256 ${_recipientPhoneController.text.trim()}',
                      category: _category,
                      packageDescription: _descController.text.trim(),
                      weightKg: _isBodaSelected ? 2.5 : 25.0,
                      priceUGX: _estimatedPriceUGX,
                    );
                    ref.read(userActivityProvider.notifier).addActivity(
                      UserActivityItem(
                        id: order.id,
                        category: ActivityCategory.delivery,
                        title: 'Express Delivery • ${_category.name.toUpperCase()}',
                        route: '${order.pickupAddress.split(',').first} ➔ ${order.dropoffAddress.split(',').first}',
                        date: timeStr,
                        fareUGX: order.priceUGX,
                        status: 'DISPATCHED',
                        providerName: _isBodaSelected ? 'Boda Express Courier' : 'Van Courier',
                        timestamp: now,
                      ),
                    );

                    if (mounted) {
                      context.push('/delivery/tracking', extra: order);
                    }
                  },
                );
              },
            ),
            const SizedBox(height: AppSpacing.xxl),
          ],
        ),
      ),
    );
  }
}

class _DeliveryTypeCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String price;
  final IconData icon;
  final bool isSelected;
  final VoidCallback onTap;

  const _DeliveryTypeCard({
    required this.title,
    required this.subtitle,
    required this.price,
    required this.icon,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.surfaceHigher : AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          border: Border.all(
            color: isSelected ? AppColors.accent : AppColors.border,
            width: isSelected ? 1.5 : 1.0,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 28, color: isSelected ? AppColors.accent : AppColors.iconSecondary),
            const SizedBox(height: 8),
            Text(
              title,
              style: AppTypography.titleSmall.copyWith(
                fontSize: 14,
                color: isSelected ? AppColors.accent : AppColors.textPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Text(subtitle, style: AppTypography.bodySmall.copyWith(fontSize: 11)),
            const SizedBox(height: 6),
            Text(
              price,
              style: AppTypography.labelSmall.copyWith(
                color: isSelected ? AppColors.accent : AppColors.textPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _CategoryChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => onTap(),
      backgroundColor: AppColors.surfaceElevated,
      selectedColor: AppColors.accent.withOpacity(0.2),
      labelStyle: AppTypography.labelSmall.copyWith(
        color: isSelected ? AppColors.accent : AppColors.textSecondary,
        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        side: BorderSide(
          color: isSelected ? AppColors.accent : AppColors.border,
          width: 1,
        ),
      ),
    );
  }
}
