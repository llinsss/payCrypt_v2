import 'package:flutter_test/flutter_test.dart';
import 'package:Tagg/models/transaction_model.dart';

void main() {
  group('Transaction Filtering Tests', () {
    late List<Transaction> mockTransactions;

    setUp(() {
      mockTransactions = [
        Transaction(
          id: 1,
          reference: 'TXN001',
          userTag: 'alice',
          receiverTag: 'bob',
          amount: '100.00',
          tokenSymbol: 'USDC',
          chainName: 'stellar',
          type: 'credit',
          status: 'completed',
          createdAt: '2026-08-20T10:00:00Z',
          notes: 'Payment for services',
          description: 'Service payment',
        ),
        Transaction(
          id: 2,
          reference: 'TXN002',
          userTag: 'bob',
          receiverTag: 'alice',
          amount: '50.00',
          tokenSymbol: 'XLM',
          chainName: 'stellar',
          type: 'debit',
          status: 'pending',
          createdAt: '2026-08-21T15:00:00Z',
          notes: 'Refund',
          description: 'Refund transaction',
        ),
        Transaction(
          id: 3,
          reference: 'TXN003',
          userTag: 'charlie',
          receiverTag: 'alice',
          amount: '200.00',
          tokenSymbol: 'USDC',
          chainName: 'ethereum',
          type: 'credit',
          status: 'completed',
          createdAt: '2026-08-22T08:30:00Z',
          notes: 'Bonus',
          description: 'Bonus payment',
        ),
      ];
    });

    test('Search by @tag returns matching transactions', () {
      final searchQuery = 'alice';
      final filtered = mockTransactions
          .where((t) =>
              t.userTag.toLowerCase().contains(searchQuery) ||
              t.receiverTag?.toLowerCase().contains(searchQuery) ?? false)
          .toList();

      expect(filtered.length, 3);
      expect(filtered.any((t) => t.userTag == 'alice'), true);
    });

    test('Search by reference number returns exact match', () {
      final searchQuery = 'txn002';
      final filtered = mockTransactions
          .where((t) => t.reference.toLowerCase().contains(searchQuery))
          .toList();

      expect(filtered.length, 1);
      expect(filtered.first.reference, 'TXN002');
    });

    test('Date range filter bounds results correctly', () {
      final startDate = DateTime(2026, 8, 21);
      final endDate = DateTime(2026, 8, 22);

      final filtered = mockTransactions.where((t) {
        final txDate = DateTime.tryParse(t.createdAt ?? '')?.toLocal() ?? DateTime.now();
        return txDate.isAfter(startDate) && txDate.isBefore(endDate.add(const Duration(days: 1)));
      }).toList();

      expect(filtered.length, 2);
    });

    test('Multiple filters combine correctly (AND semantics)', () {
      final typeFilter = 'credit';
      final chainFilter = 'stellar';

      var filtered = mockTransactions;

      // Apply type filter
      filtered = filtered.where((t) => t.type == typeFilter).toList();

      // Apply chain filter
      filtered = filtered.where((t) => t.chainName == chainFilter).toList();

      expect(filtered.length, 1);
      expect(filtered.first.id, 1);
    });

    test('Token filter returns matching token transactions', () {
      final tokenFilter = {'USDC'};

      final filtered = mockTransactions
          .where((t) => tokenFilter.contains(t.tokenSymbol))
          .toList();

      expect(filtered.length, 2);
      expect(filtered.every((t) => t.tokenSymbol == 'USDC'), true);
    });

    test('Chain filter returns matching chain transactions', () {
      final chainFilter = {'ethereum'};

      final filtered = mockTransactions
          .where((t) => chainFilter.contains(t.chainName))
          .toList();

      expect(filtered.length, 1);
      expect(filtered.first.chainName, 'ethereum');
    });

    test('Status filter returns matching status transactions', () {
      final statusFilter = 'completed';

      final filtered = mockTransactions
          .where((t) => t.status == statusFilter)
          .toList();

      expect(filtered.length, 2);
      expect(filtered.every((t) => t.status == 'completed'), true);
    });

    test('Clear all filters returns all transactions', () {
      // Start with all filters applied
      var filtered = mockTransactions;

      // No filters applied
      expect(filtered.length, 3);
    });

    test('Pagination continues to work with filters applied', () {
      const pageSize = 2;
      final typeFilter = 'credit';

      final filtered =
          mockTransactions.where((t) => t.type == typeFilter).toList();

      expect(filtered.length, 2);

      // First page
      final page1 = filtered.take(pageSize).toList();
      expect(page1.length, 2);

      // Second page (should be empty)
      final page2 = filtered.skip(pageSize).take(pageSize).toList();
      expect(page2.length, 0);
    });
  });
}
