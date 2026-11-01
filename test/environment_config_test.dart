import 'package:flutter_test/flutter_test.dart';
import 'package:safaris/core/config/environment_config.dart';

void main() {
  group('EnvironmentConfig Tests', () {
    test('Defaults to production environment with secure domain and VPS IP fallback', () {
      expect(EnvironmentConfig.vpsIp, equals('18.222.41.199'));
      expect(EnvironmentConfig.isProduction, isTrue);
      expect(EnvironmentConfig.apiBaseUrl, equals('https://admin.mumwesafarisuganda.com/api/v1'));
      expect(EnvironmentConfig.socketBaseUrl, equals('https://admin.mumwesafarisuganda.com'));
      expect(EnvironmentConfig.activeApiUrl, equals('https://admin.mumwesafarisuganda.com/api/v1'));
      expect(EnvironmentConfig.activeSocketUrl, equals('https://admin.mumwesafarisuganda.com'));
    });
  });
}
