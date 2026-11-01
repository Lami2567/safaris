import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/config/environment_config.dart';
import '../../../core/config/remote_config_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/components/role_drawer.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../../notifications/notification_provider.dart';

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final remoteConfig = ref.watch(remoteConfigProvider);
    final GlobalKey<ScaffoldState> scaffoldKey = GlobalKey<ScaffoldState>();

    return Scaffold(
      key: scaffoldKey,
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
          onPressed: () => scaffoldKey.currentState?.openDrawer(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Admin & Remote Config', style: AppTypography.titleMedium),
            Text('Live Feature Flags & Services', style: AppTypography.bodySmall.copyWith(fontSize: 11)),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          // Banner
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
              border: Border.all(color: AppColors.border, width: 1),
            ),
            child: Row(
              children: [
                const Icon(Icons.cloud_sync_rounded, color: AppColors.accent, size: 28),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Dynamic Remote Configuration',
                        style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        'Changes made here update the UI in real time without a Play Store release.',
                        style: AppTypography.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          // Enabled Services Toggle
          Text(
            'SERVICE DISCOVERY & VISIBILITY',
            style: AppTypography.labelSmall.copyWith(
              color: AppColors.textTertiary,
              letterSpacing: 1.0,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),

          ...remoteConfig.services.map((service) {
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              service.title,
                              style: AppTypography.labelMedium.copyWith(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            if (service.isNew) ...[
                              const SizedBox(width: 6),
                              const SafarisBadge(text: 'NEW', variant: SafarisBadgeVariant.accent),
                            ],
                          ],
                        ),
                        Text(service.subtitle, style: AppTypography.bodySmall.copyWith(fontSize: 11)),
                      ],
                    ),
                  ),
                  Switch(
                    value: service.isEnabled,
                    activeColor: AppColors.accent,
                    onChanged: (val) {
                      ref.read(remoteConfigProvider.notifier).toggleService(service.id, val);
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('${service.title} is now ${val ? "ENABLED" : "DISABLED"}'),
                          duration: const Duration(seconds: 1),
                        ),
                      );
                    },
                  ),
                ],
              ),
            );
          }),
          const SizedBox(height: AppSpacing.lg),

          // Feature Flags
          Text(
            'SYSTEM FEATURE FLAGS',
            style: AppTypography.labelSmall.copyWith(
              color: AppColors.textTertiary,
              letterSpacing: 1.0,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),

          ...remoteConfig.featureFlags.entries.map((entry) {
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    entry.key,
                    style: AppTypography.labelMedium.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Switch(
                    value: entry.value,
                    activeColor: AppColors.accent,
                    onChanged: (val) {
                      ref.read(remoteConfigProvider.notifier).toggleFeatureFlag(entry.key, val);
                    },
                  ),
                ],
              ),
            );
          }),
          const SizedBox(height: AppSpacing.lg),

          // Maintenance Mode Switch
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: remoteConfig.versionConfig.maintenanceMode
                  ? AppColors.errorMuted
                  : AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              border: Border.all(
                color: remoteConfig.versionConfig.maintenanceMode
                    ? AppColors.error
                    : AppColors.border,
                width: 1,
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Maintenance Mode',
                      style: AppTypography.titleSmall.copyWith(
                        color: remoteConfig.versionConfig.maintenanceMode
                            ? AppColors.error
                            : AppColors.textPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'Disables live bookings for maintenance',
                      style: AppTypography.bodySmall,
                    ),
                  ],
                ),
                Switch(
                  value: remoteConfig.versionConfig.maintenanceMode,
                  activeColor: AppColors.error,
                  onChanged: (val) {
                    ref.read(remoteConfigProvider.notifier).updateMaintenanceMode(val);
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          // Mapbox Cartography & API Configuration
          Text(
            'MAPBOX CARTOGRAPHY & API KEY',
            style: AppTypography.labelSmall.copyWith(
              color: AppColors.textTertiary,
              letterSpacing: 1.0,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          const _MapboxTokenCard(),
          const SizedBox(height: AppSpacing.lg),

          // Vehicle Fares & Per-KM Rates
          Text(
            'VEHICLE FARES & PER-KM RATES',
            style: AppTypography.labelSmall.copyWith(
              color: AppColors.textTertiary,
              letterSpacing: 1.0,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          const _VehiclePricingCard(),
          const SizedBox(height: AppSpacing.lg),

          // Admin Notifications Hub
          Text(
            'BROADCAST & NOTIFICATIONS HUB',
            style: AppTypography.labelSmall.copyWith(
              color: AppColors.textTertiary,
              letterSpacing: 1.0,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              border: Border.all(color: AppColors.border, width: 1),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.accent.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                      ),
                      child: const Icon(Icons.campaign_rounded, color: AppColors.accent, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Dispatch Admin Notification',
                            style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
                          ),
                          Text(
                            'Wire alerts directly to database & push real-time to users.',
                            style: AppTypography.bodySmall.copyWith(fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.surfaceElevated,
                      foregroundColor: AppColors.accent,
                      elevation: 0,
                      side: const BorderSide(color: AppColors.accent, width: 0.8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    icon: const Icon(Icons.send_rounded, size: 16),
                    label: const Text('Compose & Broadcast Advisory'),
                    onPressed: () => _openBroadcastDialog(context, ref),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xxl),
        ],
      ),
    );
  }

  void _openBroadcastDialog(BuildContext context, WidgetRef ref) {
    final titleController = TextEditingController();
    final messageController = TextEditingController();
    String selectedCategory = 'Travel Advisory';
    String selectedPriority = 'normal';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusXl)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: EdgeInsets.only(
            left: AppSpacing.lg,
            right: AppSpacing.lg,
            top: AppSpacing.lg,
            bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.lg,
          ),
          child: SingleChildScrollView(
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
                    const Icon(Icons.campaign_rounded, color: AppColors.accent, size: 22),
                    const SizedBox(width: 8),
                    Text(
                      'Broadcast Admin Notification',
                      style: AppTypography.titleMedium.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Writes directly to the PostgreSQL notifications table and broadcasts to all connected clients.',
                  style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.md),
                TextField(
                  controller: titleController,
                  style: AppTypography.bodyMedium.copyWith(color: AppColors.textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Notification Title',
                    labelStyle: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                    filled: true,
                    fillColor: AppColors.surfaceElevated,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                      borderSide: BorderSide(color: AppColors.border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                      borderSide: const BorderSide(color: AppColors.accent),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                TextField(
                  controller: messageController,
                  maxLines: 3,
                  style: AppTypography.bodyMedium.copyWith(color: AppColors.textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Notification Message / Body',
                    labelStyle: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                    filled: true,
                    fillColor: AppColors.surfaceElevated,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                      borderSide: BorderSide(color: AppColors.border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                      borderSide: const BorderSide(color: AppColors.accent),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: selectedCategory,
                        dropdownColor: AppColors.surfaceElevated,
                        style: AppTypography.bodySmall.copyWith(color: AppColors.textPrimary),
                        decoration: InputDecoration(
                          labelText: 'Category',
                          labelStyle: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                          filled: true,
                          fillColor: AppColors.surfaceElevated,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                            borderSide: BorderSide(color: AppColors.border),
                          ),
                        ),
                        items: const [
                          DropdownMenuItem(value: 'Travel Advisory', child: Text('Travel Advisory')),
                          DropdownMenuItem(value: 'Promo Discount', child: Text('Promo Discount')),
                          DropdownMenuItem(value: 'Security Alert', child: Text('Security Alert')),
                          DropdownMenuItem(value: 'Platform Update', child: Text('Platform Update')),
                        ],
                        onChanged: (val) {
                          if (val != null) setModalState(() => selectedCategory = val);
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: selectedPriority,
                        dropdownColor: AppColors.surfaceElevated,
                        style: AppTypography.bodySmall.copyWith(color: AppColors.textPrimary),
                        decoration: InputDecoration(
                          labelText: 'Priority',
                          labelStyle: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                          filled: true,
                          fillColor: AppColors.surfaceElevated,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                            borderSide: BorderSide(color: AppColors.border),
                          ),
                        ),
                        items: const [
                          DropdownMenuItem(value: 'normal', child: Text('Normal')),
                          DropdownMenuItem(value: 'high', child: Text('High')),
                          DropdownMenuItem(value: 'urgent', child: Text('Urgent')),
                        ],
                        onChanged: (val) {
                          if (val != null) setModalState(() => selectedPriority = val);
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accent,
                      foregroundColor: AppColors.backgroundDark,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.radiusSm)),
                    ),
                    onPressed: () async {
                      final title = titleController.text.trim();
                      final msg = messageController.text.trim();
                      if (title.isEmpty || msg.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Please enter both title and message.')),
                        );
                        return;
                      }

                      Navigator.pop(ctx);
                      try {
                        final res = await ApiClient().post<Map<String, dynamic>>(
                          '/admin/notifications/broadcast',
                          body: {
                            'title': title,
                            'message': msg,
                            'type': 'ADMIN',
                            'category': selectedCategory,
                            'priority': selectedPriority,
                          },
                        );

                        if (res.success) {
                          ref.read(notificationsProvider.notifier).fetchNotifications();
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Admin notification broadcasted directly to database!'),
                              backgroundColor: AppColors.success,
                            ),
                          );
                        } else {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(res.errorMessage ?? 'Failed to broadcast notification.'),
                              backgroundColor: AppColors.error,
                            ),
                          );
                        }
                      } catch (e) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Error: $e'),
                            backgroundColor: AppColors.error,
                          ),
                        );
                      }
                    },
                    child: Text(
                      'Dispatch to Database',
                      style: AppTypography.labelLarge.copyWith(
                        color: AppColors.backgroundDark,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MapboxTokenCard extends ConsumerStatefulWidget {
  const _MapboxTokenCard();

  @override
  ConsumerState<_MapboxTokenCard> createState() => _MapboxTokenCardState();
}

class _MapboxTokenCardState extends ConsumerState<_MapboxTokenCard> {
  late final TextEditingController _controller;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final currentToken = EnvironmentConfig.mapboxAccessToken;
    _controller = TextEditingController(text: currentToken);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _saveToken() async {
    final token = _controller.text.trim();
    setState(() => _saving = true);
    try {
      await EnvironmentConfig.saveMapboxToken(token);
      await ApiClient().put('/app-config', body: {'mapboxAccessToken': token});
      await ref.read(remoteConfigProvider.notifier).fetchFromBackend();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Mapbox Access Token saved permanently to database and applied!'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Saved locally: $e'),
            backgroundColor: AppColors.accent,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(remoteConfigProvider);
    final hasToken = EnvironmentConfig.hasMapboxToken;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.border, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.accent.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    ),
                    child: const Icon(Icons.map_rounded, color: AppColors.accent, size: 20),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Mapbox Public Token',
                    style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
              SafarisBadge(
                text: hasToken ? 'ACTIVE' : 'TOKEN REQUIRED',
                variant: hasToken ? SafarisBadgeVariant.accent : SafarisBadgeVariant.neutral,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Saved permanently to PostgreSQL database & persistent storage. When set, live Mapbox satellite & dark cartography loads automatically across all devices.',
            style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary, height: 1.4),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontFamily: 'monospace'),
            decoration: InputDecoration(
              hintText: 'pk.eyJ1IjoibXVtd2VzYWZhcmlz...',
              hintStyle: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 11),
              filled: true,
              fillColor: AppColors.surfaceElevated,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                borderSide: BorderSide(color: AppColors.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                borderSide: const BorderSide(color: AppColors.accent),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accent,
                foregroundColor: Colors.black,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                ),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              icon: _saving
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                  : const Icon(Icons.save_rounded, size: 16),
              label: Text(
                _saving ? 'Saving to Database...' : 'Save & Connect Token',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              onPressed: _saving ? null : _saveToken,
            ),
          ),
        ],
      ),
    );
  }
}

