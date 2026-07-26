import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/auth_models.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';
import 'package:google_sign_in/google_sign_in.dart';

class AuthService {
  final ApiService _apiService = locator<ApiService>();
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
    return authResponse;
  }

  Future<AuthResponse> login(LoginRequest request) async {
    final response = await _apiService.post(
      ApiConstants.login,
      request.toJson(),
    );
    final authResponse = AuthResponse.fromJson(response);
    await _apiService.saveToken(authResponse.token);
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
        '${ApiConstants.baseUrl}/auth/google',
        {'idToken': idToken},
      );
      final authResponse = AuthResponse.fromJson(response);
      await _apiService.saveToken(authResponse.token);
      return authResponse;
    } catch (e) {
      await _googleSignIn.signOut();
      rethrow;
    }
  }

  bool isAuthenticated() => _apiService.isAuthenticated;

  Future<void> logout() async {
    await _apiService.clearToken();
    await _googleSignIn.signOut();
  }
}
