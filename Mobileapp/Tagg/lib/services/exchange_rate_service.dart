import 'dart:convert';
import 'package:Tagg/ui/common/api_constants.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ExchangeRateService {
  static const String _rateKey = 'ngn_rate';
  static const String _timestampKey = 'ngn_rate_timestamp';
  static const Duration _cacheTtl = Duration(minutes: 15);
  static const double _fallbackRate = 1600;

  double _cachedRate = _fallbackRate;
  DateTime? _lastFetched;

  Future<double> getNgnRate() async {
    // Check if cached rate is still valid
    if (_isCacheValid()) {
      return _cachedRate;
    }

    try {
      final response = await http.get(
        Uri.parse('${ApiConstants.apiUrl}/api/rates/ngn'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final rate = (data['NGN'] ?? _fallbackRate).toDouble();

        // Cache the rate
        await _cacheRate(rate);
        _cachedRate = rate;
        _lastFetched = DateTime.now();

        return rate;
      }
    } catch (e) {
      print('Error fetching exchange rate: $e');
    }

    // Return cached or fallback rate
    return _cachedRate;
  }

  bool _isCacheValid() {
    if (_lastFetched == null) {
      return false;
    }
    return DateTime.now().difference(_lastFetched!).compareTo(_cacheTtl) < 0;
  }

  Future<void> _cacheRate(double rate) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setDouble(_rateKey, rate);
      await prefs.setInt(_timestampKey, DateTime.now().millisecondsSinceEpoch);
    } catch (e) {
      print('Error caching exchange rate: $e');
    }
  }

  Future<void> loadCachedRate() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final rate = prefs.getDouble(_rateKey);
      final timestamp = prefs.getInt(_timestampKey);

      if (rate != null && timestamp != null) {
        _cachedRate = rate;
        _lastFetched = DateTime.fromMillisecondsSinceEpoch(timestamp);
      }
    } catch (e) {
      print('Error loading cached exchange rate: $e');
    }
  }

  DateTime? get lastUpdated => _lastFetched;
}
