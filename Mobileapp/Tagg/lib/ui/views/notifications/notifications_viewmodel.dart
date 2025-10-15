import 'package:Tagg/app/app.locator.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class NotificationsViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();

  bool _transactionNotifications = true;
  bool _securityAlerts = true;
  bool _priceAlerts = false;
  bool _marketingUpdates = true;
  bool _weeklyReports = true;

  bool get transactionNotifications => _transactionNotifications;
  bool get securityAlerts => _securityAlerts;
  bool get priceAlerts => _priceAlerts;
  bool get marketingUpdates => _marketingUpdates;
  bool get weeklyReports => _weeklyReports;

  void navigateBack() {
    _navigationService.back();
  }

  void toggleTransactionNotifications() {
    _transactionNotifications = !_transactionNotifications;
    rebuildUi();
    // Add service call to save preference
  }

  void toggleSecurityAlerts() {
    _securityAlerts = !_securityAlerts;
    rebuildUi();
    // Add service call to save preference
  }

  void togglePriceAlerts() {
    _priceAlerts = !_priceAlerts;
    rebuildUi();
    // Add service call to save preference
  }

  void toggleMarketingUpdates() {
    _marketingUpdates = !_marketingUpdates;
    rebuildUi();
    // Add service call to save preference
  }

  void toggleWeeklyReports() {
    _weeklyReports = !_weeklyReports;
    rebuildUi();
    // Add service call to save preference
  }
}
