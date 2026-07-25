import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

class BiometricService {
  static const String _enabledKey = 'biometric_unlock_enabled';
  late final LocalAuthentication _auth;

  BiometricService() {
    _auth = LocalAuthentication();
  }

  /// Check if device supports biometrics
  Future<bool> isBiometricAvailable() async {
    try {
      final isDeviceSupported = await _auth.canCheckBiometrics;
      final isDeviceSecure = await _auth.deviceSupportsBiometric;
      return isDeviceSupported && isDeviceSecure;
    } catch (e) {
      return false;
    }
  }

  /// Get list of available biometric types
  Future<List<BiometricType>> getAvailableBiometrics() async {
    try {
      return await _auth.getAvailableBiometrics();
    } catch (e) {
      return [];
    }
  }

  /// Authenticate with biometrics
  Future<bool> authenticate() async {
    try {
      return await _auth.authenticate(
        localizedReason: 'Unlock Tagg wallet',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: true,
        ),
      );
    } catch (e) {
      return false;
    }
  }

  /// Authenticate with biometrics or fallback to device PIN/password
  Future<bool> authenticateWithFallback() async {
    try {
      return await _auth.authenticate(
        localizedReason: 'Unlock Tagg wallet',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false,
        ),
      );
    } catch (e) {
      return false;
    }
  }

  /// Check if biometric unlock is enabled
  Future<bool> isBiometricUnlockEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_enabledKey) ?? false;
  }

  /// Enable biometric unlock
  Future<void> enableBiometricUnlock() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledKey, true);
  }

  /// Disable biometric unlock
  Future<void> disableBiometricUnlock() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledKey, false);
  }
}
