import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:Tagg/ui/common/api_constants.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// A single field-level validation error from the backend's canonical
/// `{ error, message, errors[] }` envelope.
class ApiFieldError {
  final String field;
  final String? code;
  final String message;

  ApiFieldError({required this.field, this.code, required this.message});

  factory ApiFieldError.fromJson(Map<String, dynamic> json) => ApiFieldError(
        field: (json['field'] ?? '').toString(),
        code: json['code']?.toString(),
        message: (json['message'] ?? '').toString(),
      );
}

/// Structured API error carrying the backend's canonical error envelope
/// (status code, error code, message, field errors and request id) instead
/// of a flattened generic string, so callers can surface field-level
/// validation feedback and correlate reports with server-side logs.
class ApiException implements Exception {
  final int statusCode;
  final String? errorCode;
  final String message;
  final List<ApiFieldError> fieldErrors;
  final String? requestId;
  final String? correlationId;

  ApiException({
    required this.statusCode,
    this.errorCode,
    required this.message,
    this.fieldErrors = const [],
    this.requestId,
    this.correlationId,
  });

  bool get isValidationError => statusCode == 400 || statusCode == 422;

  @override
  String toString() => message;
}

/// Thrown when a request exceeds its configured connect/response deadline.
class ApiTimeoutException implements Exception {
  final String message;
  ApiTimeoutException([this.message = 'The request timed out']);

  @override
  String toString() => message;
}

/// Thrown when a request is aborted via a [CancelToken].
class RequestCancelledException implements Exception {
  final String message;
  RequestCancelledException([this.message = 'The request was cancelled']);

  @override
  String toString() => message;
}

/// Cooperative cancellation handle. Pass the same token to one or more
/// [ApiService] calls and invoke [cancel] (e.g. from a `dispose()`) to abort
/// them with a [RequestCancelledException].
class CancelToken {
  final Completer<void> _completer = Completer<void>();
  bool _isCancelled = false;

  bool get isCancelled => _isCancelled;

  void cancel() {
    if (!_isCancelled) {
      _isCancelled = true;
      _completer.complete();
    }
  }

  Future<void> get whenCancelled => _completer.future;
}

class ApiService {
  static const String _tokenKey = 'auth_token';

  // Keychain/Keystore-backed storage for secrets. EncryptedSharedPreferences
  // on Android and `first_unlock_this_device` Keychain accessibility on iOS
  // both keep the token out of plaintext prefs and out of device-to-device
  // restore backups.
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  /// Deadline for establishing the connection.
  static const Duration connectTimeout = Duration(seconds: 10);

  /// Deadline for receiving the full response after the connection opens.
  static const Duration receiveTimeout = Duration(seconds: 20);

  static Duration get _requestTimeout => connectTimeout + receiveTimeout;

  String? _authToken;

  // Initialize token from secure storage, migrating any legacy value that
  // was previously persisted in SharedPreferences.
  Future<void> initializeToken() async {
    _authToken = await _secureStorage.read(key: _tokenKey);
    if (_authToken == null || _authToken!.isEmpty) {
      final prefs = await SharedPreferences.getInstance();
      final legacyToken = prefs.getString(_tokenKey);
      if (legacyToken != null && legacyToken.isNotEmpty) {
        await _secureStorage.write(key: _tokenKey, value: legacyToken);
        _authToken = legacyToken;
      }
      await prefs.remove(_tokenKey);
    }
  }

  // Save token to secure storage
  Future<void> saveToken(String token) async {
    _authToken = token;
    await _secureStorage.write(key: _tokenKey, value: token);
  }

  // Clear token from secure storage
  Future<void> clearToken() async {
    _authToken = null;
    await _secureStorage.delete(key: _tokenKey);
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

  // Runs [request], applying the centralized connect/response deadline and
  // honoring [cancelToken] if one is supplied.
  Future<http.Response> _send(
    Future<http.Response> Function() request, {
    CancelToken? cancelToken,
  }) {
    if (cancelToken != null && cancelToken.isCancelled) {
      throw RequestCancelledException();
    }

    final Future<http.Response> future = request().timeout(
      _requestTimeout,
      onTimeout: () => throw ApiTimeoutException(),
    );

    if (cancelToken == null) {
      return future;
    }

    return Future.any<http.Response>([
      future,
      cancelToken.whenCancelled
          .then((_) => throw RequestCancelledException()),
    ]);
  }

  // Generic GET request
  Future<dynamic> get(String endpoint, {CancelToken? cancelToken}) async {
    try {
      final response = await _send(
        () => http.get(
          Uri.parse('${ApiConstants.apiUrl}$endpoint'),
          headers: _headers,
        ),
        cancelToken: cancelToken,
      );
      return _handleResponse(response);
    } on ApiException {
      rethrow;
    } on ApiTimeoutException {
      rethrow;
    } on RequestCancelledException {
      rethrow;
    } catch (e) {
      throw Exception('Network error: $e');
    }
  }

  Future<Uint8List> getBytes(String endpoint, {CancelToken? cancelToken}) async {
    try {
      final response = await _send(
        () => http.get(
          Uri.parse('${ApiConstants.apiUrl}$endpoint'),
          headers: _headers,
        ),
        cancelToken: cancelToken,
      );

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return response.bodyBytes;
      }

      throw _buildApiException(response);
    } on ApiException {
      rethrow;
    } on ApiTimeoutException {
      rethrow;
    } on RequestCancelledException {
      rethrow;
    } catch (e) {
      throw Exception('Network error: $e');
    }
  }

