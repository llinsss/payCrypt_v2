import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/services/auth_service.dart';
import 'package:Tagg/services/theme_service.dart';
#340-Implement-Token-Swap-Backend-Endpoint-FIX
import 'package:Tagg/services/biometric_service.dart';

import 'package:Tagg/services/user_service.dart';

import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class SettingsViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();
  final _authService = locator<AuthService>();
  final _dialogService = locator<DialogService>();
  final _themeService = locator<ThemeService>();
#340-Implement-Token-Swap-Backend-Endpoint-FIX
  final _biometricService = locator<BiometricService>();

  final _userService = locator<UserService>();


  ThemeMode _currentTheme = ThemeMode.system;
  bool _isBiometricEnabled = false;

  ThemeMode get currentTheme => _currentTheme;
  bool get isBiometricEnabled => _isBiometricEnabled;

#340-Implement-Token-Swap-Backend-Endpoint-FIX
  Future<void> init() async {
    _currentTheme = _themeService.themeMode;
    _isBiometricEnabled = await _biometricService.isBiometricUnlockEnabled();

  String _preferredCurrency = 'USD';
  String get preferredCurrency => _preferredCurrency;

  @override
  void init() {
    super.init();
    _currentTheme = _themeService.themeMode;
    _loadPreferredCurrency();
  }

  Future<void> _loadPreferredCurrency() async {
    _preferredCurrency = await _userService.getPreferredCurrency();

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
