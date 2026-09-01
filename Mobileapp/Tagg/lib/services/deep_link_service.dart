import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'dart:async';

class DeepLinkData {
  final String? tag;
  final String? amount;
  final String? token;
  final String? memo;

  /// Deep link payloads originate from an untrusted external source
  /// (a shared link, a QR code, another app). Consumers must always
  /// present the prefilled payment intent to the user for confirmation
  /// before submitting it.
  final bool requiresConfirmation;

  DeepLinkData({
    this.tag,
    this.amount,
    this.token,
    this.memo,
    this.requiresConfirmation = true,
  });
}

/// Validation rules for values arriving via deep links. Kept centralized
/// so every entry point (cold start, stream) applies the same constraints.
class _DeepLinkValidator {
  static final RegExp _tagPattern = RegExp(r'^[a-zA-Z0-9_]{1,32}$');
  static final RegExp _tokenPattern = RegExp(r'^[A-Za-z0-9]{1,12}$');
  static const int _maxMemoLength = 28;
  static const int _maxAmountDecimals = 7;
  static const double _maxAmount = 1000000000;
  static const int _maxRawFieldLength = 64;

  static String? sanitizeTag(String? raw) {
    if (raw == null) return null;
    var tag = raw.trim();
    if (tag.startsWith('@')) tag = tag.substring(1);
    if (tag.isEmpty || tag.length > _maxRawFieldLength) return null;
    if (!_tagPattern.hasMatch(tag)) return null;
    return tag;
  }

  static String? sanitizeAmount(String? raw) {
    if (raw == null) return null;
    final value = raw.trim();
    if (value.isEmpty || value.length > _maxRawFieldLength) return null;

    final parsed = num.tryParse(value);
    if (parsed == null || !parsed.isFinite) return null;
    if (parsed <= 0 || parsed > _maxAmount) return null;

    final decimalIndex = value.indexOf('.');
    if (decimalIndex != -1) {
      final decimals = value.length - decimalIndex - 1;
      if (decimals > _maxAmountDecimals) return null;
    }

    return value;
  }

  static String? sanitizeToken(String? raw) {
    if (raw == null) return null;
    final token = raw.trim().toUpperCase();
    if (!_tokenPattern.hasMatch(token)) return null;
    return token;
  }

  static String? sanitizeMemo(String? raw) {
    if (raw == null) return null;
    final memo = raw.trim();
    if (memo.isEmpty) return null;
    if (memo.length > _maxMemoLength) return null;
    // Reject control characters (e.g. newlines) that could be used to
    // inject content into UI or logs downstream.
    if (memo.runes.any((r) => r < 0x20)) return null;
    return memo;
  }
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
        if (kDebugMode) {
          debugPrint('Deep link stream error: ${err.runtimeType}');
        }
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
      if (kDebugMode) {
        debugPrint('Error getting initial deep link: ${e.runtimeType}');
      }
    }
    return null;
  }

  /// Extract the raw `@tag` path segment for a supported payment link,
  /// regardless of whether the tag ended up in the URI's host or path
  /// component. For a custom-scheme URI such as `tagg://pay/@tag`, the
  /// authority parser treats `pay` as the host and `/@tag` as the path,
  /// so both layouts must be recognized.
  String? _extractRawTagSegment(Uri uri) {
    if (uri.host == 'pay' && uri.path.isNotEmpty) {
      return uri.path.replaceFirst('/', '');
    }
    if (uri.path.startsWith('/pay/')) {
      return uri.path.replaceFirst('/pay/', '');
    }
    return null;
  }

  /// Parse deep link URI and extract parameters
  DeepLinkData? _parseDeepLink(Uri uri) {
    try {
      if (kDebugMode) {
        debugPrint('Deep link received: scheme=${uri.scheme} host=${uri.host}');
      }

      final isWebLink = uri.host == 'taggedpay.xyz';
      final isCustomSchemeLink = uri.scheme == 'tagg';

      if (!isWebLink && !isCustomSchemeLink) {
        return null;
      }

      final rawTag = _extractRawTagSegment(uri);
      if (rawTag == null) return null;

      final tag = _DeepLinkValidator.sanitizeTag(rawTag);
      if (tag == null) return null;

      return DeepLinkData(
        tag: tag,
        amount: _DeepLinkValidator.sanitizeAmount(uri.queryParameters['amount']),
        token: _DeepLinkValidator.sanitizeToken(uri.queryParameters['token']),
        memo: _DeepLinkValidator.sanitizeMemo(uri.queryParameters['memo']),
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Error parsing deep link: ${e.runtimeType}');
      }
    }

    return null;
  }

  /// Dispose resources
  void dispose() {
    _deepLinkSubscription?.cancel();
  }
}
