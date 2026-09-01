import 'package:flutter/material.dart';

/// Accessibility helpers for semantic labeling and WCAG AA compliance
class AccessibilityHelpers {
  /// Wraps an icon button with semantic label and minimum 48×48dp tap target
  static Widget semanticIconButton({
    required String semanticLabel,
    required IconData icon,
    required VoidCallback onPressed,
    Color? color,
    double size = 24,
    EdgeInsets padding = const EdgeInsets.all(12),
  }) {
    return Semantics(
      button: true,
      label: semanticLabel,
      onTap: onPressed,
      enabled: true,
      child: GestureDetector(
        onTap: onPressed,
        child: Container(
          padding: padding,
          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
          child: Icon(icon, color: color, size: size),
        ),
      ),
    );
  }

  /// Wraps content with merged semantics for better screen reader experience
  /// Used for complex widgets like balance cards that should be read as a unit
  static Widget mergedSemantics({
    required String label,
    required Widget child,
  }) {
    return Semantics(
      label: label,
      child: MergeSemantics(
        child: child,
      ),
    );
  }

  /// Marks a widget as decorative (screen reader will ignore it)
  static Widget decorative({
    required Widget child,
  }) {
    return Semantics(
      image: true,
      label: '',
      child: ExcludeSemantics(child: child),
    );
  }

  /// WCAG AA color contrast ratio: 4.5:1 for normal text, 3:1 for large text
  /// This helper validates if a text/background pair meets WCAG AA standards
  static double getContrastRatio(Color foreground, Color background) {
    // Calculate relative luminance according to WCAG formula
    final fgLum = _getRelativeLuminance(foreground);
    final bgLum = _getRelativeLuminance(background);

    final lighter = fgLum > bgLum ? fgLum : bgLum;
    final darker = fgLum > bgLum ? bgLum : fgLum;

    return (lighter + 0.05) / (darker + 0.05);
  }

  static double _getRelativeLuminance(Color color) {
    final r = color.red / 255.0;
    final g = color.green / 255.0;
    final b = color.blue / 255.0;

    final rsRGB = r <= 0.03928 ? r / 12.92 : ((r + 0.055) / 1.055).pow(2.4).toDouble();
    final gsRGB = g <= 0.03928 ? g / 12.92 : ((g + 0.055) / 1.055).pow(2.4).toDouble();
    final bsRGB = b <= 0.03928 ? b / 12.92 : ((b + 0.055) / 1.055).pow(2.4).toDouble();

    return 0.2126 * rsRGB + 0.7152 * gsRGB + 0.0722 * bsRGB;
  }

  /// Validates if contrast ratio meets WCAG AA standards
  /// normalText = true checks for 4.5:1, false checks for 3:1 (large text)
  static bool meetsWCAGAA(double contrastRatio, {bool normalText = true}) {
    return normalText ? contrastRatio >= 4.5 : contrastRatio >= 3.0;
  }
}
