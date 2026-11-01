import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/config/remote_config_service.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../shared/widgets/safaris_button.dart';
import '../../../shared/widgets/safaris_text_field.dart';
import '../../authentication/session_provider.dart';

class DpoCheckoutSheet extends ConsumerStatefulWidget {
  final double amountUGX;
  final String referenceType; // 'TOUR' | 'TRIP' | 'DELIVERY' | 'WALLET'
  final String referenceId;
  final String description;
  final VoidCallback onPaymentSuccess;

  const DpoCheckoutSheet({
    super.key,
    required this.amountUGX,
    required this.referenceType,
    required this.referenceId,
    required this.description,
    required this.onPaymentSuccess,
  });

  static Future<bool?> show(
    BuildContext context, {
    required double amountUGX,
    required String referenceType,
    required String referenceId,
    required String description,
    required VoidCallback onPaymentSuccess,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DpoCheckoutSheet(
        amountUGX: amountUGX,
        referenceType: referenceType,
        referenceId: referenceId,
        description: description,
        onPaymentSuccess: onPaymentSuccess,
      ),
    );
  }

  @override
  ConsumerState<DpoCheckoutSheet> createState() => _DpoCheckoutSheetState();
}

class _DpoCheckoutSheetState extends ConsumerState<DpoCheckoutSheet> {
  String _selectedMethodId = 'MTN_MOMO';

  // Contact controllers
  late final TextEditingController _phoneController;
  late final TextEditingController _nameController;
  late final TextEditingController _emailController;

  // Embedded Card controllers
  final TextEditingController _cardNumberController = TextEditingController();
  final TextEditingController _cardExpiryController = TextEditingController();
  final TextEditingController _cardCvvController = TextEditingController();
  final TextEditingController _cardHolderController = TextEditingController();
  bool _saveCard = false;

  bool _isLoading = false;
  String? _errorMessage;
  String? _pendingPaymentId;
  String? _mobileInstructions;
  bool _isAwaitingVerification = false;
  Timer? _autoVerifyTimer;
  bool _isCheckingStatus = false;
  int _pollCount = 0;
  bool _isSuccess = false;

  String get _verificationStatusMessage {
    if (_pollCount < 3) {
      return 'Waiting for Mobile Money PIN entry...';
    } else if (_pollCount < 8) {
      return 'PIN received! Verifying with network...';
    } else {
      return 'Finalizing deposit with payment gateway...';
    }
  }

  @override
  void initState() {
    super.initState();
    final user = ref.read(currentUserProvider);
    _phoneController = TextEditingController(text: user.phone);
    _nameController = TextEditingController(text: user.fullName);
    _emailController = TextEditingController(text: user.email);
    _cardHolderController.text = user.fullName;

    // Refresh user's authoritative profile on open
    Future.microtask(() {
      ref.read(currentUserProvider.notifier).refreshProfile();
      _ensureValidMethodSelected();
    });
  }

  void _ensureValidMethodSelected() {
    final remoteConfig = ref.read(remoteConfigProvider);
    final isWalletTopUp = widget.referenceType == 'WALLET';
    final enabled = isWalletTopUp
        ? remoteConfig.enabledPaymentMethods.where((m) => m.id != 'WALLET' && m.id != 'CASH').toList()
        : remoteConfig.enabledPaymentMethods;
    if (enabled.isNotEmpty && !enabled.any((m) => m.id == _selectedMethodId)) {
      setState(() {
        _selectedMethodId = enabled.first.id;
      });
    }
  }

  @override
  void dispose() {
    _autoVerifyTimer?.cancel();
    _phoneController.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _cardNumberController.dispose();
    _cardExpiryController.dispose();
    _cardCvvController.dispose();
    _cardHolderController.dispose();
    super.dispose();
  }

  // Quick fill test card details for sandbox testing
  void _fillSandboxCard(String brand) {
    if (brand == 'Mastercard') {
      _cardNumberController.text = '5436 8862 6984 8367';
      _cardExpiryController.text = '12/28';
      _cardCvvController.text = '123';
      _cardHolderController.text = 'TEST MASTERCARD';
    } else if (brand == 'Visa') {
      _cardNumberController.text = '4012 8888 8888 1881';
      _cardExpiryController.text = '12/28';
      _cardCvvController.text = '123';
      _cardHolderController.text = 'TEST VISA';
    } else if (brand == 'Amex') {
      _cardNumberController.text = '3456 7890 1234 564';
      _cardExpiryController.text = '12/28';
      _cardCvvController.text = '1234';
      _cardHolderController.text = 'TEST AMEX';
    }
    setState(() {});
  }

