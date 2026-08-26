import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/scheduled_payment_model.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';

class ScheduledPaymentService {
  final ApiService _apiService = locator<ApiService>();

  /// Get all scheduled payments for the current user
  Future<List<ScheduledPayment>> getScheduledPayments({
    int? limit,
    int? offset,
    String? status,
  }) async {
    try {
      final queryParams = <String, String>{};
      if (limit != null) queryParams['limit'] = limit.toString();
      if (offset != null) queryParams['offset'] = offset.toString();
      if (status != null) queryParams['status'] = status;

      String endpoint = ApiConstants.scheduledPayments;
      if (queryParams.isNotEmpty) {
        final query = queryParams.entries
            .map((e) => '${e.key}=${e.value}')
            .join('&');
        endpoint += '?$query';
      }

      final response = await _apiService.get(endpoint);

      if (response is Map && response['payments'] is List) {
        return (response['payments'] as List)
            .map((json) => ScheduledPayment.fromJson(json))
            .toList();
      }

      return [];
    } catch (e) {
      print('Error fetching scheduled payments: $e');
      rethrow;
    }
  }

  /// Get upcoming scheduled payments
  Future<List<ScheduledPayment>> getUpcomingPayments() async {
    try {
      final response =
          await _apiService.get('${ApiConstants.scheduledPayments}/upcoming');

      if (response is Map && response['payments'] is List) {
        return (response['payments'] as List)
            .map((json) => ScheduledPayment.fromJson(json))
            .toList();
      }

      return [];
    } catch (e) {
      print('Error fetching upcoming payments: $e');
      rethrow;
    }
  }

  /// Create a new scheduled payment
  Future<ScheduledPayment> createScheduledPayment({
    required String recipientTag,
    required String amount,
    required String asset,
    String? assetIssuer,
    String? memo,
    required DateTime scheduledAt,
    String frequency = 'once',
    int? maxExecutions,
  }) async {
    try {
      final body = <String, dynamic>{
        'recipientTag': recipientTag,
        'amount': amount,
        'asset': asset,
        'scheduledAt': scheduledAt.toIso8601String(),
        'frequency': frequency,
      };

      if (assetIssuer != null) body['assetIssuer'] = assetIssuer;
      if (memo != null) body['memo'] = memo;
      if (maxExecutions != null) body['maxExecutions'] = maxExecutions;

      final response =
          await _apiService.post(ApiConstants.scheduledPayments, body);

      if (response is Map && response['scheduledPayment'] != null) {
        return ScheduledPayment.fromJson(response['scheduledPayment']);
      }

      throw Exception('Failed to create scheduled payment');
    } catch (e) {
      print('Error creating scheduled payment: $e');
      rethrow;
    }
  }

  /// Cancel a scheduled payment
  Future<void> cancelScheduledPayment(int id) async {
    try {
      await _apiService.patch(
        '${ApiConstants.scheduledPayments}/$id/cancel',
        {},
      );
    } catch (e) {
      print('Error cancelling scheduled payment: $e');
      rethrow;
    }
  }

  /// Resume a paused scheduled payment
  Future<void> resumeScheduledPayment(int id) async {
    try {
      await _apiService.patch(
        '${ApiConstants.scheduledPayments}/$id/resume',
        {},
      );
    } catch (e) {
      print('Error resuming scheduled payment: $e');
      rethrow;
    }
  }
}
