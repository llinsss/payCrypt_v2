import 'package:shared_preferences/shared_preferences.dart';

/// Persists first-launch onboarding state (issue #451).
///
/// Kept as a lightweight static helper backed by [SharedPreferences] so it can
/// be used from both the startup flow and the dashboard without needing to be
/// registered in the Stacked locator.
class OnboardingService {
  OnboardingService._();

  static const String _onboardingCompleteKey = 'onboardingComplete';
  static const String _coachMarksSeenKey = 'coachMarksSeen';

  /// Whether the user has finished (or skipped) the onboarding carousel.
  static Future<bool> isOnboardingComplete() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_onboardingCompleteKey) ?? false;
  }

  /// Mark the onboarding carousel as complete so it is never shown again.
  static Future<void> completeOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_onboardingCompleteKey, true);
  }

  /// Whether the first-visit dashboard coach marks have been shown.
  static Future<bool> hasSeenCoachMarks() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_coachMarksSeenKey) ?? false;
  }

  /// Mark the dashboard coach marks as seen.
  static Future<void> markCoachMarksSeen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_coachMarksSeenKey, true);
  }

  /// Test/QA helper to reset onboarding state.
  static Future<void> reset() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_onboardingCompleteKey);
    await prefs.remove(_coachMarksSeenKey);
  }
}
