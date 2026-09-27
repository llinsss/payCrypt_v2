import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/ui/common/api_constants.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class WebSocketService {
  final ApiService _apiService = locator<ApiService>();
  WebSocketChannel? _channel;
  Timer? _reconnectTimer;
  Timer? _pollingTimer;
  Timer? _expiryTimer;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 10;
  static const Duration _expiryRefreshLead = Duration(seconds: 30);
  bool _isConnected = false;
  bool _isDisposed = false;

  // Stream controllers for different event types
  final _balanceUpdateController = StreamController<Map<String, dynamic>>.broadcast();
  final _transactionUpdateController = StreamController<Map<String, dynamic>>.broadcast();
  final _connectionStateController = StreamController<bool>.broadcast();

  Stream<Map<String, dynamic>> get onBalanceUpdate => _balanceUpdateController.stream;
  Stream<Map<String, dynamic>> get onTransactionUpdate => _transactionUpdateController.stream;
  Stream<bool> get onConnectionState => _connectionStateController.stream;
  bool get isConnected => _isConnected;

  /// Connect to WebSocket server
  Future<void> connect() async {
    if (_isConnected || _isDisposed) return;

    try {
      await _apiService.initializeToken();
      if (!_apiService.isAuthenticated) return;

      final token = _apiService.authToken;
      if (token == null || token.isEmpty) return;

      final expiresAt = _decodeTokenExpiry(token);
      if (expiresAt != null && !expiresAt.isAfter(DateTime.now())) {
        // Stale token: don't spin the socket up with credentials that will
        // be rejected immediately.
        _connectionStateController.add(false);
        return;
      }

      final wsUrl = ApiConstants.baseUrl
          .replaceFirst('https://', 'wss://')
          .replaceFirst('http://', 'ws://');

      if (kReleaseMode && !wsUrl.startsWith('wss://')) {
        if (kDebugMode) {
          debugPrint('Refusing insecure WebSocket connection in release build');
        }
        _connectionStateController.add(false);
        return;
      }

      _channel = WebSocketChannel.connect(
        Uri.parse('$wsUrl?token=$token'),
      );

      // Explicit auth handshake for servers that expect a first message
      // rather than (or in addition to) the query-string token.
      _channel!.sink.add(json.encode({
        'event': 'authenticate',
        'data': {'token': token},
      }));

      _channel!.stream.listen(
        (data) {
          _handleMessage(data);
        },
        onDone: () {
          _isConnected = false;
          _connectionStateController.add(false);
          _scheduleReconnect();
        },
        onError: (error) {
          if (kDebugMode) {
            debugPrint('WebSocket error: ${error.runtimeType}');
          }
          _isConnected = false;
          _connectionStateController.add(false);
          _scheduleReconnect();
        },
      );

      _isConnected = true;
      _reconnectAttempts = 0;
      _connectionStateController.add(true);
      if (expiresAt != null) {
        _scheduleExpiryRefresh(expiresAt);
      }
      if (kDebugMode) {
        debugPrint('WebSocket connected successfully');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('WebSocket connection failed: ${e.runtimeType}');
      }
      _scheduleReconnect();
      _startPollingFallback();
    }
  }

  /// Decode the `exp` claim (seconds since epoch) from a JWT without
  /// validating its signature — used only to avoid connecting with a
  /// token we already know is stale, and to schedule a proactive refresh.
  DateTime? _decodeTokenExpiry(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;
      final normalized = base64Url.normalize(parts[1]);
      final payload = json.decode(utf8.decode(base64Url.decode(normalized)));
      if (payload is! Map<String, dynamic>) return null;
      final exp = payload['exp'];
      if (exp is! num) return null;
      return DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000);
    } catch (_) {
      return null;
    }
  }

  /// Proactively refresh the connection shortly before the token expires,
  /// instead of waiting for the server to reject it.
  void _scheduleExpiryRefresh(DateTime expiresAt) {
    _expiryTimer?.cancel();
    var delay = expiresAt.difference(DateTime.now()) - _expiryRefreshLead;
    if (delay.isNegative) delay = Duration.zero;

    _expiryTimer = Timer(delay, () async {
      if (_isDisposed) return;
      _isConnected = false;
      await _channel?.sink.close();
      connect();
    });
  }

  /// Handle incoming WebSocket messages
  void _handleMessage(dynamic data) {
    try {
      if (data is! String) return;

      final decoded = json.decode(data);
      if (decoded is! Map<String, dynamic>) return;

      final event = decoded['event'];
      final payload = decoded['data'];
      if (event is! String || event.isEmpty) return;

      switch (event) {
        case 'balance_updated':
          if (payload is Map<String, dynamic>) {
            _balanceUpdateController.add(payload);
          }
          break;
        case 'transaction:update':
          if (payload is Map<String, dynamic>) {
            _transactionUpdateController.add(payload);
            final balance = payload['balance'];
            if (balance is Map<String, dynamic>) {
              _balanceUpdateController.add(balance);
            }
          }
          break;
        case 'unauthorized':
        case 'token_expired':
          _handleAuthExpired();
          break;
        default:
          if (kDebugMode) {
            debugPrint('Unknown WebSocket event: $event');
          }
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Error handling WebSocket message: ${e.runtimeType}');
      }
    }
  }

  /// Server rejected (or is about to reject) our credentials: drop the
  /// socket, pull the latest token, and reconnect immediately rather than
  /// waiting out the exponential backoff.
  void _handleAuthExpired() async {
    if (_isDisposed) return;
    _isConnected = false;
    _connectionStateController.add(false);
    await _channel?.sink.close();
    await _apiService.initializeToken();
    if (_apiService.isAuthenticated) {
      connect();
    }
  }

  /// Schedule reconnection with exponential backoff
  void _scheduleReconnect() {
    if (_isDisposed || _reconnectAttempts >= _maxReconnectAttempts) return;

    final delay = Duration(
      seconds: _reconnectAttempts == 0
          ? 1
          : _reconnectAttempts > 5
              ? 30
              : 1 << _reconnectAttempts, // exponential: 2, 4, 8, 16, 32
    );

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, () {
      _reconnectAttempts++;
      if (kDebugMode) {
        debugPrint('WebSocket reconnecting (attempt $_reconnectAttempts)...');
      }
      connect();
    });
  }

  /// Fallback polling when WebSocket is disconnected
  void _startPollingFallback() {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 30), (_) async {
      if (_isConnected) {
        _pollingTimer?.cancel();
        return;
      }
      try {
        final response = await _apiService.get('/balances');
        if (response is Map || response is List) {
          _balanceUpdateController.add({'balances': response});
        }
      } catch (e) {
        if (kDebugMode) {
          debugPrint('Polling error: ${e.runtimeType}');
        }
      }
    });
  }

  /// Disconnect WebSocket
  Future<void> disconnect() async {
    _isConnected = false;
    _isDisposed = true;
    _reconnectTimer?.cancel();
    _pollingTimer?.cancel();
    _expiryTimer?.cancel();
    await _channel?.sink.close();
    _connectionStateController.add(false);
  }

  /// Clean up resources
  void dispose() {
    _isDisposed = true;
    _reconnectTimer?.cancel();
    _pollingTimer?.cancel();
    _expiryTimer?.cancel();
    _channel?.sink.close();
    _balanceUpdateController.close();
    _transactionUpdateController.close();
    _connectionStateController.close();
  }
}
