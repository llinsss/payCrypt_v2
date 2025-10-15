import 'dart:convert';
import 'package:Tagg/ui/common/api_constants.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String _tokenKey = 'auth_token';
  String? _authToken;

  // Initialize token from storage
  Future<void> initializeToken() async {
    final prefs = await SharedPreferences.getInstance();
    _authToken = prefs.getString(_tokenKey);
  }

  // Save token to storage
  Future<void> saveToken(String token) async {
    _authToken = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  // Clear token
  Future<void> clearToken() async {
    _authToken = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
  }

  // Check if user is authenticated
  bool get isAuthenticated => _authToken != null && _authToken!.isNotEmpty;

  // Get headers with authentication
  Map<String, String> get _headers {
    final headers = <String, String>{
      'Content-Type': 'application/json',
    };
    if (_authToken != null) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    return headers;
  }

  // Generic GET request
  Future<dynamic> get(String endpoint) async {
    try {
      final response = await http.get(
        Uri.parse('${ApiConstants.apiUrl}$endpoint'),
        headers: _headers,
      );
      return _handleResponse(response);
    } catch (e) {
      throw Exception('Network error: $e');
    }
  }

  // Generic POST request
  Future<dynamic> post(String endpoint, Map<String, dynamic> body) async {
    try {
      final response = await http.post(
        Uri.parse('${ApiConstants.apiUrl}$endpoint'),
        headers: _headers,
        body: json.encode(body),
      );
      return _handleResponse(response);
    } catch (e) {
      throw Exception('Network error: $e');
    }
  }

  // Generic PUT request
  Future<dynamic> put(String endpoint, Map<String, dynamic> body) async {
    try {
      final response = await http.put(
        Uri.parse('${ApiConstants.apiUrl}$endpoint'),
        headers: _headers,
        body: json.encode(body),
      );
      return _handleResponse(response);
    } catch (e) {
      throw Exception('Network error: $e');
    }
  }

  // Generic DELETE request
  Future<dynamic> delete(String endpoint) async {
    try {
      final response = await http.delete(
        Uri.parse('${ApiConstants.apiUrl}$endpoint'),
        headers: _headers,
      );
      return _handleResponse(response);
    } catch (e) {
      throw Exception('Network error: $e');
    }
  }

  // Handle response
  dynamic _handleResponse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      // Success responses
      if (response.body.isNotEmpty) {
        return json.decode(response.body);
      }
      return null;
    } else if (response.statusCode == 400) {
      throw Exception(
          'Bad Request: The server could not understand the request');
    } else if (response.statusCode == 401) {
      throw Exception('Unauthorized: Please login again');
    } else if (response.statusCode == 403) {
      throw Exception(
          'Forbidden: You do not have permission to perform this action');
    } else if (response.statusCode == 404) {
      throw Exception('Not Found: The requested resource does not exist');
    } else if (response.statusCode == 409) {
      throw Exception(
          'Conflict: The request could not be completed due to a conflict');
    } else if (response.statusCode == 422) {
      throw Exception(
          'Unprocessable Entity: Validation failed or invalid data');
    } else if (response.statusCode == 429) {
      throw Exception('Too Many Requests: You have hit the rate limit');
    } else if (response.statusCode == 500) {
      throw Exception(
          'Internal Server Error: Something went wrong on the server');
    } else if (response.statusCode == 502) {
      throw Exception('Bad Gateway: Invalid response from upstream server');
    } else if (response.statusCode == 503) {
      throw Exception(
          'Service Unavailable: Server is temporarily down or overloaded');
    } else if (response.statusCode == 504) {
      throw Exception('Gateway Timeout: The server took too long to respond');
    } else {
      final error = response.body.isNotEmpty
          ? json.decode(response.body)['message'] ?? 'Request failed'
          : 'Request failed with status: ${response.statusCode}';
      throw Exception(error);
    }
  }
}