  String _detectCardBrand(String number) {
    final clean = number.replaceAll(RegExp(r'\s+'), '');
    if (clean.startsWith('4')) return 'Visa';
    if (clean.startsWith('5')) return 'Mastercard';
    if (clean.startsWith('34') || clean.startsWith('37')) return 'Amex';
    return 'Card';
  }

  Future<void> _initiatePayment() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final user = ref.read(currentUserProvider);

    // 1. Validation
    if (_selectedMethodId == 'CARD') {
      final num = _cardNumberController.text.replaceAll(RegExp(r'\s+'), '');
      if (num.length < 13) {
        setState(() {
          _errorMessage = 'Please enter a valid 16-digit card number.';
          _isLoading = false;
        });
        return;
      }
      if (_cardExpiryController.text.trim().length < 4) {
        setState(() {
          _errorMessage = 'Please enter a valid expiry date (MM/YY).';
          _isLoading = false;
        });
        return;
      }
      if (_cardCvvController.text.trim().length < 3) {
        setState(() {
          _errorMessage = 'Please enter a valid 3 or 4-digit CVV security code.';
          _isLoading = false;
        });
        return;
      }
    } else if (_selectedMethodId == 'WALLET') {
      if (user.walletBalanceUGX < widget.amountUGX) {
        setState(() {
          _errorMessage =
              'Insufficient DRIVER Wallet balance. Please top up or choose Mobile Money / Card.';
          _isLoading = false;
        });
        return;
      }
    } else if (_selectedMethodId == 'MTN_MOMO' || _selectedMethodId == 'AIRTEL_MONEY') {
      final phone = _phoneController.text.trim();
      if (phone.length < 9) {
        setState(() {
          _errorMessage = 'Please enter a valid Uganda phone number.';
          _isLoading = false;
        });
        return;
      }
    }

    try {
      final api = ApiClient();
      final effectiveReferenceId = (widget.referenceType == 'WALLET' && user.id.isNotEmpty)
          ? user.id
          : widget.referenceId;

      final body = <String, dynamic>{
        'referenceType': widget.referenceType,
        'referenceId': effectiveReferenceId,
        'amountUgx': widget.amountUGX,
        'paymentMethod': _selectedMethodId,
        'phone': _phoneController.text.trim(),
        'customerName': _nameController.text.trim(),
        'customerEmail': _emailController.text.trim(),
        'description': widget.description,
      };

      if (_selectedMethodId == 'CARD') {
        body['cardDetails'] = {
          'cardNumber': _cardNumberController.text.trim(),
          'cardExpiry': _cardExpiryController.text.trim(),
          'cardCvv': _cardCvvController.text.trim(),
          'cardHolderName': _cardHolderController.text.trim(),
          'saveCard': _saveCard,
        };
      }

      final res = await api.post('/payments/process', body: body);

      if (res.success && res.data != null) {
        final payment = res.data;
        final status = payment['status']?.toString();

        // If card was directly charged and approved, or WALLET instantly debited
        if (status == 'SUCCESSFUL') {
          await ref.read(currentUserProvider.notifier).refreshProfile();
          if (mounted) {
            setState(() {
              _isLoading = false;
              _isAwaitingVerification = false;
            });
            widget.onPaymentSuccess();
            Navigator.of(context).pop(true);
          }
          return;
        }

        _pendingPaymentId = payment['id'];
        _mobileInstructions = payment['mobile_instructions'] ??
            'An STK push prompt has been sent to your phone. Please enter your Mobile Money PIN to authorize the payment, then tap "Verify Payment Status" below.';

        setState(() {
          _isAwaitingVerification = true;
          _isLoading = false;
        });
        _startAutoVerificationPolling();
      } else {
        setState(() {
          _errorMessage = res.errorMessage ?? 'Payment initiation failed. Please check details.';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Network connection issue. Please retry.';
        _isLoading = false;
      });
    }
  }

  void _startAutoVerificationPolling() {
    _autoVerifyTimer?.cancel();
    _pollCount = 0;
    _isCheckingStatus = false;
    _autoVerifyTimer = Timer.periodic(const Duration(milliseconds: 2500), (timer) {
      if (!mounted || !_isAwaitingVerification || _pendingPaymentId == null || _isSuccess) {
        timer.cancel();
        return;
      }
      _verifyPaymentStatus(silent: true);
    });
  }

