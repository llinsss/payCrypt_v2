import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/ui/views/balance/balance_view.dart';
import 'package:Tagg/ui/views/dashboard/dashboard_view.dart';
import 'package:Tagg/ui/views/transaction_detail/transaction_detail_view.dart';
import 'package:Tagg/ui/views/withdrawal/withdrawal_view.dart';

import 'helpers/test_helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    registerServices();
  });

  tearDown(() {
    locator.reset();
  });

  group('Flutter widget coverage', () {
    testWidgets('BalanceView renders the main balance sections', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: BalanceView(),
          debugShowCheckedModeBanner: false,
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Balance'), findsOneWidget);
      expect(find.text('Portfolio Overview'), findsOneWidget);
      expect(find.text('Total Deposits'), findsOneWidget);
      expect(find.text('Total Withdrawals'), findsOneWidget);
      expect(find.text('Tagged'), findsOneWidget);
    });

    testWidgets('WithdrawalView renders withdrawal methods and form fields', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: WithdrawalView(),
          debugShowCheckedModeBanner: false,
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Withdrawal'), findsOneWidget);
      expect(find.text('Withdraw to Tag'), findsOneWidget);
      expect(find.text('Crypto Wallet'), findsOneWidget);
      expect(find.text('Bank Account (NGN)'), findsOneWidget);
      expect(find.text('Transaction Notes (Optional)'), findsOneWidget);
      expect(find.text('Send'), findsOneWidget);
    });

    testWidgets('DashboardView renders the transaction list header and filters', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: DashboardView(),
          debugShowCheckedModeBanner: false,
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Dashboard'), findsOneWidget);
      expect(find.text('Recent Transactions'), findsOneWidget);
      expect(find.text('All'), findsOneWidget);
      expect(find.text('Credit'), findsOneWidget);
      expect(find.text('Debit'), findsOneWidget);
    });

    testWidgets('TransactionDetailView renders transaction details', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: TransactionDetailView(transactionId: '42'),
          debugShowCheckedModeBanner: false,
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Transaction Details'), findsOneWidget);
      expect(find.text('Transaction not found'), findsOneWidget);
    });
  });
}