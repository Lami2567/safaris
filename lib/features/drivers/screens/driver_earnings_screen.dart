import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../authentication/session_provider.dart';

class DriverEarningsScreen extends ConsumerStatefulWidget {
  const DriverEarningsScreen({super.key});

  @override
  ConsumerState<DriverEarningsScreen> createState() => _DriverEarningsScreenState();
}

class _DriverEarningsScreenState extends ConsumerState<DriverEarningsScreen> {
  final ApiClient _api = ApiClient();
  bool _loading = true;
  bool _isCashingOut = false;
  double _walletBalanceUGX = 0;
  double _todayEarningsUGX = 0;
  int _completedTripsToday = 0;
  int _totalTrips = 0;
  List<Map<String, dynamic>> _completedTrips = [];

  @override
  void initState() {
    super.initState();
    _loadEarningsData();
  }

  Future<void> _loadEarningsData() async {
    setState(() => _loading = true);
    try {
      final res = await _api.get('/drivers/dashboard');
      if (res.success && res.data is Map) {
        final data = Map<String, dynamic>.from(res.data as Map);
        final tripsList = (data['completedTrips'] as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            [];
        if (mounted) {
          setState(() {
            _walletBalanceUGX = (data['walletBalanceUGX'] as num?)?.toDouble() ?? 0.0;
            _todayEarningsUGX = (data['todayEarningsUGX'] as num?)?.toDouble() ?? 0.0;
            _completedTripsToday = (data['completedTripsToday'] as num?)?.toInt() ?? 0;
            _totalTrips = (data['totalTrips'] as num?)?.toInt() ?? tripsList.length;
            _completedTrips = tripsList;
          });
        }
      }
    } catch (_) {}
    if (mounted) {
      setState(() => _loading = false);
    }
  }

  Future<void> _handleCashOut() async {
    if (_walletBalanceUGX <= 0) return;
    setState(() => _isCashingOut = true);
    try {
      final user = ref.read(currentUserProvider);
      final res = await _api.post('/drivers/cashout', body: {
        'amountUGX': _walletBalanceUGX,
        'phoneNumber': user.phone,
      });
      if (mounted) {
        if (res.success) {
          await ref.read(currentUserProvider.notifier).refreshProfile();
          setState(() {
            _walletBalanceUGX = 0;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                (res.data is Map && res.data['message'] != null)
                    ? res.data['message'].toString()
                    : 'Payout dispatched to your registered Mobile Money account.',
              ),
              backgroundColor: AppColors.success,
            ),
          );
          await _loadEarningsData();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(res.message ?? 'Cashout failed.'),
              backgroundColor: AppColors.error,
            ),
          );
        }
      }
    } finally {
      if (mounted) {
        setState(() => _isCashingOut = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const SafarisAppBar(
        title: 'Driver Earnings',
        subtitle: 'Real-time wallet balance & completed trip history',
      ),
      body: RefreshIndicator(
        onRefresh: _loadEarningsData,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            // Available Wallet Balance Card
            Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
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
                      Text('AVAILABLE WALLET BALANCE', style: AppTypography.labelSmall.copyWith(letterSpacing: 1.0)),
                      const SafarisBadge(text: 'INSTANT CASHOUT', variant: SafarisBadgeVariant.accent),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    CurrencyFormatter.formatUGX(_walletBalanceUGX),
                    style: AppTypography.displayLarge.copyWith(
                      color: AppColors.accent,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Today\'s Earnings: ${CurrencyFormatter.formatUGX(_todayEarningsUGX)} ($_completedTripsToday completed trips today • $_totalTrips total)',
                    style: AppTypography.bodySmall,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  SafarisButton(
                    text: 'Cash Out to Mobile Money',
                    isLoading: _isCashingOut,
                    onPressed: _walletBalanceUGX > 0 ? _handleCashOut : null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),

            Text('Completed Trips & Fare History', style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.sm),

            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_completedTrips.isEmpty)
              Container(
                padding: const EdgeInsets.all(AppSpacing.lg),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                child: Text(
                  'No completed trips recorded for your account yet. Completed ride fares will appear here automatically.',
                  style: AppTypography.bodySmall,
                ),
              )
            else
              for (final trip in _completedTrips)
                _TripEarningRow(
                  route: '${trip['pickupAddress'] ?? 'Pickup'} → ${trip['dropoffAddress'] ?? 'Destination'}',
                  subtitle:
                      '${trip['distanceKm'] ?? 0} km • ${trip['completedAt'] != null ? trip['completedAt'].toString().split('T').first : 'Completed'}',
                  amountUGX: ((trip['finalPriceUGX'] ?? trip['estimatedPriceUGX'] ?? 0) as num).toDouble(),
                ),
            const SizedBox(height: AppSpacing.xxl),
          ],
        ),
      ),
    );
  }
}

class _TripEarningRow extends StatelessWidget {
  final String route;
  final String subtitle;
  final double amountUGX;

  const _TripEarningRow({
    required this.route,
    required this.subtitle,
    required this.amountUGX,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.border, width: 1),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  route,
                  style: AppTypography.titleSmall.copyWith(fontSize: 13),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(subtitle, style: AppTypography.bodySmall.copyWith(fontSize: 11)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            CurrencyFormatter.formatUGX(amountUGX),
            style: AppTypography.titleSmall.copyWith(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
