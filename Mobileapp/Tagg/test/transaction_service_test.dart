import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/services/transaction_service.dart';

class MockApiService extends ApiService {
  Uint8List? bytes;
  String? lastEndpoint;

  @override
  Future<Uint8List> getBytes(String endpoint) async {
    lastEndpoint = endpoint;
    return bytes ?? Uint8List.fromList([1, 2, 3]);
  }
}

void main() {
  group('TransactionService', () {
    test('downloads a transaction receipt from the backend endpoint', () async {
      final apiService = MockApiService();
      apiService.bytes = Uint8List.fromList([9, 8, 7]);

      final service = TransactionService(apiService: apiService);
      final receipt = await service.getTransactionReceipt(42);

      expect(receipt, Uint8List.fromList([9, 8, 7]));
      expect(apiService.lastEndpoint, '/transactions/42/receipt');
    });
  });
}
