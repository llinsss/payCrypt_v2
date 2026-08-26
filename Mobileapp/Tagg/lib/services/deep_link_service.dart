import 'package:app_links/app_links.dart';
import 'dart:async';

class DeepLinkData {
  final String? tag;
  final String? amount;
  final String? token;
  final String? memo;

  DeepLinkData({
    this.tag,
    this.amount,
    this.token,
    this.memo,
  });
}

class DeepLinkService {
  final _appLinks = AppLinks();
  StreamSubscription? _deepLinkSubscription;

  /// Initialize deep link listening
  void initDeepLinks(Function(DeepLinkData) onDeepLink) {
    _deepLinkSubscription = _appLinks.uriLinkStream.listen(
      (uri) {
        final deepLinkData = _parseDeepLink(uri);
        if (deepLinkData != null) {
          onDeepLink(deepLinkData);
        }
      },
      onError: (err) {
        print('Deep link error: $err');
      },
    );
  }

  /// Get initial deep link if app was launched via deep link
  Future<DeepLinkData?> getInitialDeepLink() async {
    try {
      final deepLink = await _appLinks.getInitialAppLink();
      if (deepLink != null) {
        return _parseDeepLink(deepLink);
      }
    } catch (e) {
      print('Error getting initial deep link: $e');
    }
    return null;
  }

  /// Parse deep link URI and extract parameters
  DeepLinkData? _parseDeepLink(Uri uri) {
    try {
      print('Deep link received: ${uri.toString()}');

      // Handle taggedpay.xyz/pay/@tag format
      if (uri.host == 'taggedpay.xyz' && uri.path.startsWith('/pay/')) {
        final tag = uri.path.replaceFirst('/pay/', '').replaceFirst('@', '');
        if (tag.isNotEmpty) {
          return DeepLinkData(
            tag: tag,
            amount: uri.queryParameters['amount'],
            token: uri.queryParameters['token'],
            memo: uri.queryParameters['memo'],
          );
        }
      }

      // Handle custom scheme tagg://pay/@tag
      if (uri.scheme == 'tagg' && uri.path.startsWith('/pay/')) {
        final tag = uri.path.replaceFirst('/pay/', '').replaceFirst('@', '');
        if (tag.isNotEmpty) {
          return DeepLinkData(
            tag: tag,
            amount: uri.queryParameters['amount'],
            token: uri.queryParameters['token'],
            memo: uri.queryParameters['memo'],
          );
        }
      }
    } catch (e) {
      print('Error parsing deep link: $e');
    }

    return null;
  }

  /// Dispose resources
  void dispose() {
    _deepLinkSubscription?.cancel();
  }
}
