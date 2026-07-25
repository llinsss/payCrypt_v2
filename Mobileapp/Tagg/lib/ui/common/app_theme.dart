import 'package:flutter/material.dart';

class AppTheme {
  // Light theme colors
  static const Color lightPrimary = Color(0xFF9600FF);
  static const Color lightPrimaryDark = Color(0xFF300151);
  static const Color lightBackground = Color(0xFFFFFFFF);
  static const Color lightSurface = Color(0xFFF5F5F5);
  static const Color lightText = Color(0xFF1A1B1E);
  static const Color lightSubtext = Color(0xFF474A54);

  // Dark theme colors
  static const Color darkPrimary = Color(0xFF9600FF);
  static const Color darkPrimaryDark = Color(0xFF300151);
  static const Color darkBackground = Color(0xFF090715);
  static const Color darkSurface = Color(0xFF1A1B1E);
  static const Color darkText = Color(0xFFE2E2E2);
  static const Color darkSubtext = Color(0xFF867EA5);

  // Shared colors (used in both themes)
  static const Color accentPurple = Color(0xFF674AA6);
  static const Color errorColor = Color(0xFFE53935);
  static const Color successColor = Color(0xFF43A047);
  static const Color warningColor = Color(0xFFFB8C00);

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: lightPrimary,
      scaffoldBackgroundColor: lightBackground,
      appBarTheme: const AppBarTheme(
        backgroundColor: lightBackground,
        foregroundColor: lightText,
        elevation: 0,
      ),
      colorScheme: ColorScheme.light(
        primary: lightPrimary,
        onPrimary: Colors.white,
        secondary: accentPurple,
        onSecondary: Colors.white,
        error: errorColor,
        onError: Colors.white,
        background: lightBackground,
        onBackground: lightText,
        surface: lightSurface,
        onSurface: lightText,
      ),
      textTheme: const TextTheme(
        displayLarge: TextStyle(color: lightText, fontWeight: FontWeight.bold),
        displayMedium: TextStyle(color: lightText, fontWeight: FontWeight.bold),
        displaySmall: TextStyle(color: lightText, fontWeight: FontWeight.bold),
        headlineLarge: TextStyle(color: lightText, fontWeight: FontWeight.bold),
        headlineMedium: TextStyle(color: lightText, fontWeight: FontWeight.w600),
        headlineSmall: TextStyle(color: lightText, fontWeight: FontWeight.w600),
        titleLarge: TextStyle(color: lightText, fontWeight: FontWeight.w500),
        titleMedium: TextStyle(color: lightText, fontWeight: FontWeight.w500),
        titleSmall: TextStyle(color: lightText, fontWeight: FontWeight.w500),
        bodyLarge: TextStyle(color: lightText),
        bodyMedium: TextStyle(color: lightText),
        bodySmall: TextStyle(color: lightSubtext),
        labelLarge: TextStyle(color: lightText, fontWeight: FontWeight.w500),
        labelMedium: TextStyle(color: lightText, fontWeight: FontWeight.w500),
        labelSmall: TextStyle(color: lightSubtext),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: lightSurface,
        hintStyle: const TextStyle(color: lightSubtext),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(48),
          borderSide: const BorderSide(color: Color(0xFFE3E3E3)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(48),
          borderSide: const BorderSide(color: Color(0xFFE3E3E3)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(48),
          borderSide: const BorderSide(color: lightPrimary, width: 2),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: lightPrimary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(48)),
        ),
      ),
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      primaryColor: darkPrimary,
      scaffoldBackgroundColor: darkBackground,
      appBarTheme: const AppBarTheme(
        backgroundColor: darkBackground,
        foregroundColor: darkText,
        elevation: 0,
      ),
      colorScheme: ColorScheme.dark(
        primary: darkPrimary,
        onPrimary: darkBackground,
        secondary: accentPurple,
        onSecondary: darkBackground,
        error: errorColor,
        onError: Colors.white,
        background: darkBackground,
        onBackground: darkText,
        surface: darkSurface,
        onSurface: darkText,
      ),
      textTheme: const TextTheme(
        displayLarge: TextStyle(color: darkText, fontWeight: FontWeight.bold),
        displayMedium: TextStyle(color: darkText, fontWeight: FontWeight.bold),
        displaySmall: TextStyle(color: darkText, fontWeight: FontWeight.bold),
        headlineLarge: TextStyle(color: darkText, fontWeight: FontWeight.bold),
        headlineMedium: TextStyle(color: darkText, fontWeight: FontWeight.w600),
        headlineSmall: TextStyle(color: darkText, fontWeight: FontWeight.w600),
        titleLarge: TextStyle(color: darkText, fontWeight: FontWeight.w500),
        titleMedium: TextStyle(color: darkText, fontWeight: FontWeight.w500),
        titleSmall: TextStyle(color: darkText, fontWeight: FontWeight.w500),
        bodyLarge: TextStyle(color: darkText),
        bodyMedium: TextStyle(color: darkText),
        bodySmall: TextStyle(color: darkSubtext),
        labelLarge: TextStyle(color: darkText, fontWeight: FontWeight.w500),
        labelMedium: TextStyle(color: darkText, fontWeight: FontWeight.w500),
        labelSmall: TextStyle(color: darkSubtext),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: darkSurface,
        hintStyle: const TextStyle(color: darkSubtext),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(48),
          borderSide: const BorderSide(color: Color(0xFF262140)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(48),
          borderSide: const BorderSide(color: Color(0xFF262140)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(48),
          borderSide: const BorderSide(color: darkPrimary, width: 2),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: darkPrimary,
          foregroundColor: darkBackground,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(48)),
        ),
      ),
    );
  }
}
