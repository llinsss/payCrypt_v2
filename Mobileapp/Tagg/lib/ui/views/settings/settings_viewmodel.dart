import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/services/auth_service.dart';
import 'package:Tagg/services/biometric_service.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class SettingsViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();
  final _authService = locator<AuthService>();
  final _dialogService = locator<DialogService>();
  final _biometricService = locator<BiometricService>();

  bool isBiometricEnabled = false;
  bool _biometricAvailable = false;

  @override
  Future<void> initialise() async {
    // Check if biometric is available on device
    _biometricAvailable = await _biometricService.isBiometricAvailable();

    // Load biometric unlock state
    if (_biometricAvailable) {
      isBiometricEnabled = await _biometricService.isBiometricUnlockEnabled();
      notifyListeners();
    }

    await super.initialise();
  }

  Future<void> toggleBiometricUnlock(bool value) async {
    if (!_biometricAvailable) {
      await _dialogService.showDialog(
        title: 'Biometric Not Available',
        description: 'This device does not support biometric authentication.',
      );
      return;
    }

    if (value) {
      // Request biometric authentication to enable
      final authenticated = await _biometricService.authenticate();

      if (authenticated) {
        await _biometricService.enableBiometricUnlock();
        isBiometricEnabled = true;
        notifyListeners();
      } else {
        // User cancelled or failed biometric, don't enable
        isBiometricEnabled = false;
        notifyListeners();
      }
    } else {
      // Disable biometric unlock
      await _biometricService.disableBiometricUnlock();
      isBiometricEnabled = false;
      notifyListeners();
    }
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
}
