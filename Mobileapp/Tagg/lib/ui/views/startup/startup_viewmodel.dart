import 'package:stacked/stacked.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/services/biometric_service.dart';
import 'package:Tagg/services/auth_service.dart';
import 'package:stacked_services/stacked_services.dart';

class StartupViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();
  final _apiService = locator<ApiService>();
  final _biometricService = locator<BiometricService>();
  final _authService = locator<AuthService>();

  Future runStartupLogic() async {
    // Initialize the API service token from storage
    await _apiService.initializeToken();

    // Check if user has an active session
    final hasActiveSession = _authService.isAuthenticated();

    if (hasActiveSession) {
      // Check if biometric unlock is enabled
      final isBiometricEnabled = await _biometricService.isBiometricUnlockEnabled();

      if (isBiometricEnabled) {
        // Attempt biometric authentication
        final authenticated = await _biometricService.authenticateWithFallback();

        if (authenticated) {
          // Biometric successful, navigate to home
          await Future.delayed(const Duration(seconds: 1));
          _navigationService.replaceWithBottomnavView();
          return;
        } else {
          // Biometric failed, require login
          _navigationService.replaceWithSigninView();
          return;
        }
      } else {
        // No biometric enabled, go to home
        await Future.delayed(const Duration(seconds: 1));
        _navigationService.replaceWithBottomnavView();
        return;
      }
    }

    await Future.delayed(const Duration(seconds: 3));
    _navigationService.replaceWithSigninView();
  }
}
