import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/auth_models.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';

class AuthService {
  final ApiService _apiService = locator<ApiService>();

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

  Future<void> logout() async {
    await _apiService.clearToken();
  }
}
