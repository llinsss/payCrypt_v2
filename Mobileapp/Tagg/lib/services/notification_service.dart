import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';

class NotificationService {
  final ApiService _apiService;

  NotificationService(this._apiService);

  Future<Map<String, dynamic>> getPreferences() async {
    try {
      final response = await _apiService.get(ApiConstants.notificationPreferences);
      return Map<String, dynamic>.from(response);
    } catch (e) {
      rethrow;
    }
  }

  Future<Map<String, dynamic>> updatePreferences(
      Map<String, dynamic> preferences) async {
    try {
      final response = await _apiService.put(
        ApiConstants.notificationPreferences,
        preferences,
      );
      return Map<String, dynamic>.from(response);
    } catch (e) {
      rethrow;
    }
  }

  Future<List<dynamic>> getNotifications() async {
    try {
      final response = await _apiService.get(ApiConstants.notifications);
      return List<dynamic>.from(response);
    } catch (e) {
      rethrow;
    }
  }

  Future<List<dynamic>> getUnreadNotifications() async {
    try {
      final response =
          await _apiService.get(ApiConstants.unreadNotifications);
      return List<dynamic>.from(response);
    } catch (e) {
      rethrow;
    }
  }

  Future<void> markAsRead(int notificationId) async {
    try {
      await _apiService.put(
        '${ApiConstants.notifications}/$notificationId',
        {'read': true},
      );
    } catch (e) {
      rethrow;
    }
  }
}
