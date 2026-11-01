import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../../shared/widgets/safaris_text_field.dart';
import '../models/tourism_model.dart';
import '../services/tourism_api_service.dart';
import '../../trips/models/user_activity_model.dart';
import '../../trips/user_activity_provider.dart';
import '../../payments/screens/dpo_checkout_sheet.dart';
import '../../../core/network/api_client.dart';
import '../../../core/config/remote_config_service.dart';

class TourBookingScreen extends ConsumerStatefulWidget {
  final TourPackageModel package;

  const TourBookingScreen({super.key, required this.package});

  @override
  ConsumerState<TourBookingScreen> createState() => _TourBookingScreenState();
}

class _TourBookingScreenState extends ConsumerState<TourBookingScreen> {
  int _travelersCount = 2;
  TourGuideModel? _selectedGuide;
  String? _selectedVehicleId;
  String _pickupLocation = 'Kampala Serena Hotel';
  String _paymentMethod = 'MTN_MOMO';
  bool _isSubmitting = false;

  ServerPriceQuotationModel? _serverQuote;
  bool _isFetchingQuote = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshServerQuote();
    });
  }

  Future<void> _refreshServerQuote() async {
    if (!mounted) return;
    setState(() => _isFetchingQuote = true);
    final guides = ref.read(guidesListProvider).value ?? TourGuideModel.sampleGuides;
    final currentGuide = _selectedGuide ?? (guides.isNotEmpty ? guides.first : null);

    final quote = await ref.read(tourismApiServiceProvider).fetchPriceQuote(
      serviceType: 'TOUR',
      packageId: widget.package.id,
      destinationId: widget.package.destinationId,
      tourGuideId: currentGuide?.id,
      vehicleId: _selectedVehicleId,
      guestsCount: _travelersCount,
      durationDays: widget.package.durationDays,
    );

    if (mounted) {
      setState(() {
        _serverQuote = quote;
        _isFetchingQuote = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final guidesAsync = ref.watch(guidesListProvider);
    final availableGuides = guidesAsync.value ?? TourGuideModel.sampleGuides;
    final currentGuide = _selectedGuide ?? (availableGuides.isNotEmpty ? availableGuides.first : TourGuideModel.sampleGuides.first);

    // Authoritative server total if quote is available; fallback only while quote is loading
    final fallbackTotalUGX = (widget.package.pricePerPersonUGX * _travelersCount) +
        (currentGuide.dailyRateUGX * widget.package.durationDays);
    final totalUGX = _serverQuote?.totalAmountUgx ?? fallbackTotalUGX;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: SafarisAppBar(
        title: 'Book Safari Tour',
        subtitle: widget.package.title,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            // Tour summary card
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.surfaceElevated,
                borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'PACKAGE SELECTED',
                        style: AppTypography.labelSmall.copyWith(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.8,
                        ),
                      ),
                      SafarisBadge(
                        text: '${widget.package.durationDays} DAYS',
                        variant: SafarisBadgeVariant.neutral,
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    widget.package.title,
                    style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${CurrencyFormatter.formatUGX(widget.package.pricePerPersonUGX)} base rate',
                    style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            // Travelers Count
            Text('Number of Travelers', style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.xs),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.surfaceElevated,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '$_travelersCount Persons',
                    style: AppTypography.bodyLarge.copyWith(fontWeight: FontWeight.w600),
                  ),
                  Row(
                    children: [
                      IconButton(
                        icon: Icon(Icons.remove_circle_outline_rounded, color: AppColors.iconSecondary),
                        onPressed: _travelersCount > 1
                            ? () {
                                setState(() => _travelersCount--);
                                _refreshServerQuote();
                              }
                            : null,
                      ),
                      Text('$_travelersCount', style: AppTypography.titleSmall),
                      IconButton(
                        icon: const Icon(Icons.add_circle_outline_rounded, color: AppColors.accent),
                        onPressed: _travelersCount < 15
                            ? () {
                                setState(() => _travelersCount++);
                                _refreshServerQuote();
                              }
                            : null,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            // Certified Tour Guide Selector
            Text('Select Certified Tour Guide', style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.xs),
            ...availableGuides.map((guide) {
              final isSelected = currentGuide.id == guide.id;
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                child: Material(
                  color: isSelected ? AppColors.surfaceHigher : AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  child: InkWell(
                    onTap: () {
                      setState(() => _selectedGuide = guide);
                      _refreshServerQuote();
                    },
                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                        border: Border.all(
                          color: isSelected ? AppColors.accent : AppColors.border,
                          width: isSelected ? 1.5 : 1.0,
                        ),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 20,
                            backgroundColor: AppColors.accent,
                            backgroundImage: guide.avatarUrl.isNotEmpty ? NetworkImage(guide.avatarUrl) : null,
                            child: guide.avatarUrl.isEmpty
                                ? Text(
                                    guide.fullName.isNotEmpty ? guide.fullName[0] : 'G',
                                    style: AppTypography.labelLarge.copyWith(color: AppColors.backgroundDark),
                                  )
                                : null,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      guide.fullName,
                                      style: AppTypography.titleSmall.copyWith(fontSize: 14, fontWeight: FontWeight.w700),
                                    ),
                                    const SizedBox(width: 6),
                                    const Icon(Icons.verified, size: 14, color: AppColors.success),
                                  ],
                                ),
                                Text(
                                  '${guide.title} • ${guide.languages.take(2).join(", ")}',
                                  style: AppTypography.bodySmall.copyWith(fontSize: 11),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            '+${CurrencyFormatter.formatShort(guide.dailyRateUGX)}/day',
                            style: AppTypography.labelSmall.copyWith(
                              color: AppColors.accent,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }),
            const SizedBox(height: AppSpacing.lg),

            // Pickup point
            SafarisTextField(
              labelText: 'Pickup Point in Uganda',
              hintText: 'Kampala Hotel, Residence or Entebbe Airport',
              controller: TextEditingController(text: _pickupLocation),
              onChanged: (v) => _pickupLocation = v,
              prefixIcon: const Icon(Icons.location_city_rounded, size: 20),
            ),
            const SizedBox(height: AppSpacing.lg),

            // Payment Selection (Strictly Admin Governed Channels)
            Text('Payment Method', style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.xs),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: ref.watch(remoteConfigProvider).enabledPaymentMethods.map((m) {
                  final isSelected = _paymentMethod == m.id;
                  IconData icon = Icons.payment_rounded;
                  if (m.id == 'MTN_MOMO' || m.id == 'AIRTEL_MONEY') {
                    icon = Icons.phone_android_rounded;
                  } else if (m.id == 'CARD') {
                    icon = Icons.credit_card_rounded;
                  } else if (m.id == 'WALLET') {
                    icon = Icons.account_balance_wallet_rounded;
                  }

                  return Padding(
                    padding: const EdgeInsets.only(right: 8.0),
                    child: ChoiceChip(
                      avatar: Icon(icon, size: 16, color: isSelected ? AppColors.accent : AppColors.iconSecondary),
                      label: Text(m.name),
                      selected: isSelected,
                      selectedColor: AppColors.surfaceHigher,
                      backgroundColor: AppColors.surface,
                      labelStyle: TextStyle(
                        fontSize: 12,
                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        color: isSelected ? AppColors.accent : AppColors.textPrimary,
                      ),
                      side: BorderSide(
                        color: isSelected ? AppColors.accent : AppColors.border,
                        width: isSelected ? 1.5 : 1.0,
                      ),
                      onSelected: (val) {
                        if (val) {
                          setState(() => _paymentMethod = m.id);
                        }
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: AppSpacing.xl),

            // Authoritative Server Quotation Breakdown Card
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.surfaceHigher,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.borderLight, width: 1),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'SERVER QUOTATION BREAKDOWN',
                        style: AppTypography.labelSmall.copyWith(
                          color: AppColors.accent,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (_isFetchingQuote)
                        const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      else if (_serverQuote != null)
                        Text(
                          'v${_serverQuote!.pricingVersion}',
                          style: AppTypography.labelSmall.copyWith(fontSize: 10),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_serverQuote != null && _serverQuote!.breakdown.isNotEmpty)
                    ..._serverQuote!.breakdown.map((item) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(item.label, style: AppTypography.bodySmall),
                                  if (item.details != null && item.details!.isNotEmpty)
                                    Text(
                                      item.details!,
                                      style: AppTypography.labelSmall.copyWith(fontSize: 9.5, color: AppColors.textSecondary),
                                    ),
                                ],
                              ),
                            ),
                            Text(
                              CurrencyFormatter.formatUGX(item.amountUgx),
                              style: AppTypography.bodySmall.copyWith(color: AppColors.textPrimary, fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      );
                    })
                  else ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Safari Package x $_travelersCount', style: AppTypography.bodySmall),
                        Text(
                          CurrencyFormatter.formatUGX(widget.package.pricePerPersonUGX * _travelersCount),
                          style: AppTypography.bodySmall.copyWith(color: AppColors.textPrimary),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Dedicated Guide x ${widget.package.durationDays} days', style: AppTypography.bodySmall),
                        Text(
                          CurrencyFormatter.formatUGX(currentGuide.dailyRateUGX * widget.package.durationDays),
                          style: AppTypography.bodySmall.copyWith(color: AppColors.textPrimary),
                        ),
                      ],
                    ),
                  ],
                  Divider(height: 16, color: AppColors.divider),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Total Investment', style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700)),
                      Text(
                        CurrencyFormatter.formatUGX(totalUGX),
                        style: AppTypography.titleLarge.copyWith(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),

            // Action button
            SafarisButton(
              text: 'Proceed to Payment (${CurrencyFormatter.formatUGX(totalUGX)})',
              isLoading: _isSubmitting,
              onPressed: () async {
                setState(() => _isSubmitting = true);
                final now = DateTime.now();

                // 1. Create real booking in backend with server quotation & PENDING_PAYMENT status
                String bookingId = 'tb_${now.millisecondsSinceEpoch}';
                double confirmedAmountUGX = totalUGX;
                try {
                  final api = ApiClient();
                  final res = await api.post('/tourism/bookings', body: {
                    'packageId': widget.package.id,
                    'destinationId': widget.package.destinationId,
                    'tourGuideId': currentGuide.id,
                    if (_selectedVehicleId != null) 'vehicleId': _selectedVehicleId,
                    if (_serverQuote != null) 'quotationId': _serverQuote!.quotationId,
                    'travelDate': now.toIso8601String(),
                    'guestsCount': _travelersCount,
                    'durationDays': widget.package.durationDays,
                    'totalUgx': totalUGX,
                    'specialRequests': 'Pickup at $_pickupLocation',
                    'paymentMethod': _paymentMethod,
                  });

                  if (res.success && res.data != null) {
                    bookingId = res.data['id']?.toString() ?? bookingId;
                    final backendTotal = (res.data['total_ugx'] ?? res.data['totalPriceUgx'] as num?)?.toDouble();
                    if (backendTotal != null && backendTotal > 0) {
                      confirmedAmountUGX = backendTotal;
                    }
                  }
                } catch (_) {}

                if (!context.mounted) return;
                setState(() => _isSubmitting = false);

                // 2. Open official DPO Pay checkout sheet with authoritative server amount
                await DpoCheckoutSheet.show(
                  context,
                  amountUGX: confirmedAmountUGX,
                  referenceType: 'TOUR',
                  referenceId: bookingId,
                  description: 'DRIVER: ${widget.package.title} (${widget.package.durationDays} Days)',
                  onPaymentSuccess: () {
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    final dateStr = '${now.day} ${months[now.month - 1]} ${now.year}';
                    ref.read(userActivityProvider.notifier).addActivity(
                      UserActivityItem(
                        id: bookingId,
                        category: ActivityCategory.tourism,
                        title: '${widget.package.title} (${widget.package.durationDays} Days)',
                        route: 'Kampala ➔ ${widget.package.title}',
                        date: dateStr,
                        fareUGX: confirmedAmountUGX,
                        status: 'CONFIRMED',
                        providerName: '${currentGuide.fullName} (Guide)',
                        timestamp: now,
                      ),
                    );

                    showDialog(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        backgroundColor: AppColors.surfaceElevated,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.radiusLg)),
                        title: Row(
                          children: [
                            const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 24),
                            const SizedBox(width: 8),
                            Text('Payment & Safari Confirmed!', style: AppTypography.titleMedium),
                          ],
                        ),
                        content: Text(
                          'Your payment has been verified via DPO Pay. Your expedition "${widget.package.title}" is confirmed. Your guide ${currentGuide.fullName} will contact you before departure.',
                          style: AppTypography.bodyMedium,
                        ),
                        actions: [
                          SafarisButton(
                            text: 'Back to Tourism Home',
                            onPressed: () {
                              Navigator.of(ctx).pop();
                              context.go('/tourism');
                            },
                          ),
                        ],
                      ),
                    );
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
