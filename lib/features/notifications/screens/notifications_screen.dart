import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../models/notification_model.dart';
import '../notification_provider.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  Widget build(BuildContext context) {
    final notifState = ref.watch(notificationsProvider);
    final notifier = ref.read(notificationsProvider.notifier);
    final activeFilter = notifState.activeFilter;
    final items = notifState.filteredItems;

    return Scaffold(
      backgroundColor: AppColors.background,
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
            child: Icon(Icons.arrow_back_ios_new_rounded, size: 16, color: AppColors.iconPrimary),
          ),
          onPressed: () => context.pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'Notifications',
                  style: AppTypography.titleMedium.copyWith(fontWeight: FontWeight.w700),
                ),
                if (notifState.unreadCount > 0) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.accent,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '${notifState.unreadCount} NEW',
                      style: AppTypography.labelSmall.copyWith(
                        color: AppColors.backgroundDark,
                        fontWeight: FontWeight.w800,
                        fontSize: 9,
                      ),
                    ),
                  ),
                ],
              ],
            ),
            Text(
              'Driver Updates • Payments • Admin Advisories',
              style: AppTypography.bodySmall.copyWith(fontSize: 11, color: AppColors.textSecondary),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            icon: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.surfaceElevated,
                borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                border: Border.all(color: AppColors.border, width: 0.8),
              ),
              child: Icon(Icons.more_vert_rounded, size: 18, color: AppColors.iconPrimary),
            ),
            color: AppColors.surfaceElevated,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              side: BorderSide(color: AppColors.border, width: 0.8),
            ),
            onSelected: (val) {
              if (val == 'mark_all') {
                notifier.markAllAsRead();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('All notifications marked as read.'),
                    duration: Duration(seconds: 1),
                  ),
                );
              } else if (val == 'clear_all') {
                _confirmClearAll(context, notifier, activeFilter);
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'mark_all',
                child: Row(
                  children: [
                    const Icon(Icons.done_all_rounded, size: 18, color: AppColors.accent),
                    const SizedBox(width: 10),
                    Text('Mark all as read', style: AppTypography.bodyMedium),
                  ],
                ),
              ),
              PopupMenuItem(
                value: 'clear_all',
                child: Row(
                  children: [
                    const Icon(Icons.delete_sweep_rounded, size: 18, color: AppColors.error),
                    const SizedBox(width: 10),
                    Text('Clear notifications', style: AppTypography.bodyMedium.copyWith(color: AppColors.error)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(width: AppSpacing.sm),
        ],
      ),
      body: Column(
        children: [
          // Filter Tabs (All, Driver, Payment, Admin)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.border, width: 0.8)),
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _FilterChip(
                    label: 'All',
                    count: notifState.countFor(NotificationCategory.all),
                    unreadCount: notifState.unreadCountFor(NotificationCategory.all),
                    isSelected: activeFilter == NotificationCategory.all,
                    onTap: () => notifier.setFilter(NotificationCategory.all),
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Driver Updates',
                    count: notifState.countFor(NotificationCategory.driver),
                    unreadCount: notifState.unreadCountFor(NotificationCategory.driver),
                    icon: Icons.directions_car_rounded,
                    isSelected: activeFilter == NotificationCategory.driver,
                    accentColor: AppColors.info,
                    onTap: () => notifier.setFilter(NotificationCategory.driver),
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Payment Alerts',
                    count: notifState.countFor(NotificationCategory.payment),
                    unreadCount: notifState.unreadCountFor(NotificationCategory.payment),
                    icon: Icons.account_balance_wallet_rounded,
                    isSelected: activeFilter == NotificationCategory.payment,
                    accentColor: AppColors.success,
                    onTap: () => notifier.setFilter(NotificationCategory.payment),
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Admin Advisories',
                    count: notifState.countFor(NotificationCategory.admin),
                    unreadCount: notifState.unreadCountFor(NotificationCategory.admin),
                    icon: Icons.campaign_rounded,
                    isSelected: activeFilter == NotificationCategory.admin,
                    accentColor: AppColors.accent,
                    onTap: () => notifier.setFilter(NotificationCategory.admin),
                  ),
                ],
              ),
            ),
          ),

          // Notification List
          Expanded(
            child: notifState.isLoading && items.isEmpty
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.accent),
                  )
                : RefreshIndicator(
                    color: AppColors.accent,
                    backgroundColor: AppColors.surfaceElevated,
                    onRefresh: () => notifier.fetchNotifications(),
                    child: items.isEmpty
                        ? _buildEmptyState(activeFilter)
                        : ListView.separated(
                            padding: const EdgeInsets.all(AppSpacing.md),
                            itemCount: items.length,
                            separatorBuilder: (context, index) => const SizedBox(height: 10),
                            itemBuilder: (context, index) {
                              final notif = items[index];
                              return _NotificationCard(
                                notification: notif,
                                onTap: () {
                                  if (!notif.isRead) {
                                    notifier.markAsRead(notif.id);
                                  }
                                  _showNotificationDetail(context, notif);
                                },
                              );
                            },
                          ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(NotificationCategory category) {
    IconData icon;
    String title;
    String subtitle;

    switch (category) {
      case NotificationCategory.driver:
        icon = Icons.directions_car_filled_rounded;
        title = 'No Driver Updates';
        subtitle = 'Ride dispatches, vehicle arrivals, and live trip alerts will show up here.';
        break;
      case NotificationCategory.payment:
        icon = Icons.receipt_long_rounded;
        title = 'No Payment Updates';
        subtitle = 'Mobile Money top-ups, ride receipts, and safari deposits will appear here.';
        break;
      case NotificationCategory.admin:
        icon = Icons.notifications_paused_rounded;
        title = 'No Admin Advisories';
        subtitle = 'Safari travel advisories, national park updates, and special discounts will appear here.';
        break;
      case NotificationCategory.all:
      case NotificationCategory.system:
        icon = Icons.notifications_none_rounded;
        title = 'All Caught Up!';
        subtitle = 'You have no new alerts from drivers, payments, or the Safaris administrative team.';
        break;
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(height: MediaQuery.of(context).size.height * 0.15),
        Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.border, width: 1),
                ),
                child: Icon(icon, size: 40, color: AppColors.textTertiary),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                title,
                style: AppTypography.titleMedium.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: Text(
                  subtitle,
                  textAlign: TextAlign.center,
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.textSecondary,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _confirmClearAll(
    BuildContext context,
    NotificationsNotifier notifier,
    NotificationCategory filter,
  ) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
          side: BorderSide(color: AppColors.border),
        ),
        title: Text(
          filter == NotificationCategory.all
              ? 'Clear All Notifications?'
              : 'Clear ${filter.label}?',
          style: AppTypography.titleMedium,
        ),
        content: Text(
          'This will permanently delete ${filter == NotificationCategory.all ? "all" : filter.label} alerts from the database.',
          style: AppTypography.bodyMedium.copyWith(color: AppColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancel', style: AppTypography.labelMedium.copyWith(color: AppColors.textTertiary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: AppColors.textPrimary,
              elevation: 0,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.radiusSm)),
            ),
            onPressed: () {
              Navigator.pop(ctx);
              notifier.clearAll();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Notifications cleared from database.'),
                  duration: Duration(seconds: 1),
                ),
              );
            },
            child: const Text('Clear'),
          ),
        ],
      ),
    );
  }

  void _showNotificationDetail(BuildContext context, SafarisNotification notif) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusXl)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceHigher,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  ),
                  child: Icon(notif.icon, size: 22, color: AppColors.accent),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        notif.type.label.toUpperCase(),
                        style: AppTypography.labelSmall.copyWith(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.0,
                        ),
                      ),
                      Text(
                        notif.timeAgo,
                        style: AppTypography.bodySmall.copyWith(color: AppColors.textTertiary, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              notif.title,
              style: AppTypography.titleMedium.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              notif.message,
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.textSecondary,
                height: 1.5,
              ),
            ),
            if (notif.metadata.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border, width: 0.8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'EVENT DETAILS',
                      style: AppTypography.labelSmall.copyWith(
                        color: AppColors.textTertiary,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.0,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...notif.metadata.entries.map((e) {
                      String displayVal = e.value.toString();
                      if (e.key.toLowerCase().contains('fare') || e.key.toLowerCase().contains('amount')) {
                        final numVal = num.tryParse(displayVal);
                        if (numVal != null) displayVal = CurrencyFormatter.formatUGX(numVal.toDouble());
                      }
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              e.key,
                              style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                            ),
                            Text(
                              displayVal,
                              style: AppTypography.bodySmall.copyWith(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.error.withValues(alpha: 0.12),
                      foregroundColor: AppColors.error,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                        side: BorderSide(color: AppColors.error.withValues(alpha: 0.4)),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    icon: const Icon(Icons.delete_outline_rounded, size: 18),
                    label: const Text('Delete'),
                    onPressed: () {
                      Navigator.pop(ctx);
                      ref.read(notificationsProvider.notifier).deleteNotification(notif.id);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Notification permanently deleted.'),
                          duration: Duration(seconds: 1),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.surfaceElevated,
                      foregroundColor: AppColors.textPrimary,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                        side: BorderSide(color: AppColors.border),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Close'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final int count;
  final int unreadCount;
  final bool isSelected;
  final IconData? icon;
  final Color? accentColor;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.count,
    required this.unreadCount,
    required this.isSelected,
    this.icon,
    this.accentColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final activeColor = accentColor ?? AppColors.accent;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: isSelected ? activeColor.withOpacity(0.18) : AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? activeColor : AppColors.border,
            width: isSelected ? 1.4 : 0.8,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 14, color: isSelected ? activeColor : AppColors.iconSecondary),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: AppTypography.labelSmall.copyWith(
                color: isSelected ? AppColors.textPrimary : AppColors.textSecondary,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: unreadCount > 0
                    ? (isSelected ? activeColor : AppColors.accent)
                    : AppColors.surfaceHigher,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: AppTypography.labelSmall.copyWith(
                  fontSize: 10,
                  color: unreadCount > 0 ? AppColors.backgroundDark : AppColors.textTertiary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NotificationCard extends StatelessWidget {
  final SafarisNotification notification;
  final VoidCallback onTap;

  const _NotificationCard({
    required this.notification,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final n = notification;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: n.isRead ? AppColors.surface : AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          border: Border.all(color: AppColors.border, width: 0.8),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Category icon
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.surfaceHigher,
                borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
              ),
              child: Icon(n.icon, size: 20, color: AppColors.accent),
            ),
            const SizedBox(width: 12),

            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Flexible(
                              child: Text(
                                n.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppTypography.titleSmall.copyWith(
                                  fontSize: 14,
                                  fontWeight: n.isRead ? FontWeight.w600 : FontWeight.w800,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                            ),
                            if (!n.isRead) ...[
                              const SizedBox(width: 6),
                              Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(
                                  color: AppColors.accent,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        n.timeAgo,
                        style: AppTypography.bodySmall.copyWith(
                          fontSize: 10,
                          color: AppColors.textTertiary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    n.message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyMedium.copyWith(
                      fontSize: 12.5,
                      color: n.isRead ? AppColors.textSecondary : AppColors.textPrimary.withOpacity(0.9),
                      height: 1.4,
                    ),
                  ),

                  // Metadata preview
                  if (n.metadata.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    _buildMetadataPills(n),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMetadataPills(SafarisNotification n) {
    if (n.type == NotificationCategory.driver) {
      final vehicle = n.metadata['vehicle'] ?? n.metadata['vehicleModel'];
      final status = n.metadata['status'];
      return Wrap(
        spacing: 6,
        runSpacing: 4,
        children: [
          if (status != null)
            SafarisBadge(
              text: status.toString(),
              variant: SafarisBadgeVariant.neutral,
            ),
          if (vehicle != null)
            SafarisBadge(
              text: vehicle.toString(),
              variant: SafarisBadgeVariant.accent,
            ),
        ],
      );
    } else if (n.type == NotificationCategory.payment) {
      final amount = n.metadata['amountUgx'] ?? n.metadata['amount'];
      final method = n.metadata['method'] ?? n.metadata['paymentMethod'];
      return Wrap(
        spacing: 6,
        runSpacing: 4,
        children: [
          if (amount != null)
            SafarisBadge(
              text: CurrencyFormatter.formatUGX(
                (amount is num ? amount : num.tryParse(amount.toString()) ?? 0).toDouble(),
              ),
              variant: SafarisBadgeVariant.accent,
            ),
          if (method != null)
            SafarisBadge(
              text: method.toString(),
              variant: SafarisBadgeVariant.neutral,
            ),
        ],
      );
    } else if (n.type == NotificationCategory.admin) {
      final category = n.metadata['category']?.toString() ?? 'Advisory';
      return Wrap(
        spacing: 6,
        runSpacing: 4,
        children: [
          SafarisBadge(
            text: category.toUpperCase(),
            variant: SafarisBadgeVariant.accent,
          ),
          if (n.metadata['promoCode'] != null)
            SafarisBadge(
              text: 'CODE: ${n.metadata['promoCode']}',
              variant: SafarisBadgeVariant.neutral,
            ),
        ],
      );
    }
    return const SizedBox.shrink();
  }
}
