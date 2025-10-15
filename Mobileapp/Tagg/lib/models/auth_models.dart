import 'package:Tagg/models/user_model.dart';

class RegisterRequest {
  final String email;
  final String tag;
  final String address;
  final String password;
  final String role;

  RegisterRequest({
    required this.email,
    required this.tag,
    required this.address,
    required this.password,
    this.role = 'user',
  });

  Map<String, dynamic> toJson() => {
        'email': email,
        'tag': tag,
        'address': address,
        'password': password,
        'role': role,
      };
}

class LoginRequest {
  final String email;
  final String password;

  LoginRequest({
    required this.email,
    required this.password,
  });

  Map<String, dynamic> toJson() => {
        'email': email,
        'password': password,
      };
}

class AuthResponse {
  final String token;
  final User? user;

  AuthResponse({
    required this.token,
    this.user,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      token: json['token'] ?? '',
      user: json['user'] != null ? User.fromJson(json['user']) : null,
    );
  }
}
