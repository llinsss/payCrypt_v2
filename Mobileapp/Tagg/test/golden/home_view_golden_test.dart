import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:Tagg/ui/views/home/home_view.dart';

void main() {
  testWidgets('HomeView - default state', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        debugShowCheckedModeBanner: false,
        home: HomeView(),
      ),
    );

    expect(find.text('HomeView'), findsOneWidget);
  });
}
