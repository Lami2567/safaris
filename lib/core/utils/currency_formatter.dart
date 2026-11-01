import 'package:intl/intl.dart';

class CurrencyFormatter {
  CurrencyFormatter._();

  static final NumberFormat _ugxFormat = NumberFormat('#,##0', 'en_US');

  static String formatUGX(num amount) {
    return 'UGX ${_ugxFormat.format(amount)}';
  }

  static String formatShort(num amount) {
    if (amount >= 1000000) {
      return '${(amount / 1000000).toStringAsFixed(1)}M UGX';
    } else if (amount >= 1000) {
      return '${(amount / 1000).toStringAsFixed(0)}K UGX';
    }
    return '${_ugxFormat.format(amount)} UGX';
  }
}
