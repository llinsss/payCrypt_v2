import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/services/onboarding_service.dart';

/// A single onboarding carousel slide.
class OnboardingSlide {
  final String title;
  final String description;
  final String emoji;
  const OnboardingSlide({
    required this.title,
    required this.description,
    required this.emoji,
  });
}

class OnboardingViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();

  final PageController pageController = PageController();

  int _currentPage = 0;
  int get currentPage => _currentPage;

  /// After the carousel, we show a "Fund your wallet" prompt with a QR shortcut.
  bool _showFundPrompt = false;
  bool get showFundPrompt => _showFundPrompt;

  final List<OnboardingSlide> slides = const [
    OnboardingSlide(
      emoji: '👋',
      title: 'Welcome to Tagged',
      description:
          'Seamless crypto payments for Africa — send and receive value in seconds.',
    ),
    OnboardingSlide(
      emoji: '🏷️',
      title: 'Pay with @tags',
      description:
          'Forget long wallet addresses. Send to a simple @tag, just like a username.',
    ),
    OnboardingSlide(
      emoji: '🔗',
      title: 'Multi-chain by default',
      description:
          'Base, Lisk, U2U, Starknet, Stellar and Flow — all from one wallet.',
    ),
    OnboardingSlide(
      emoji: '🚀',
      title: 'Get started',
      description:
          'Create your account and make your first payment in minutes.',
    ),
  ];

  bool get isLastPage => _currentPage == slides.length - 1;

  void onPageChanged(int index) {
    _currentPage = index;
    notifyListeners();
  }

  /// Advance to the next slide, or reveal the fund-wallet prompt after the last.
  void next() {
    if (isLastPage) {
      _showFundPrompt = true;
      notifyListeners();
      return;
    }
    pageController.nextPage(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  /// Skip button — available on every slide.
  Future<void> skip() => _finishOnboarding();

  /// The QR / "Fund your wallet" shortcut on the post-carousel prompt.
  Future<void> fundWallet() => _finishOnboarding();

  /// Dismiss the prompt and continue into the app.
  Future<void> continueToApp() => _finishOnboarding();

  Future<void> _finishOnboarding() async {
    await OnboardingService.completeOnboarding();
    // First launch is pre-auth, so route to sign-in; the wallet QR/funding flow
    // lives in the app (Deposit view) and is highlighted by the dashboard
    // coach marks on first visit.
    await _navigationService.replaceWithSigninView();
  }

  @override
  void dispose() {
    pageController.dispose();
    super.dispose();
  }
}