  // Generic POST request
  Future<dynamic> post(
    String endpoint,
    Map<String, dynamic> body, {
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _send(
        () => http.post(
          Uri.parse('${ApiConstants.apiUrl}$endpoint'),
          headers: _headers,
          body: json.encode(body),
        ),
        cancelToken: cancelToken,
      );
      return _handleResponse(response);
    } on ApiException {
      rethrow;
    } on ApiTimeoutException {
      rethrow;
    } on RequestCancelledException {
      rethrow;
    } catch (e) {
      throw Exception('Network error: $e');
    }
  }

  // Generic PUT request
  Future<dynamic> put(
    String endpoint,
    Map<String, dynamic> body, {
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _send(
        () => http.put(
          Uri.parse('${ApiConstants.apiUrl}$endpoint'),
          headers: _headers,
          body: json.encode(body),
        ),
        cancelToken: cancelToken,
      );
      return _handleResponse(response);
    } on ApiException {
      rethrow;
    } on ApiTimeoutException {
      rethrow;
    } on RequestCancelledException {
      rethrow;
    } catch (e) {
      throw Exception('Network error: $e');
    }
  }

  // Generic DELETE request
  Future<dynamic> delete(String endpoint, {CancelToken? cancelToken}) async {
    try {
      final response = await _send(
        () => http.delete(
          Uri.parse('${ApiConstants.apiUrl}$endpoint'),
          headers: _headers,
        ),
        cancelToken: cancelToken,
      );
      return _handleResponse(response);
    } on ApiException {
      rethrow;
    } on ApiTimeoutException {
      rethrow;
    } on RequestCancelledException {
      rethrow;
    } catch (e) {
      throw Exception('Network error: $e');
    }
  }

  // Generic DELETE request with body
  Future<dynamic> deleteWithBody(
    String endpoint,
    Map<String, dynamic> body, {
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _send(
        () => http.delete(
          Uri.parse('${ApiConstants.apiUrl}$endpoint'),
          headers: _headers,
          body: json.encode(body),
        ),
        cancelToken: cancelToken,
      );
      return _handleResponse(response);
    } on ApiException {
      rethrow;
    } on ApiTimeoutException {
      rethrow;
    } on RequestCancelledException {
      rethrow;
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
    }

    throw _buildApiException(response);
  }

  // Decodes the backend's canonical `{ error, message, errors[] }` envelope
  // first, before falling back to a generic status-based message, so field
  // errors and correlation ids survive up to the caller.
  ApiException _buildApiException(http.Response response) {
    final requestId = response.headers['x-request-id'];
    final correlationId = response.headers['x-correlation-id'];

    Map<String, dynamic>? decoded;
    if (response.body.isNotEmpty) {
      try {
        final parsed = json.decode(response.body);
        if (parsed is Map<String, dynamic>) {
          decoded = parsed;
        }
      } catch (_) {
        // Body wasn't JSON; fall through to the generic message below.
      }
    }

    if (decoded != null) {
      final fieldErrors = <ApiFieldError>[];
      final rawErrors = decoded['errors'];
      if (rawErrors is List) {
        for (final e in rawErrors) {
          if (e is Map<String, dynamic>) {
            fieldErrors.add(ApiFieldError.fromJson(e));
          }
        }
      }

      // Only the `message` field is treated as caller-facing text; a bare
      // `{ error: "..." }` body (e.g. auth middleware) falls back to the
      // existing status-based message so callers matching on it (e.g.
      // "Unauthorized") keep working.
      final message =
          decoded['message']?.toString() ?? _defaultMessageFor(response.statusCode);

      return ApiException(
        statusCode: response.statusCode,
        errorCode: decoded['error']?.toString(),
        message: message,
        fieldErrors: fieldErrors,
        requestId: requestId,
        correlationId: correlationId,
      );
    }

    return ApiException(
      statusCode: response.statusCode,
      message: _defaultMessageFor(response.statusCode),
      requestId: requestId,
      correlationId: correlationId,
    );
  }

  String _defaultMessageFor(int statusCode) {
    switch (statusCode) {
      case 400:
        return 'Bad Request: The server could not understand the request';
      case 401:
        return 'Unauthorized: Please login again';
      case 403:
        return 'Forbidden: You do not have permission to perform this action';
      case 404:
        return 'Not Found: The requested resource does not exist';
      case 409:
        return 'Conflict: The request could not be completed due to a conflict';
      case 422:
        return 'Unprocessable Entity: Validation failed or invalid data';
      case 429:
        return 'Too Many Requests: You have hit the rate limit';
      case 500:
        return 'Internal Server Error: Something went wrong on the server';
      case 502:
        return 'Bad Gateway: Invalid response from upstream server';
      case 503:
        return 'Service Unavailable: Server is temporarily down or overloaded';
      case 504:
        return 'Gateway Timeout: The server took too long to respond';
      default:
        return 'Request failed with status: $statusCode';
    }
  }
}
