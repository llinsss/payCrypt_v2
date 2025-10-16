import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/transaction_model.dart';
import 'package:Tagg/services/api_service.dart';

class TransactionService {
  final _apiService = locator<ApiService>();

  /// Get user transactions with optional filters
  Future<List<Transaction>> getUserTransactions({
    String? type, // 'debit' or 'credit'
    String? status, // 'completed', 'pending', 'failed'
    int? limit,
    int? offset,
  }) async {
    try {
      // Build query parameters
      final queryParams = <String, String>{};
      if (type != null) queryParams['type'] = type;
      if (status != null) queryParams['status'] = status;
      if (limit != null) queryParams['limit'] = limit.toString();
      if (offset != null) queryParams['offset'] = offset.toString();

      // Build endpoint with query params
      final endpoint = '/transactions${_buildQueryString(queryParams)}';

      final response = await _apiService.get(endpoint);

      if (response is List) {
        return response.map((json) => Transaction.fromJson(json)).toList();
      } else if (response is Map && response['data'] is List) {
        return (response['data'] as List)
            .map((json) => Transaction.fromJson(json))
            .toList();
      }

      return [];
    } catch (e) {
      print('Error fetching transactions: $e');
      rethrow;
    }
  }

  /// Get single transaction by ID
  Future<Transaction?> getTransactionById(int id) async {
    try {
      final response = await _apiService.get('/transactions/$id');
      return Transaction.fromJson(response);
    } catch (e) {
      print('Error fetching transaction $id: $e');
      return null;
    }
  }

  /// Get recent transactions (last 10)
  Future<List<Transaction>> getRecentTransactions() async {
    return getUserTransactions(limit: 5);
  }

  String _buildQueryString(Map<String, String> params) {
    if (params.isEmpty) return '';
    final query = params.entries.map((e) => '${e.key}=${e.value}').join('&');
    return '?$query';
  }
}