  Future<void> _verifyPaymentStatus({bool silent = false}) async {
    if (_pendingPaymentId == null || _isCheckingStatus || _isSuccess) return;
    _isCheckingStatus = true;
    if (mounted) {
      setState(() {
        _pollCount++;
        if (!silent) {
          _isLoading = true;
          _errorMessage = null;
        }
      });
    }

    try {
      final api = ApiClient();
      final res = await api.post('/payments/$_pendingPaymentId/verify', body: {});

      if (res.success && res.data != null) {
        final status = res.data['status'];
        if (status == 'SUCCESSFUL') {
          _autoVerifyTimer?.cancel();
          if (mounted) {
            setState(() {
              _isSuccess = true;
              _isLoading = false;
              _isAwaitingVerification = false;
            });
          }
          await ref.read(currentUserProvider.notifier).refreshProfile();
          await Future.delayed(const Duration(milliseconds: 1400));
          if (mounted) {
            widget.onPaymentSuccess();
            Navigator.of(context).pop(true);
          }
          return;
        } else if (status == 'FAILED' || status == 'CANCELLED') {
          _autoVerifyTimer?.cancel();
          if (mounted) {
            setState(() {
              _errorMessage = res.data['failure_reason'] ?? 'Payment was not approved.';
              _isLoading = false;
              _isAwaitingVerification = false;
            });
          }
          return;
        } else if (!silent && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Payment not yet confirmed by DPO. Please enter your Mobile Money PIN on your phone first, then tap Verify again.',
              ),
              duration: Duration(seconds: 4),
            ),
          );
        }
      }
    } catch (_) {
      // Auto-retry silently in background
    } finally {
      _isCheckingStatus = false;
      if (mounted && !silent) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _cancelPaymentAttempt() async {
    _autoVerifyTimer?.cancel();
    if (_pendingPaymentId == null) {
      Navigator.of(context).pop(false);
      return;
    }

    setState(() => _isLoading = true);
    try {
      final api = ApiClient();
      await api.post('/payments/$_pendingPaymentId/cancel', body: {});
    } catch (_) {
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isAwaitingVerification = false;
          _pendingPaymentId = null;
        });
        Navigator.of(context).pop(false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final remoteConfig = ref.watch(remoteConfigProvider);
    final isWalletTopUp = widget.referenceType == 'WALLET';
    final enabledMethods = isWalletTopUp
        ? remoteConfig.enabledPaymentMethods.where((m) => m.id != 'WALLET' && m.id != 'CASH').toList()
        : remoteConfig.enabledPaymentMethods;
    final user = ref.watch(currentUserProvider);

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusXl)),
      ),
      padding: EdgeInsets.only(
        left: AppSpacing.lg,
        right: AppSpacing.lg,
        top: AppSpacing.lg,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.xl,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Header with Security & Admin Source-of-Truth Badges
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    isWalletTopUp ? Icons.account_balance_wallet_rounded : Icons.shield_rounded,
                    color: AppColors.accent,
                    size: 24,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              isWalletTopUp ? 'Top Up DRIVER Wallet' : 'Secure Checkout',
                              style: AppTypography.titleMedium,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF10B981).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.4)),
                            ),
                            child: const Text(
                              'VERIFIED',
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF10B981),
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                      Text(
                        isWalletTopUp ? 'Deposit funds securely via Mobile Money or Card' : 'Admin Governed Payment Channels',
                        style: AppTypography.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Divider(color: AppColors.border, height: 28),

            // Amount Display
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(isWalletTopUp ? 'Top-Up Amount' : 'Amount Payable', style: AppTypography.bodyMedium),
                  Text(
                    CurrencyFormatter.formatUGX(widget.amountUGX),
                    style: AppTypography.titleLarge.copyWith(
                      color: AppColors.accent,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),

            if (_isSuccess) ...[
              // Successful Payment Confirmation State
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl, horizontal: AppSpacing.lg),
                decoration: BoxDecoration(
                  color: const Color(0x1A10B981),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: const Color(0x4D10B981)),
                ),
                child: Column(
                  children: [
                    Container(
                      width: 68,
                      height: 68,
                      decoration: const BoxDecoration(
                        color: Color(0xFF10B981),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.check_rounded, color: Colors.white, size: 42),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      isWalletTopUp ? 'Deposit Successful!' : 'Payment Confirmed!',
                      style: AppTypography.titleMedium.copyWith(
                        color: const Color(0xFF10B981),
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      isWalletTopUp
                          ? '${CurrencyFormatter.formatUGX(widget.amountUGX)} added to your DRIVER Wallet.'
                          : 'Your payment was successfully verified by DPO.',
                      style: AppTypography.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ] else if (_isAwaitingVerification) ...[
              // Seamless Auto-Verifying Loading State (No manual click required)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.lg),
                decoration: BoxDecoration(
                  color: AppColors.accent.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.accent.withOpacity(0.3)),
                ),
                child: Column(
                  children: [
                    // Prominent Circular Pulse & Device Icon
                    SizedBox(
                      width: 60,
                      height: 60,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          const SizedBox(
                            width: 60,
                            height: 60,
                            child: CircularProgressIndicator(
                              strokeWidth: 3.5,
                              valueColor: AlwaysStoppedAnimation<Color>(AppColors.accent),
                            ),
                          ),
                          Icon(
                            _selectedMethodId == 'CARD'
                                ? Icons.credit_card_rounded
                                : Icons.phone_android_rounded,
                            size: 26,
                            color: AppColors.accent,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      'Payment Initiated via Gateway',
                      style: AppTypography.titleSmall.copyWith(fontWeight: FontWeight.w800),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      _mobileInstructions ??
                          'Please approve the PIN prompt on your phone. DRIVER will automatically detect the confirmation.',
                      style: AppTypography.bodySmall,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.md),

                    // Dynamic Live Progress Pill
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.0,
                              valueColor: AlwaysStoppedAnimation<Color>(AppColors.accent),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Flexible(
                            child: Text(
                              _verificationStatusMessage,
                              style: AppTypography.labelSmall.copyWith(
                                fontWeight: FontWeight.w600,
                                color: AppColors.textPrimary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: AppSpacing.lg),

                    // Cancel Payment Option
                    TextButton.icon(
                      onPressed: _cancelPaymentAttempt,
                      icon: const Icon(Icons.close_rounded, size: 16, color: AppColors.error),
                      label: Text(
                        'Cancel Payment Attempt',
                        style: AppTypography.bodySmall.copyWith(
                          color: AppColors.error,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ] else ...[
              // Payment Method Selector (Filtered Strictly to Admin-Enabled Methods)
              Text('Select Payment Channel', style: AppTypography.labelLarge),
              const SizedBox(height: AppSpacing.xs),

              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: enabledMethods.map((method) {
                    final isSelected = _selectedMethodId == method.id;
                    IconData icon = Icons.payment_rounded;
                    if (method.id == 'MTN_MOMO' || method.id == 'AIRTEL_MONEY') {
                      icon = Icons.phone_android_rounded;
                    } else if (method.id == 'CARD') {
                      icon = Icons.credit_card_rounded;
                    } else if (method.id == 'WALLET') {
                      icon = Icons.account_balance_wallet_rounded;
                    }

                    return Padding(
                      padding: const EdgeInsets.only(right: 8.0),
                      child: ChoiceChip(
                        avatar: Icon(icon, size: 16, color: isSelected ? AppColors.accent : AppColors.iconSecondary),
                        label: Text(method.name),
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
                            setState(() => _selectedMethodId = method.id);
                          }
                        },
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: AppSpacing.md),

              // Method-specific input fields
              if (_selectedMethodId == 'CARD') ...[
                // Card details form
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.credit_card_rounded, color: AppColors.accent, size: 20),
                              const SizedBox(width: 8),
                              Text('Card Details', style: AppTypography.titleSmall),
                            ],
                          ),
                          Text(
                            _detectCardBrand(_cardNumberController.text),
                            style: AppTypography.labelSmall.copyWith(
                              color: AppColors.accent,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),

                      // Card Number
                      SafarisTextField(
                        labelText: 'Card Number',
                        controller: _cardNumberController,
                        hintText: '4012 8888 8888 1881',
                        keyboardType: TextInputType.number,
                        prefixIcon: const Icon(Icons.payment_rounded, size: 20, color: AppColors.accent),
                        onChanged: (_) => setState(() {}),
                      ),
                      const SizedBox(height: AppSpacing.sm),

                      Row(
                        children: [
                          Expanded(
                            child: SafarisTextField(
                              labelText: 'Expiry (MM/YY)',
                              controller: _cardExpiryController,
                              hintText: '12/28',
                              keyboardType: TextInputType.datetime,
                              prefixIcon: const Icon(Icons.calendar_today_rounded, size: 18, color: AppColors.accent),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: SafarisTextField(
                              labelText: 'CVV / CVC',
                              controller: _cardCvvController,
                              hintText: '123',
                              obscureText: true,
                              keyboardType: TextInputType.number,
                              prefixIcon: const Icon(Icons.lock_rounded, size: 18, color: AppColors.accent),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),

                      SafarisTextField(
                        labelText: 'Cardholder Name',
                        controller: _cardHolderController,
                        hintText: 'e.g. Kato Suraiman',
                        prefixIcon: const Icon(Icons.person_rounded, size: 18, color: AppColors.accent),
                      ),
                      const SizedBox(height: AppSpacing.xs),

                      // Quick sandbox fill chips
                      Row(
                        children: [
                          Text('Test Cards:', style: AppTypography.labelSmall.copyWith(color: AppColors.textTertiary)),
                          const SizedBox(width: 6),
                          GestureDetector(
                            onTap: () => _fillSandboxCard('Mastercard'),
                            child: Chip(
                              label: const Text('Mastercard', style: TextStyle(fontSize: 10)),
                              padding: EdgeInsets.zero,
                              visualDensity: VisualDensity.compact,
                            ),
                          ),
                          const SizedBox(width: 4),
                          GestureDetector(
                            onTap: () => _fillSandboxCard('Visa'),
                            child: Chip(
                              label: const Text('Visa', style: TextStyle(fontSize: 10)),
                              padding: EdgeInsets.zero,
                              visualDensity: VisualDensity.compact,
                            ),
                          ),
                        ],
                      ),

                      // Save card option
                      CheckboxListTile(
                        value: _saveCard,
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text(
                          'Save card reference for faster checkout (Tokenized)',
                          style: AppTypography.bodySmall,
                        ),
                        onChanged: (val) => setState(() => _saveCard = val ?? false),
                        controlAffinity: ListTileControlAffinity.leading,
                      ),
                    ],
                  ),
                ),
              ] else if (_selectedMethodId == 'WALLET') ...[
                // Wallet Balance Info
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    border: Border.all(
                      color: user.walletBalanceUGX >= widget.amountUGX ? const Color(0xFF10B981) : Colors.amber,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.account_balance_wallet_rounded, color: AppColors.accent, size: 20),
                              const SizedBox(width: 8),
                              Text('DRIVER Wallet', style: AppTypography.titleSmall),
                            ],
                          ),
                          Text(
                            user.walletBalanceUGX >= widget.amountUGX ? 'SUFFICIENT' : 'INSUFFICIENT',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: user.walletBalanceUGX >= widget.amountUGX ? const Color(0xFF10B981) : Colors.amber,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Verified Ledger Balance: ${CurrencyFormatter.formatUGX(user.walletBalanceUGX)}',
                        style: AppTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700),
                      ),
                      if (user.walletBalanceUGX < widget.amountUGX) ...[
                        const SizedBox(height: 4),
                        Text(
                          'You need ${CurrencyFormatter.formatUGX(widget.amountUGX - user.walletBalanceUGX)} more in your wallet. Please select Mobile Money or Card instead.',
                          style: AppTypography.bodySmall.copyWith(color: AppColors.error),
                        ),
                      ],
                    ],
                  ),
                ),
              ] else ...[
                // Mobile Money Phone field
                SafarisTextField(
                  labelText: 'Mobile Money Phone Number',
                  controller: _phoneController,
                  prefixIcon: const Icon(Icons.phone_rounded, size: 20, color: AppColors.accent),
                  hintText: 'e.g. 0772123456 or 0701123456',
                ),
              ],
              const SizedBox(height: AppSpacing.sm),

              SafarisTextField(
                labelText: 'Payer Full Name',
                controller: _nameController,
                prefixIcon: const Icon(Icons.person_rounded, size: 20, color: AppColors.accent),
              ),
              const SizedBox(height: AppSpacing.sm),

              SafarisTextField(
                labelText: 'Billing Email Address',
                controller: _emailController,
                prefixIcon: const Icon(Icons.email_rounded, size: 20, color: AppColors.accent),
              ),

              if (_errorMessage != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(_errorMessage!, style: AppTypography.bodySmall.copyWith(color: AppColors.error)),
              ],
              const SizedBox(height: AppSpacing.lg),

              SafarisButton(
                text: isWalletTopUp
                    ? 'Deposit ${CurrencyFormatter.formatUGX(widget.amountUGX)}'
                    : 'Pay ${CurrencyFormatter.formatUGX(widget.amountUGX)}',
                isLoading: _isLoading,
                onPressed: _initiatePayment,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
