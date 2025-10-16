import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/wallet_data.dart';
import 'package:Tagg/models/withdrawal_models.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';

class WalletService {
  final ApiService _apiService = locator<ApiService>();

  /// Get wallet balance data (available and locked balances)
  Future<WalletData> getWalletBalance() async {
    try {
      final response = await _apiService.get(ApiConstants.walletBalance);

      // Handle if response is a Map
      if (response is Map<String, dynamic>) {
        return WalletData.fromJson(response);
      }
      // Handle if response is a List (unexpected but let's handle it)
      else if (response is List && response.isNotEmpty) {
        return WalletData.fromJson(response.first);
      }

      // Return empty wallet data if format is unexpected
      return WalletData(
        id: 0,
        userId: 0,
        availableBalance: 0.0,
        lockedBalance: 0.0,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
    } catch (e) {
      print('Error fetching wallet balance: $e');
      // Return empty wallet data on error
      return WalletData(
        id: 0,
        userId: 0,
        availableBalance: 0.0,
        lockedBalance: 0.0,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
    }
  }

  /// Withdraw to another user's tag
  Future<WithdrawalResponse> withdrawToTag({
    required int balanceId,
    required String amount,
    required String receiverTag,
  }) async {
    try {
      final request = WithdrawToTagRequest(
        balanceId: balanceId,
        amount: amount,
        receiverTag: receiverTag,
      );

      final response = await _apiService.post(
        ApiConstants.sendToTag,
        request.toJson(),
      );

      return WithdrawalResponse.fromJson(response);
    } catch (e) {
      print('Error withdrawing to tag: $e');
      rethrow;
    }
  }
}
