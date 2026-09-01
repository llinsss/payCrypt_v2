import 'dart:async';
import 'dart:convert';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/ui/common/api_constants.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class WebSocketService {
  final ApiService _apiService = locator<ApiService>();
  WebSocketChannel? _channel;
  Timer? _reconnectTimer;
  Timer? _pollingTimer;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 10;
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

      final token = await _getToken();
      if (token == null) return;

      final wsUrl = ApiConstants.baseUrl
          .replaceFirst('https://', 'wss://')
          .replaceFirst('http://', 'ws://');

      _channel = WebSocketChannel.connect(
        Uri.parse('$wsUrl?token=$token'),
      );

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
          print('WebSocket error: $error');
          _isConnected = false;
          _connectionStateController.add(false);
          _scheduleReconnect();
        },
      );

      _isConnected = true;
      _reconnectAttempts = 0;
      _connectionStateController.add(true);
      print('WebSocket connected successfully');
    } catch (e) {
      print('WebSocket connection failed: $e');
      _scheduleReconnect();
      _startPollingFallback();
    }
  }

  /// Handle incoming WebSocket messages
  void _handleMessage(dynamic data) {
    try {
      final message = json.decode(data as String);
      final event = message['event'] as String?;
      final payload = message['data'] as Map<String, dynamic>?;

      if (event == null || payload == null) return;

      switch (event) {
        case 'balance_updated':
          _balanceUpdateController.add(payload);
          break;
        case 'transaction:update':
          _transactionUpdateController.add(payload);
          // Also emit balance update since transactions affect balance
          if (payload['balance'] != null) {
            _balanceUpdateController.add(payload['balance']);
          }
          break;
        default:
          print('Unknown event: $event');
      }
    } catch (e) {
      print('Error handling WebSocket message: $e');
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
      print('WebSocket reconnecting (attempt $_reconnectAttempts)...');
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
        print('Polling error: $e');
      }
    });
  }

  /// Disconnect WebSocket
  Future<void> disconnect() async {
    _isConnected = false;
    _isDisposed = true;
    _reconnectTimer?.cancel();
    _pollingTimer?.cancel();
    await _channel?.sink.close();
    _connectionStateController.add(false);
  }

  Future<String?> _getToken() async {
    // Token is stored in ApiService
    return ''; // ApiService will handle via headers
  }

  /// Clean up resources
  void dispose() {
    _isDisposed = true;
    _reconnectTimer?.cancel();
    _pollingTimer?.cancel();
    _channel?.sink.close();
    _balanceUpdateController.close();
    _transactionUpdateController.close();
    _connectionStateController.close();
  }
}
