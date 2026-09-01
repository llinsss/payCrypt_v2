import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/auth_models.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/services/push_notification_service.dart';
import 'package:Tagg/services/user_service.dart';
import 'package:Tagg/services/websocket_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';
import 'package:google_sign_in/google_sign_in.dart';

class AuthService {
  final ApiService _apiService = locator<ApiService>();
  final WebSocketService _webSocketService = locator<WebSocketService>();
  final PushNotificationService _pushNotificationService =
      locator<PushNotificationService>();
  final UserService _userService = locator<UserService>();
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: ['email', 'profile'],
  );

  Future<AuthResponse> register(RegisterRequest request) async {
    final response = await _apiService.post(
      ApiConstants.register,
      request.toJson(),
    );
    final authResponse = AuthResponse.fromJson(response);
    await _apiService.saveToken(authResponse.token);
    await _pushNotificationService.bindToCurrentUser(apiService: _apiService);
    return authResponse;
  }

  Future<AuthResponse> login(LoginRequest request) async {
    final response = await _apiService.post(
      ApiConstants.login,
      request.toJson(),
    );
    final authResponse = AuthResponse.fromJson(response);
    await _apiService.saveToken(authResponse.token);
    await _pushNotificationService.bindToCurrentUser(apiService: _apiService);
    return authResponse;
  }

  Future<AuthResponse> loginWithGoogle() async {
    try {
      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        throw Exception('Google sign-in cancelled by user');
      }

      final googleAuth = await googleUser.authentication;
      final idToken = googleAuth.idToken;

      if (idToken == null) {
        throw Exception('Failed to obtain ID token from Google');
      }

      final response = await _apiService.post(
        ApiConstants.googleAuth,
        {'idToken': idToken},
      );
      final authResponse = AuthResponse.fromJson(response);
      await _apiService.saveToken(authResponse.token);
      await _pushNotificationService.bindToCurrentUser(apiService: _apiService);
      return authResponse;
    } catch (e) {
      await _googleSignIn.signOut();
      rethrow;
    }
  }

  bool isAuthenticated() => _apiService.isAuthenticated;

  /// Centralized session teardown. Runs in an order that keeps every
  /// step authenticated where it needs to be (push unbind hits the
  /// backend before the token is cleared), and leaves nothing user-scoped
  /// behind — so a second account signing in on the same device never
  /// inherits cached balances, profile prefs, or pending notifications
  /// from the previous session. Device-level preferences (theme,
  /// language, onboarding, biometric toggle) are intentionally left
  /// untouched.
  Future<void> logout() async {
    await _pushNotificationService.unbindFromCurrentUser(
      apiService: _apiService,
    );
    await _webSocketService.disconnect();
    await _userService.clearCache();
    await _apiService.clearToken();
    await _googleSignIn.signOut();
  }
}
