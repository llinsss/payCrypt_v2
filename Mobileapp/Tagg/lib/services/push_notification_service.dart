import 'dart:convert';
import 'dart:io' show Platform;
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';

const String _pendingPayloadKey = 'pending_notification_payload';

@pragma('vm:entry-point')
Future<void> fcmBackgroundMessageHandler(RemoteMessage message) async {
  final data = message.data;
  final notification = message.notification;

  await _savePendingPayloadStatic(data);

  if (notification != null) {
    final localNotifications = FlutterLocalNotificationsPlugin();
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings();
    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );
    await localNotifications.initialize(initSettings);

    await localNotifications.show(
      data['transaction_id']?.hashCode ??
          DateTime.now().millisecondsSinceEpoch,
      notification.title ?? '',
      notification.body ?? '',
      const NotificationDetails(
        android: AndroidNotificationDetails('default', 'Notifications',
            channelDescription: 'Default notification channel',
            importance: Importance.high,
            priority: Priority.high),
        iOS: DarwinNotificationDetails(),
      ),
      payload: json.encode(data),
    );
  }
}

Future<void> _savePendingPayloadStatic(Map<String, dynamic> data) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_pendingPayloadKey, json.encode(data));
}

class PushNotificationService {
  static final PushNotificationService _instance = PushNotificationService._();
  factory PushNotificationService() => _instance;
  PushNotificationService._();

  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  String? _currentToken;
  bool _initialized = false;

  static const String _tokenKey = 'fcm_token';

  Map<String, dynamic>? _pendingNotificationData;

  Future<void> initialize({required ApiService apiService}) async {
    if (_initialized) return;

    await _setupLocalNotifications();
    await _requestPermission();

    FirebaseMessaging.onBackgroundMessage(fcmBackgroundMessageHandler);

    await _refreshToken(apiService: apiService);
    _setupTokenRefreshHandler(apiService: apiService);

    _initialized = true;
  }

  Future<void> _setupLocalNotifications() async {
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTap,
    );
  }

  Future<void> _requestPermission() async {
    final settings = await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {
      print('FCM permission granted');
    } else {
      print('FCM permission denied');
    }
  }

  Future<void> _refreshToken({required ApiService apiService}) async {
    try {
      final token = await _fcm.getToken();
      if (token != null && token != _currentToken) {
        _currentToken = token;
        await _saveTokenLocally(token);
        await _registerTokenWithBackend(token, apiService);
      }
    } catch (e) {
      print('Failed to get FCM token: $e');
    }

    _pendingNotificationData = await _loadPendingPayload();

    FirebaseMessaging.onMessage.listen(_onForegroundMessage);

    FirebaseMessaging.onMessageOpenedApp.listen(_onMessageOpenedApp);

    final initialMessage = await _fcm.getInitialMessage();
    if (initialMessage != null) {
      _handleNotificationData(initialMessage.data);
    }
  }

  void _setupTokenRefreshHandler({required ApiService apiService}) {
    _fcm.onTokenRefresh.listen((newToken) async {
      _currentToken = newToken;
      await _saveTokenLocally(newToken);
      await _registerTokenWithBackend(newToken, apiService);
    });
  }

  void _onForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    final data = message.data;

    if (notification != null) {
      _showLocalNotification(
        id: data['transaction_id']?.hashCode ??
            DateTime.now().millisecondsSinceEpoch,
        title: notification.title ?? '',
        body: notification.body ?? '',
        payload: json.encode(data),
      );
    }
  }

  void _onMessageOpenedApp(RemoteMessage message) {
    _handleNotificationData(message.data);
  }

  void _onNotificationTap(NotificationResponse response) {
    if (response.payload != null) {
      try {
        final data = json.decode(response.payload!) as Map<String, dynamic>;
        _handleNotificationData(data);
      } catch (e) {
        print('Failed to parse notification payload: $e');
      }
    }
  }

  void _handleNotificationData(Map<String, dynamic> data) {
    final transactionId = data['transaction_id'];
    if (transactionId != null) {
      _navigateToTransaction(transactionId);
      return;
    }

    final withdrawalId = data['withdrawal_id'];
    if (withdrawalId != null) {
      _navigateToTransaction(null, withdrawalId: withdrawalId);
      return;
    }
  }

  void _navigateToTransaction(String? transactionId,
      {String? withdrawalId}) {
    try {
      final args = <String, String>{};
      if (transactionId != null) args['transactionId'] = transactionId;
      if (withdrawalId != null) args['withdrawalId'] = withdrawalId;
    } catch (e) {
      print('Navigation error: $e');
    }
  }

  Future<void> _showLocalNotification({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    await _localNotifications.show(
      id,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'default',
          'Notifications',
          channelDescription: 'Default notification channel',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: payload,
    );
  }

  Future<void> _saveTokenLocally(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  Future<String?> getSavedToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  Future<Map<String, dynamic>?> _loadPendingPayload() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_pendingPayloadKey);
    if (raw == null) return null;
    try {
      final data = json.decode(raw) as Map<String, dynamic>;
      await prefs.remove(_pendingPayloadKey);
      return data;
    } catch (_) {
      return null;
    }
  }

  Future<void> _registerTokenWithBackend(
      String token, ApiService apiService) async {
    try {
      final platform = Platform.isAndroid ? 'android' : 'ios';
      await apiService.post(ApiConstants.deviceToken, {
        'token': token,
        'platform': platform,
      });
      print('FCM token registered with backend');
    } catch (e) {
      print('Failed to register FCM token with backend: $e');
    }
  }

  Future<void> unregisterToken({required ApiService apiService}) async {
    if (_currentToken == null) return;

    try {
      await apiService.post(ApiConstants.deviceToken, {
        'token': _currentToken,
        'unregister': true,
      });
      print('FCM token unregistered from backend');
    } catch (e) {
      print('Failed to unregister FCM token: $e');
    }
  }
}
