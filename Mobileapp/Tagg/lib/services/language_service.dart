import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LanguageService {
  static const String _localeKey = 'app_locale';
  static const String defaultLocale = 'en';

  static const List<String> supportedLocales = ['en', 'yo', 'ig'];
  static const Map<String, String> localeNames = {
    'en': 'English',
    'yo': 'Yoruba (Èdè Yorùbá)',
    'ig': 'Igbo (Igbo)',
  };

  Locale _currentLocale = const Locale(defaultLocale);
  Locale get currentLocale => _currentLocale;

  /// Get the current locale from storage
  Future<Locale> getSavedLocale() async {
    final prefs = await SharedPreferences.getInstance();
    final localeCode = prefs.getString(_localeKey) ?? defaultLocale;
    _currentLocale = Locale(localeCode);
    return _currentLocale;
  }

  /// Set and persist the locale
  Future<void> setLocale(String localeCode) async {
    if (!supportedLocales.contains(localeCode)) {
      localeCode = defaultLocale;
    }
    _currentLocale = Locale(localeCode);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_localeKey, localeCode);
  }

  /// Get the saved locale code
  Future<String> getSavedLocaleCode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_localeKey) ?? defaultLocale;
  }
}