class _VehiclePricingCard extends ConsumerStatefulWidget {
  const _VehiclePricingCard();

  @override
  ConsumerState<_VehiclePricingCard> createState() => _VehiclePricingCardState();
}

class _VehiclePricingCardState extends ConsumerState<_VehiclePricingCard> {
  late final TextEditingController _bodaBase;
  late final TextEditingController _bodaPerKm;
  late final TextEditingController _goBase;
  late final TextEditingController _goPerKm;
  late final TextEditingController _comfortBase;
  late final TextEditingController _comfortPerKm;
  late final TextEditingController _safariBase;
  late final TextEditingController _safariPerKm;
  late final TextEditingController _tourVanBase;
  late final TextEditingController _tourVanPerKm;

  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final pricing = ref.read(remoteConfigProvider).pricing;
    _bodaBase = TextEditingController(text: (pricing['boda']?['baseFare'] ?? 3000).toString());
    _bodaPerKm = TextEditingController(text: (pricing['boda']?['perKm'] ?? 1200).toString());
    _goBase = TextEditingController(text: (pricing['go']?['baseFare'] ?? pricing['economy']?['baseFare'] ?? 6000).toString());
    _goPerKm = TextEditingController(text: (pricing['go']?['perKm'] ?? pricing['economy']?['perKm'] ?? 2200).toString());
    _comfortBase = TextEditingController(text: (pricing['comfort']?['baseFare'] ?? 10000).toString());
    _comfortPerKm = TextEditingController(text: (pricing['comfort']?['perKm'] ?? 3200).toString());
    _safariBase = TextEditingController(text: (pricing['safari4x4']?['baseFare'] ?? pricing['safari']?['baseFare'] ?? 50000).toString());
    _safariPerKm = TextEditingController(text: (pricing['safari4x4']?['perKm'] ?? pricing['safari']?['perKm'] ?? 6500).toString());
    _tourVanBase = TextEditingController(text: (pricing['tour_van']?['baseFare'] ?? 65000).toString());
    _tourVanPerKm = TextEditingController(text: (pricing['tour_van']?['perKm'] ?? 7500).toString());
  }

  @override
  void dispose() {
    _bodaBase.dispose();
    _bodaPerKm.dispose();
    _goBase.dispose();
    _goPerKm.dispose();
    _comfortBase.dispose();
    _comfortPerKm.dispose();
    _safariBase.dispose();
    _safariPerKm.dispose();
    _tourVanBase.dispose();
    _tourVanPerKm.dispose();
    super.dispose();
  }

  Future<void> _savePricing() async {
    setState(() => _saving = true);
    final updated = {
      'boda': {
        'baseFare': double.tryParse(_bodaBase.text.trim()) ?? 3000,
        'perKm': double.tryParse(_bodaPerKm.text.trim()) ?? 1200,
      },
      'go': {
        'baseFare': double.tryParse(_goBase.text.trim()) ?? 6000,
        'perKm': double.tryParse(_goPerKm.text.trim()) ?? 2200,
      },
      'economy': {
        'baseFare': double.tryParse(_goBase.text.trim()) ?? 6000,
        'perKm': double.tryParse(_goPerKm.text.trim()) ?? 2200,
      },
      'comfort': {
        'baseFare': double.tryParse(_comfortBase.text.trim()) ?? 10000,
        'perKm': double.tryParse(_comfortPerKm.text.trim()) ?? 3200,
      },
      'safari4x4': {
        'baseFare': double.tryParse(_safariBase.text.trim()) ?? 50000,
        'perKm': double.tryParse(_safariPerKm.text.trim()) ?? 6500,
      },
      'safari': {
        'baseFare': double.tryParse(_safariBase.text.trim()) ?? 50000,
        'perKm': double.tryParse(_safariPerKm.text.trim()) ?? 6500,
      },
      'tour_van': {
        'baseFare': double.tryParse(_tourVanBase.text.trim()) ?? 65000,
        'perKm': double.tryParse(_tourVanPerKm.text.trim()) ?? 7500,
      },
    };

    try {
      await ref.read(remoteConfigProvider.notifier).updatePricing(updated);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Vehicle fare rates saved permanently to database!'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save pricing: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  Widget _buildVehicleRow(String name, TextEditingController baseCtrl, TextEditingController perKmCtrl) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        border: Border.all(color: AppColors.border, width: 0.8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            name,
            style: AppTypography.labelMedium.copyWith(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Base Fare (UGX)',
                      style: AppTypography.bodySmall.copyWith(fontSize: 10, color: AppColors.textTertiary),
                    ),
                    const SizedBox(height: 4),
                    TextField(
                      controller: baseCtrl,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Colors.white, fontSize: 13, fontFamily: 'monospace'),
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: AppColors.surface,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppSpacing.radiusXs),
                          borderSide: BorderSide(color: AppColors.border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppSpacing.radiusXs),
                          borderSide: const BorderSide(color: AppColors.accent),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Rate / KM (UGX)',
                      style: AppTypography.bodySmall.copyWith(fontSize: 10, color: AppColors.textTertiary),
                    ),
                    const SizedBox(height: 4),
                    TextField(
                      controller: perKmCtrl,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Colors.white, fontSize: 13, fontFamily: 'monospace'),
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: AppColors.surface,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppSpacing.radiusXs),
                          borderSide: BorderSide(color: AppColors.border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppSpacing.radiusXs),
                          borderSide: const BorderSide(color: AppColors.accent),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.border, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Vehicle Fare Matrix',
                style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w700),
              ),
              const SafarisBadge(
                text: 'LIVE RATES',
                variant: SafarisBadgeVariant.neutral,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Fares across the app are automatically calculated based on base fare + (distance in km * rate per km) configured here.',
            style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary, height: 1.4),
          ),
          const SizedBox(height: 12),
          _buildVehicleRow('Safaris Boda', _bodaBase, _bodaPerKm),
          _buildVehicleRow('Safaris Go (Economy)', _goBase, _goPerKm),
          _buildVehicleRow('Safaris Comfort Sedan', _comfortBase, _comfortPerKm),
          _buildVehicleRow('Safari 4x4 Land Cruiser', _safariBase, _safariPerKm),
          _buildVehicleRow('Safari Tour Van (HiAce)', _tourVanBase, _tourVanPerKm),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accent,
                foregroundColor: Colors.black,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                ),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              icon: _saving
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                  : const Icon(Icons.save_rounded, size: 16),
              label: Text(
                _saving ? 'Saving Rates...' : 'Save Fare Rates to Database',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              onPressed: _saving ? null : _savePricing,
            ),
          ),
        ],
      ),
    );
  }
}


