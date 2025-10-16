import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/user_model.dart';
import 'package:Tagg/models/dashboard_summary.dart';
import 'package:Tagg/models/user_token_balance.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';

class UserService {
  final ApiService _apiService = locator<ApiService>();

  Future<User> getProfile() async {
    final response = await _apiService.get(ApiConstants.userProfile);
    print('📥 Raw API response: $response');

    // Extract the user object from the nested response
    final userData = response['user'] as Map<String, dynamic>;
    print('👤 User data extracted: $userData');

    final user = User.fromJson(userData);
    print('✅ Parsed user: $user');
    return user;
  }

  Future<DashboardSummary> getDashboardSummary() async {
    try {
      final response = await _apiService.get(ApiConstants.dashboardSummary);

      // Handle if response is a Map
      if (response is Map<String, dynamic>) {
        return DashboardSummary.fromJson(response);
      }
      // Handle if response is a List (unexpected but let's handle it)
      else if (response is List && response.isNotEmpty) {
        return DashboardSummary.fromJson(response.first);
      }

      // Return empty summary if format is unexpected
      return DashboardSummary(
        totalBalance: 0.0,
        totalDeposit: 0.0,
        totalWithdrawal: 0.0,
        portfolioGrowth: 0.0,
      );
    } catch (e) {
      print('Error fetching dashboard summary: $e');
      // Return empty summary on error
      return DashboardSummary(
        totalBalance: 0.0,
        totalDeposit: 0.0,
        totalWithdrawal: 0.0,
        portfolioGrowth: 0.0,
      );
    }
  }

  /// Get user's token balances
  Future<List<UserTokenBalance>> getUserTokenBalances() async {
    final response = await _apiService.get(ApiConstants.balances);
    if (response is List) {
      return response.map((json) => UserTokenBalance.fromJson(json)).toList();
    }
    return [];
  }

  Future<void> updateProfile(Map<String, dynamic> data) async {
    await _apiService.post(ApiConstants.userProfile, data);
  }
}
