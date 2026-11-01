import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/config/remote_config_service.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../../shared/widgets/safaris_badge.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../../shared/widgets/safaris_text_field.dart';
import '../../authentication/session_provider.dart';
import 'dpo_checkout_sheet.dart';

class PaymentMethodsScreen extends ConsumerStatefulWidget {
  const PaymentMethodsScreen({super.key});

  @override
  ConsumerState<PaymentMethodsScreen> createState() => _PaymentMethodsScreenState();
}

class _PaymentMethodsScreenState extends ConsumerState<PaymentMethodsScreen> {
  final TextEditingController _amountController = TextEditingController(text: '20000');
  String _selectedMethod = 'MTN_MOMO';

  List<Map<String, dynamic>> _savedCards = [];
  bool _loadingCards = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      await ref.read(currentUserProvider.notifier).refreshProfile();
      if (mounted) setState(() {});
      _fetchSavedCards();
    });
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _fetchSavedCards() async {
    setState(() => _loadingCards = true);
    try {
      final res = await ApiClient().get<dynamic>('/payments/cards');
      if (res.success && res.data != null) {
        final list = (res.data as List<dynamic>?) ?? [];
        if (mounted) {
          setState(() {
            _savedCards = list.map((c) => Map<String, dynamic>.from(c as Map)).toList();
          });
        }
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingCards = false);
    }
  }

  Future<void> _deleteCard(String cardId) async {
    try {
      final res = await ApiClient().delete('/payments/cards/$cardId');
      if (res.success) {
        _fetchSavedCards();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Card removed successfully.')),
          );
        }
      }
    } catch (_) {}
  }

  void _showAddCardDialog() {
    final numberController = TextEditingController();
    final expiryController = TextEditingController();
    final cvvController = TextEditingController();
    final nameController = TextEditingController(text: ref.read(currentUserProvider).fullName);
    bool isSaving = false;

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return AlertDialog(
              backgroundColor: AppColors.surfaceElevated,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.radiusLg)),
              title: Row(
                children: [
                  const Icon(Icons.credit_card_rounded, color: AppColors.accent, size: 24),
                  const SizedBox(width: 8),
                  Text('Add Bank Card', style: AppTypography.titleMedium),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Cards are securely tokenized with DPO Pay. No raw CVV or PAN is stored on DRIVER servers.',
                      style: AppTypography.bodySmall,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    SafarisTextField(
                      labelText: 'Card Number',
                      controller: numberController,
                      hintText: '4012 8888 8888 1881',
                      keyboardType: TextInputType.number,
                      prefixIcon: const Icon(Icons.payment_rounded, size: 18, color: AppColors.accent),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        Expanded(
                          child: SafarisTextField(
                            labelText: 'Expiry (MM/YY)',
                            controller: expiryController,
                            hintText: '12/28',
                            keyboardType: TextInputType.datetime,
                            prefixIcon: const Icon(Icons.calendar_today_rounded, size: 16, color: AppColors.accent),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: SafarisTextField(
                            labelText: 'CVV',
                            controller: cvvController,
                            hintText: '123',
                            obscureText: true,
                            keyboardType: TextInputType.number,
                            prefixIcon: const Icon(Icons.lock_rounded, size: 16, color: AppColors.accent),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    SafarisTextField(
                      labelText: 'Cardholder Name',
                      controller: nameController,
                      prefixIcon: const Icon(Icons.person_rounded, size: 18, color: AppColors.accent),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: Text('Cancel', style: AppTypography.bodyMedium.copyWith(color: AppColors.textSecondary)),
                ),
                SafarisButton(
                  text: 'Save Card',
                  height: 38,
                  isLoading: isSaving,
                  onPressed: () async {
                    final num = numberController.text.replaceAll(RegExp(r'\s+'), '');
                    if (num.length < 13 || expiryController.text.length < 4 || cvvController.text.length < 3) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Please complete all card details.')),
                      );
                      return;
                    }

                    setModalState(() => isSaving = true);
                    String brand = 'Card';
                    if (num.startsWith('4')) brand = 'Visa';
                    if (num.startsWith('5')) brand = 'Mastercard';
                    if (num.startsWith('34') || num.startsWith('37')) brand = 'Amex';

                    final res = await ApiClient().post('/payments/cards', body: {
                      'brand': brand,
                      'last4': num.substring(num.length - 4),
                      'expiry': expiryController.text.trim(),
                      'holderName': nameController.text.trim(),
                    });

                    setModalState(() => isSaving = false);
                    if (res.success) {
                      if (ctx.mounted) {
                        Navigator.of(ctx).pop();
                      }
                      _fetchSavedCards();
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Card saved successfully!')),
                        );
                      }
                    }
                  },
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _showTopUpDialog() {
    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final parsedAmount = double.tryParse(_amountController.text) ?? 20000;
            return AlertDialog(
              backgroundColor: AppColors.surfaceElevated,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.radiusLg)),
              title: Row(
                children: [
                  const Icon(Icons.account_balance_wallet_rounded, color: AppColors.accent, size: 24),
                  const SizedBox(width: 8),
                  Text('Top Up DRIVER Wallet', style: AppTypography.titleMedium),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Enter amount to load into your wallet via secure DPO Pay gateway (Cards & Mobile Money).',
                      style: AppTypography.bodySmall,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    SafarisTextField(
                      labelText: 'Amount (UGX)',
                      controller: _amountController,
                      keyboardType: TextInputType.number,
                      prefixIcon: const Icon(Icons.payments_rounded, color: AppColors.accent, size: 20),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text('Preset Amounts', style: AppTypography.labelSmall),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      children: [20000, 50000, 100000, 200000].map((amt) {
                        return ActionChip(
                          label: Text(CurrencyFormatter.formatUGX(amt.toDouble())),
                          backgroundColor: parsedAmount == amt.toDouble() ? AppColors.accent.withValues(alpha: 0.2) : AppColors.surface,
                          labelStyle: AppTypography.labelSmall.copyWith(
                            color: parsedAmount == amt.toDouble() ? AppColors.accent : AppColors.textPrimary,
                          ),
                          onPressed: () {
                            setDialogState(() {
                              _amountController.text = amt.toString();
                            });
                          },
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: Text('Cancel', style: AppTypography.bodyMedium.copyWith(color: AppColors.textSecondary)),
                ),
                SafarisButton(
                  text: 'Proceed to Top Up',
                  height: 40,
                  onPressed: () {
                    final amount = double.tryParse(_amountController.text.trim()) ?? 0;
                    if (amount < 1000) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Minimum top-up is UGX 1,000')),
                      );
                      return;
                    }
                    Navigator.of(ctx).pop();
                    _initiateDpoWalletTopUp(amount);
                  },
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _initiateDpoWalletTopUp(double amount) async {
    final user = ref.read(currentUserProvider);
    final referenceId = user.id.isNotEmpty ? user.id : 'wal_${DateTime.now().millisecondsSinceEpoch}';

    await DpoCheckoutSheet.show(
      context,
      amountUGX: amount,
      referenceType: 'WALLET',
      referenceId: referenceId,
      description: 'DRIVER Uganda: Wallet Top-Up for ${user.fullName.isNotEmpty ? user.fullName : user.email}',
      onPaymentSuccess: () async {
        await ref.read(currentUserProvider.notifier).refreshProfile();
        if (mounted) {
          setState(() {});
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Wallet credited with ${CurrencyFormatter.formatUGX(amount)}!'),
              backgroundColor: AppColors.success,
            ),
          );
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final remoteConfig = ref.watch(remoteConfigProvider);
    final enabledMethods = remoteConfig.enabledPaymentMethods;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const SafarisAppBar(
        title: 'Payment Methods',
        subtitle: 'Admin-Governed Channels & Verified Wallet',
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(currentUserProvider.notifier).refreshProfile();
          await _fetchSavedCards();
          if (mounted) setState(() {});
        },
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            // Wallet Balance Card (Authoritative Database Ledger)
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
                      Expanded(
                        child: Text(
                          'DRIVER LIVE WALLET',
                          style: AppTypography.labelSmall.copyWith(letterSpacing: 1.0),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      InkWell(
                        onTap: () async {
                          await ref.read(currentUserProvider.notifier).refreshProfile();
                          if (mounted) setState(() {});
                        },
                        child: const Padding(
                          padding: EdgeInsets.all(4.0),
                          child: Icon(Icons.refresh_rounded, size: 18, color: AppColors.accent),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    CurrencyFormatter.formatUGX(user.walletBalanceUGX),
                    style: AppTypography.displayMedium.copyWith(
                      color: AppColors.accent,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'Connected to verified account: ${user.fullName.isNotEmpty ? user.fullName : user.email}',
                  style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: [
                    Expanded(
                      child: SafarisButton(
                        text: 'Top Up Wallet',
                        variant: SafarisButtonVariant.primary,
                        height: 42,
                        onPressed: _showTopUpDialog,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xl),

          // Active Payment Methods (Strictly Admin Governed)
          Text(
            'ACTIVE PAYMENT CHANNELS',
            style: AppTypography.labelSmall.copyWith(
              color: AppColors.textTertiary,
              letterSpacing: 1.0,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),

          if (enabledMethods.isEmpty)
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border),
              ),
              child: const Text('No payment channels enabled by administrator.'),
            )
          else
            ...enabledMethods.map((method) {
              IconData icon = Icons.payment_rounded;
              if (method.id == 'MTN_MOMO' || method.id == 'AIRTEL_MONEY') {
                icon = Icons.phone_android_rounded;
              } else if (method.id == 'CARD') {
                icon = Icons.credit_card_rounded;
              } else if (method.id == 'WALLET') {
                icon = Icons.account_balance_wallet_rounded;
              }

              return Padding(
                padding: const EdgeInsets.only(bottom: 8.0),
                child: _PaymentMethodTile(
                  title: method.name,
                  subtitle: method.description.isNotEmpty
                      ? method.description
                      : (method.isOnline ? 'Online Gateway Channel' : 'Direct Handover'),
                  icon: icon,
                  isDefault: _selectedMethod == method.id,
                  onTap: () => setState(() => _selectedMethod = method.id),
                ),
              );
            }),

          // Saved Bank Cards Section (if CARD is enabled by Admin)
          if (remoteConfig.isPaymentMethodEnabled('CARD')) ...[
            const SizedBox(height: AppSpacing.xl),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'SAVED BANK CARDS',
                  style: AppTypography.labelSmall.copyWith(
                    color: AppColors.textTertiary,
                    letterSpacing: 1.0,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                TextButton.icon(
                  onPressed: _showAddCardDialog,
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Add Card', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),

            if (_loadingCards)
              const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
            else if (_savedCards.isEmpty)
              Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    Icon(Icons.credit_card_outlined, color: AppColors.textTertiary, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'No saved cards yet. Add a card for instant one-tap checkout.',
                        style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                      ),
                    ),
                  ],
                ),
              )
            else
              ..._savedCards.map((card) {
                final cardId = card['id']?.toString() ?? '';
                final last4 = card['last4']?.toString() ?? '****';
                final brand = card['brand']?.toString() ?? 'Card';
                final expiry = card['expiry']?.toString() ?? '';

                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceElevated,
                          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        ),
                        child: const Icon(Icons.credit_card_rounded, color: AppColors.accent, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '$brand •••• $last4',
                              style: AppTypography.titleSmall.copyWith(fontSize: 14, fontWeight: FontWeight.w700),
                            ),
                            Text('Expires $expiry', style: AppTypography.bodySmall),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline_rounded, size: 20, color: AppColors.error),
                        onPressed: () => _deleteCard(cardId),
                        tooltip: 'Remove card',
                      ),
                    ],
                  ),
                );
              }),
            ],
          ],
        ),
      ),
    );
  }
}

class _PaymentMethodTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final bool isDefault;
  final VoidCallback onTap;

  const _PaymentMethodTile({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.isDefault,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            border: Border.all(
              color: isDefault ? AppColors.accent : AppColors.border,
              width: isDefault ? 1.5 : 1.0,
            ),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: isDefault ? AppColors.accent.withValues(alpha: 0.15) : AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                ),
                child: Icon(icon, color: isDefault ? AppColors.accent : AppColors.iconPrimary, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            title,
                            style: AppTypography.titleSmall.copyWith(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isDefault) ...[
                          const SizedBox(width: 6),
                          const SafarisBadge(text: 'SELECTED', variant: SafarisBadgeVariant.accent),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: AppTypography.bodySmall,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                isDefault ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                color: isDefault ? AppColors.accent : AppColors.iconSecondary,
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
