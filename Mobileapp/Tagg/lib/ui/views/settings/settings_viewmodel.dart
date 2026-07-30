import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/services/auth_service.dart';
import 'package:Tagg/services/biometric_service.dart';
import 'package:Tagg/services/theme_service.dart';
import 'package:Tagg/services/user_service.dart';
import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class SettingsViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();
  final _authService = locator<AuthService>();
  final _dialogService = locator<DialogService>();
  final _themeService = locator<ThemeService>();
  final _biometricService = locator<BiometricService>();
  final _userService = locator<UserService>();

  ThemeMode _currentTheme = ThemeMode.system;
  bool _isBiometricEnabled = false;
  String _preferredCurrency = 'USD';

  ThemeMode get currentTheme => _currentTheme;
  bool get isBiometricEnabled => _isBiometricEnabled;
  String get preferredCurrency => _preferredCurrency;

  Future<void> init() async {
    _currentTheme = _themeService.themeMode;
    _isBiometricEnabled =
        await _biometricService.isBiometricUnlockEnabled();
    _preferredCurrency = await _userService.getPreferredCurrency();
    notifyListeners();
  }

  bool _pushEnabled = true;
  bool get pushEnabled => _pushEnabled;

  bool _emailEnabled = false;
  bool get emailEnabled => _emailEnabled;

  bool _inAppEnabled = true;
  bool get inAppEnabled => _inAppEnabled;

  void togglePushNotifications(bool value) {
    _pushEnabled = value;
    notifyListeners();
    // In a real app, save this to SharedPreferences or backend here
  }

  void toggleEmailNotifications(bool value) {
    _emailEnabled = value;
    notifyListeners();
  }

  void toggleInAppNotifications(bool value) {
    _inAppEnabled = value;
    notifyListeners();
  }

  void onKycTap() {
    _navigationService.navigateToKycVerificationView();
  }

  void onprofileTap() {
    _navigationService.navigateToProfileDetailsView();
  }

  void onchangePasswordTap() {
    _navigationService.navigateToChangePasswordView();
  }

  bool _isBiometricEnabled = false;
  bool get isBiometricEnabled => _isBiometricEnabled;

  void toggleBiometricUnlock(bool value) {
    _isBiometricEnabled = value;
    notifyListeners();
  }

  void onNotificationTap() {
    _navigationService.navigateToNotificationsView();
  }

  Future<void> logout() async {
    final result = await _dialogService.showDialog(
      title: 'Confirm Logout',
      description: 'Are you sure you want to log out?',
      buttonTitle: 'Logout',
      cancelTitle: 'Cancel',
    );

    if (result?.confirmed == true) {
      await _authService.logout();
      _navigationService.replaceWithSigninView();
    }
  }

  Future<void> toggleBiometricUnlock(bool enabled) async {
    _isBiometricEnabled = enabled;

    if (enabled) {
      await _biometricService.enableBiometricUnlock();
    } else {
      await _biometricService.disableBiometricUnlock();
    }

    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    _currentTheme = mode;
    await _themeService.setThemeMode(mode);
    notifyListeners();
  }

  Future<void> setPreferredCurrency(String currency) async {
    _preferredCurrency = currency;
    await _userService.setPreferredCurrency(currency);
    notifyListeners();
  }
}
