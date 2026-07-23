import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/batch_payment_models.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';

class BatchPaymentService {
  final _apiService = locator<ApiService>();

  /// Submit a batch payment.
  ///
  /// [payments]    – list of up to 50 payment entries.
  /// [failureMode] – 'abort' (stop on first failure) or 'continue'
  ///                 (process remaining payments despite failures).
  Future<BatchPaymentResponse> createBatchPayment({
    required List<BatchPaymentEntry> payments,
    required String failureMode,
  }) async {
    try {
      final body = {
        'payments': payments.map((p) => p.toJson()).toList(),
        'failureMode': failureMode,
      };

      final response = await _apiService.post(ApiConstants.batchPayments, body);
      return BatchPaymentResponse.fromJson(response as Map<String, dynamic>);
    } catch (e) {
      rethrow;
    }
  }

  /// Poll the status of a previously submitted batch payment.
  Future<BatchPaymentResponse> getBatchPaymentStatus(int batchId) async {
    try {
      final response =
          await _apiService.get(ApiConstants.batchPaymentById(batchId));
      return BatchPaymentResponse.fromJson(response as Map<String, dynamic>);
    } catch (e) {
      rethrow;
    }
  }
}
