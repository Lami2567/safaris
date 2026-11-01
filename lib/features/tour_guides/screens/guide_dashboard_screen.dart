import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/socket_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/components/role_drawer.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../authentication/session_provider.dart';

class GuideDashboardScreen extends ConsumerStatefulWidget {
  const GuideDashboardScreen({super.key});

  @override
  ConsumerState<GuideDashboardScreen> createState() => _GuideDashboardScreenState();
}

class _GuideDashboardScreenState extends ConsumerState<GuideDashboardScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final ApiClient _api = ApiClient();

  bool _loading = true;
  bool _isAvailable = false;
  bool _isUpdatingAvailability = false;
  String? _busyBookingId;
  Map<String, dynamic>? _guideProfile;
  List<Map<String, dynamic>> _activeBookings = [];
  List<Map<String, dynamic>> _completedBookings = [];
  List<Map<String, dynamic>> _notifications = [];
  double _totalEarningsUGX = 0;

  @override
  void initState() {
    super.initState();
    _initGuideDashboard();
  }

  Future<void> _initGuideDashboard() async {
    await _loadGuideDashboard();
    final user = ref.read(currentUserProvider);
    final socket = RealtimeSocketService();
    if (user.id.isNotEmpty) {
      socket.connect(userId: user.id, role: 'tour_guide');
    }
    socket.on('tour:booking_assigned', (_) => _loadGuideDashboard());
    socket.on('tour:booking_updated', (_) => _loadGuideDashboard());
    socket.on('notification:new', (_) => _loadGuideDashboard());
    socket.on('account:approval_updated', (_) => _loadGuideDashboard());
  }

  Future<void> _loadGuideDashboard() async {
    setState(() => _loading = true);
    try {
      final res = await _api.get('/guides/me/dashboard');
      if (res.success && res.data is Map && mounted) {
        final data = Map<String, dynamic>.from(res.data as Map);
        final guide = data['guide'] is Map ? Map<String, dynamic>.from(data['guide'] as Map) : null;
        final active = (data['activeBookings'] as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            [];
        final completed = (data['completedBookings'] as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            [];
        final notifs = (data['notifications'] as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            [];

        setState(() {
          _guideProfile = guide;
          _isAvailable = guide?['isAvailable'] == true;
          _activeBookings = active;
          _completedBookings = completed;
          _notifications = notifs;
          _totalEarningsUGX = (data['totalEarningsUGX'] as num?)?.toDouble() ?? 0.0;
        });
      }
    } catch (_) {}
    if (mounted) {
      setState(() => _loading = false);
    }
  }

  Future<void> _toggleAvailability(bool nextValue) async {
    if (_isUpdatingAvailability) return;
    setState(() => _isUpdatingAvailability = true);
    try {
      final res = await _api.put('/guides/me/availability', body: {'isAvailable': nextValue});
      if (res.success && mounted) {
        setState(() => _isAvailable = nextValue);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res.message ?? 'Cannot update availability.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isUpdatingAvailability = false);
    }
  }

  Future<void> _updateBookingStatus(String bookingId, String nextStatus) async {
    if (_busyBookingId != null) return;
    setState(() => _busyBookingId = bookingId);
    try {
      final res = await _api.put('/tourism/bookings/$bookingId/status', body: {'status': nextStatus});
      if (res.success && mounted) {
        await _loadGuideDashboard();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Booking status updated to $nextStatus.'),
            backgroundColor: AppColors.success,
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res.message ?? 'Failed to update booking status.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busyBookingId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fullName = (_guideProfile?['fullName'] ?? 'Certified Tour Guide').toString();
    final licenseNumber = (_guideProfile?['licenseNumber'] ?? 'UWA Certified').toString();
    final approvalStatus = (_guideProfile?['approvalStatus'] ?? 'APPROVED').toString();
    final rating = (_guideProfile?['rating'] as num?)?.toDouble() ?? 5.0;

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.background,
      drawer: const SafarisDrawer(),
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
              border: Border.all(color: AppColors.border, width: 0.8),
            ),
            child: Icon(Icons.menu_rounded, size: 20, color: AppColors.iconPrimary),
          ),
          onPressed: () => _scaffoldKey.currentState?.openDrawer(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(fullName, style: AppTypography.titleMedium),
            Text('$licenseNumber • Status: $approvalStatus', style: AppTypography.bodySmall.copyWith(fontSize: 11)),
          ],
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh_rounded, color: AppColors.iconPrimary),
            onPressed: _loadGuideDashboard,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadGuideDashboard,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            // Availability Toggle Card
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.surfaceElevated,
                borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
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
                          _isAvailable ? 'AVAILABLE FOR SAFARI TOURS' : 'UNAVAILABLE / OFF DUTY',
                          style: AppTypography.labelMedium.copyWith(
                            color: _isAvailable ? AppColors.success : AppColors.warning,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _isAvailable
                              ? 'Eligible to receive real-time tour assignments'
                              : 'Toggle on when ready for new safari assignments',
                          style: AppTypography.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  Switch(
                    value: _isAvailable,
                    activeColor: AppColors.accent,
                    activeTrackColor: AppColors.accentMuted,
                    onChanged: _isUpdatingAvailability ? null : _toggleAvailability,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),

            // Summary Metrics Card
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  Column(
                    children: [
                      Text('EARNINGS', style: AppTypography.labelSmall),
                      const SizedBox(height: 2),
                      Text(
                        CurrencyFormatter.formatUGX(_totalEarningsUGX),
                        style: AppTypography.titleSmall.copyWith(color: AppColors.accent, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                  Container(width: 1, height: 28, color: AppColors.border),
                  Column(
                    children: [
                      Text('ACTIVE TOURS', style: AppTypography.labelSmall),
                      const SizedBox(height: 2),
                      Text('${_activeBookings.length}', style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w800)),
                    ],
                  ),
                  Container(width: 1, height: 28, color: AppColors.border),
                  Column(
                    children: [
                      Text('RATING', style: AppTypography.labelSmall),
                      const SizedBox(height: 2),
                      Text('${rating.toStringAsFixed(1)} ★', style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w800)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            // Active & Upcoming Assigned Tours
            Text(
              'Assigned Safari Bookings (${_activeBookings.length})',
              style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: AppSpacing.xs),

            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 28),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_activeBookings.isEmpty)
              Container(
                padding: const EdgeInsets.all(AppSpacing.lg),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                child: Text(
                  'No active safari tours are currently assigned to your account. When a customer books or an administrator assigns a tour to you, it will appear here in real time.',
                  style: AppTypography.bodySmall,
                ),
              )
            else
              for (final booking in _activeBookings)
                _AssignedBookingCard(
                  booking: booking,
                  isBusy: _busyBookingId == booking['id']?.toString(),
                  onUpdateStatus: (status) => _updateBookingStatus(booking['id'].toString(), status),
                ),

            const SizedBox(height: AppSpacing.xl),

            // Completed Tours History
            Text(
              'Completed Tours (${_completedBookings.length})',
              style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: AppSpacing.xs),
            if (_completedBookings.isEmpty)
              Text('No completed tours recorded yet.', style: AppTypography.bodySmall)
            else
              for (final b in _completedBookings)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(AppSpacing.md),
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
                              (b['package']?['title'] ?? b['destination']?['name'] ?? 'Safari Tour').toString(),
                              style: AppTypography.titleSmall.copyWith(fontSize: 14),
                            ),
                            Text(
                              'Guest: ${b['customer']?['fullName'] ?? 'Customer'} • ${b['guestsCount'] ?? 1} Guests',
                              style: AppTypography.bodySmall.copyWith(fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        CurrencyFormatter.formatUGX(((b['totalAmountUGX'] ?? 0) as num).toDouble()),
                        style: AppTypography.titleSmall.copyWith(color: AppColors.accent, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),

            if (_notifications.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xl),
              Text('Recent Notifications', style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: AppSpacing.xs),
              for (final n in _notifications.take(5))
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    border: Border.all(color: AppColors.border, width: 1),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text((n['title'] ?? '').toString(), style: AppTypography.labelMedium),
                      const SizedBox(height: 2),
                      Text((n['body'] ?? '').toString(), style: AppTypography.bodySmall),
                    ],
                  ),
                ),
            ],
            const SizedBox(height: AppSpacing.xxl),
          ],
        ),
      ),
    );
  }
}

