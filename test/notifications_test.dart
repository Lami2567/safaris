import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:safaris/features/notifications/models/notification_model.dart';
import 'package:safaris/features/notifications/notification_provider.dart';
import 'package:safaris/features/notifications/screens/notifications_screen.dart';

void main() {
  group('SAFARIS Notifications Feature & Domain Tests', () {
    test('NotificationCategory correctly maps string categories and DB representations', () {
      expect(NotificationCategory.fromString('driver'), NotificationCategory.driver);
      expect(NotificationCategory.fromString('ride'), NotificationCategory.driver);
      expect(NotificationCategory.fromString('payment'), NotificationCategory.payment);
      expect(NotificationCategory.fromString('momo'), NotificationCategory.payment);
      expect(NotificationCategory.fromString('admin'), NotificationCategory.admin);
      expect(NotificationCategory.fromString('advisory'), NotificationCategory.admin);
      expect(NotificationCategory.fromString('promo'), NotificationCategory.admin);
      expect(NotificationCategory.fromString('unknown'), NotificationCategory.system);

      expect(NotificationCategory.driver.toDbString(), 'DRIVER');
      expect(NotificationCategory.payment.toDbString(), 'PAYMENT');
      expect(NotificationCategory.admin.toDbString(), 'ADMIN');
    });

    test('SafarisNotification serializes and deserializes correctly', () {
      final json = {
        'id': 'notif_tst_01',
        'user_id': 'usr_ug_001',
        'title': 'Driver Assigned: Moses Okello',
        'message': 'Moses Okello in Toyota Premio (UBM 714K) accepted your trip.',
        'type': 'DRIVER',
        'is_read': false,
        'created_at': DateTime.now().toIso8601String(),
        'metadata': {
          'tripId': 'trp_9912',
          'vehicle': 'Toyota Premio (UBM 714K)',
          'status': 'DRIVER_ASSIGNED',
        },
      };

      final notif = SafarisNotification.fromJson(json);
      expect(notif.id, 'notif_tst_01');
      expect(notif.type, NotificationCategory.driver);
      expect(notif.isRead, isFalse);
      expect(notif.metadata['tripId'], 'trp_9912');
      expect(notif.timeAgo, 'Just now');

      final serialized = notif.toJson();
      expect(serialized['type'], 'DRIVER');
      expect(serialized['id'], 'notif_tst_01');
    });

    test('NotificationsState filters items and calculates unread count accurately', () {
      final now = DateTime.now();
      final items = [
        SafarisNotification(
          id: '1',
          userId: 'u1',
          title: 'Driver arriving',
          message: 'Moses is arriving',
          type: NotificationCategory.driver,
          isRead: false,
          createdAt: now,
        ),
        SafarisNotification(
          id: '2',
          userId: 'u1',
          title: 'Payment success',
          message: 'UGX 50,000 paid',
          type: NotificationCategory.payment,
          isRead: true,
          createdAt: now,
        ),
        SafarisNotification(
          id: '3',
          userId: 'u1',
          title: 'Admin notice',
          message: 'Safari permits available',
          type: NotificationCategory.admin,
          isRead: false,
          createdAt: now,
        ),
      ];

      final stateAll = NotificationsState(items: items, activeFilter: NotificationCategory.all);
      expect(stateAll.filteredItems.length, 3);
      expect(stateAll.unreadCount, 2);
      expect(stateAll.countFor(NotificationCategory.driver), 1);
      expect(stateAll.countFor(NotificationCategory.payment), 1);
      expect(stateAll.countFor(NotificationCategory.admin), 1);

      final stateDriver = stateAll.copyWith(activeFilter: NotificationCategory.driver);
      expect(stateDriver.filteredItems.length, 1);
      expect(stateDriver.filteredItems.first.type, NotificationCategory.driver);

      final statePayment = stateAll.copyWith(activeFilter: NotificationCategory.payment);
      expect(statePayment.filteredItems.length, 1);
      expect(statePayment.filteredItems.first.type, NotificationCategory.payment);

      final stateAdmin = stateAll.copyWith(activeFilter: NotificationCategory.admin);
      expect(stateAdmin.filteredItems.length, 1);
      expect(stateAdmin.filteredItems.first.type, NotificationCategory.admin);
    });

    testWidgets('NotificationsScreen renders filter chips and category notifications', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: NotificationsScreen(),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Check header and category chips
      expect(find.text('Notifications'), findsOneWidget);
      expect(find.text('All'), findsOneWidget);
      expect(find.text('Driver Updates'), findsOneWidget);
      expect(find.text('Payment Alerts'), findsOneWidget);
      expect(find.text('Admin Advisories'), findsOneWidget);

      // Tap on 'Payment Alerts' filter chip
      await tester.tap(find.text('Payment Alerts'));
      await tester.pumpAndSettle();

      // Tap on 'Admin Advisories' filter chip
      await tester.tap(find.text('Admin Advisories'));
      await tester.pumpAndSettle();

      // Tap on 'Driver Updates' filter chip
      await tester.tap(find.text('Driver Updates'));
      await tester.pumpAndSettle();

      // Return to 'All'
      await tester.tap(find.text('All'));
      await tester.pumpAndSettle();
    });
  });
}
