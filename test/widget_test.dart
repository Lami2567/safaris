import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:safaris/main.dart';

void main() {
  testWidgets('App initializes and renders splash screen', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: SafarisApp(),
      ),
    );

    expect(find.text('DRIVER'), findsOneWidget);
  });
}