class _AssignedBookingCard extends StatelessWidget {
  final Map<String, dynamic> booking;
  final bool isBusy;
  final void Function(String status) onUpdateStatus;

  const _AssignedBookingCard({
    required this.booking,
    required this.isBusy,
    required this.onUpdateStatus,
  });

  @override
  Widget build(BuildContext context) {
    final pkg = booking['package'] is Map ? Map<String, dynamic>.from(booking['package'] as Map) : null;
    final dest = booking['destination'] is Map ? Map<String, dynamic>.from(booking['destination'] as Map) : null;
    final customer = booking['customer'] is Map ? Map<String, dynamic>.from(booking['customer'] as Map) : null;
    final status = (booking['bookingStatus'] ?? 'CONFIRMED').toString().toUpperCase();
    final title = (pkg?['title'] ?? dest?['name'] ?? 'Custom Uganda Safari').toString();
    final amount = ((booking['totalAmountUGX'] ?? 0) as num).toDouble();
    final guestsCount = booking['guestsCount'] ?? 1;
    final travelDate = (booking['travelDate'] ?? 'Scheduled').toString().split('T').first;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(color: AppColors.accent, width: 1.2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              SafarisBadge(text: status, variant: SafarisBadgeVariant.accent),
              Text(
                CurrencyFormatter.formatUGX(amount),
                style: AppTypography.titleSmall.copyWith(
                  color: AppColors.accent,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            title,
            style: AppTypography.titleMedium.copyWith(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            'Guest: ${customer?['fullName'] ?? 'Safari Guest'} (${customer?['phone'] ?? '-'})',
            style: AppTypography.bodySmall,
          ),
          Text(
            'Travel Date: $travelDate • $guestsCount Traveler(s)',
            style: AppTypography.bodySmall,
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              if (status == 'PENDING_PAYMENT')
                Expanded(
                  child: SafarisButton(
                    text: 'Confirm Booking',
                    height: 40,
                    isLoading: isBusy,
                    onPressed: () => onUpdateStatus('CONFIRMED'),
                  ),
                )
              else if (status == 'CONFIRMED')
                Expanded(
                  child: SafarisButton(
                    text: 'Start Safari Tour',
                    height: 40,
                    isLoading: isBusy,
                    onPressed: () => onUpdateStatus('IN_PROGRESS'),
                  ),
                )
              else if (status == 'IN_PROGRESS')
                Expanded(
                  child: SafarisButton(
                    text: 'Complete Safari Tour',
                    height: 40,
                    isLoading: isBusy,
                    onPressed: () => onUpdateStatus('COMPLETED'),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
