import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum ThemeMode { light, dark, system }

class ThemeService {
  static const String _themeModeKey = 'theme_mode';

  late SharedPreferences _prefs;
  ThemeMode _themeMode = ThemeMode.system;

  bool get isDarkMode {
    if (_themeMode == ThemeMode.system) {
      // Will be determined by platform at runtime
      return false;
    }
    return _themeMode == ThemeMode.dark;
  }

  ThemeMode get themeMode => _themeMode;

  // Initialize the theme service with stored preference
  Future<void> initialize() async {
    _prefs = await SharedPreferences.getInstance();
    final savedMode = _prefs.getString(_themeModeKey);

    if (savedMode != null) {
      _themeMode = ThemeMode.values.firstWhere(
        (mode) => mode.toString() == 'ThemeMode.$savedMode',
        orElse: () => ThemeMode.system,
      );
    }
  }

  // Set theme mode and persist to storage
  Future<void> setThemeMode(ThemeMode mode) async {
    _themeMode = mode;
    final modeString = mode.toString().split('.').last;
    await _prefs.setString(_themeModeKey, modeString);
  }

  // Get brightness based on system and theme preference
  Brightness getBrightness(Brightness systemBrightness) {
    if (_themeMode == ThemeMode.system) {
      return systemBrightness;
    }
    return _themeMode == ThemeMode.dark ? Brightness.dark : Brightness.light;
  }
}
