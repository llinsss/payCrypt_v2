import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/services/notification_service.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class NotificationsViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();
  final _notificationService = locator<NotificationService>();

  bool _transactionNotifications = true;
  bool _securityAlerts = true;
  bool _priceAlerts = false;
  bool _marketingUpdates = true;
  bool _weeklyReports = true;
  bool _isLoading = true;

  bool get transactionNotifications => _transactionNotifications;
  bool get securityAlerts => _securityAlerts;
  bool get priceAlerts => _priceAlerts;
  bool get marketingUpdates => _marketingUpdates;
  bool get weeklyReports => _weeklyReports;
  bool get isLoading => _isLoading;

  Future<void> initialize() async {
    _isLoading = true;
    rebuildUi();

    try {
      final prefs = await _notificationService.getPreferences();
      _transactionNotifications =
          prefs['payment_notifications'] as bool? ?? true;
      _securityAlerts =
          prefs['security_notifications'] as bool? ?? true;
      _marketingUpdates =
          prefs['marketing_notifications'] as bool? ?? false;
      _weeklyReports = prefs['transaction_notifications'] as bool? ?? true;
      _priceAlerts = prefs['price_alerts'] as bool? ?? false;
    } catch (e) {
      print('Failed to load notification preferences: $e');
    }

    _isLoading = false;
    rebuildUi();
  }

  void navigateBack() {
    _navigationService.back();
  }

  void toggleTransactionNotifications() {
    _transactionNotifications = !_transactionNotifications;
    rebuildUi();
    _savePreference('transaction_notifications', _transactionNotifications);
  }

  void toggleSecurityAlerts() {
    _securityAlerts = !_securityAlerts;
    rebuildUi();
    _savePreference('security_notifications', _securityAlerts);
  }

  void togglePriceAlerts() {
    _priceAlerts = !_priceAlerts;
    rebuildUi();
    _savePreference('price_alerts', _priceAlerts);
  }

  void toggleMarketingUpdates() {
    _marketingUpdates = !_marketingUpdates;
    rebuildUi();
    _savePreference('marketing_notifications', _marketingUpdates);
  }

  void toggleWeeklyReports() {
    _weeklyReports = !_weeklyReports;
    rebuildUi();
    _savePreference('transaction_notifications', _weeklyReports);
  }

  Future<void> _savePreference(String key, bool value) async {
    try {
      await _notificationService.updatePreferences({key: value});
    } catch (e) {
      print('Failed to save preference $key: $e');
    }
  }
}
