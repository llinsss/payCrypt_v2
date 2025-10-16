import 'package:stacked/stacked.dart';

class BottomnavViewModel extends BaseViewModel {
  int _currentIndex = 0;
  int _currentPageIndex = 0; // Track which page is currently shown
  bool _isMenuOpen = false;

  int get currentIndex => _currentIndex;
  int get currentPageIndex => _currentPageIndex;
  bool get isMenuOpen => _isMenuOpen;

  void setIndex(int index) {
    _currentIndex = index;

    // When switching between Dashboard and Settings, update the page index too
    if (index == 0) {
      _currentPageIndex = 0; // Dashboard
    } else if (index == 1) {
      _currentPageIndex = 1; // Settings
    }

    // Close menu when switching tabs
    _isMenuOpen = false;
    notifyListeners();
  }

  void toggleMenu() {
    _isMenuOpen = !_isMenuOpen;
    notifyListeners();
  }

  void navigateToPage(String pageName) {
    // Close the menu first
    _isMenuOpen = false;

    // Reset the bottom nav to neutral state (no tab selected for menu pages)
    _currentIndex = -1; // or you could keep it as 0 if you prefer

    // Set the page index based on the page name
    switch (pageName) {
      case 'bill_payments':
        _currentPageIndex = 2;
        break;
      case 'swap':
        _currentPageIndex = 3;
        break;
      case 'deposits':
        _currentPageIndex = 4;
        break;
      case 'withdrawal':
        _currentPageIndex = 5;
        break;
      case 'multicurrency':
        _currentPageIndex = 6;
        break;
      case 'pay_bills':
        _currentPageIndex = 7;
        break;
      default:
        _currentPageIndex = 0; // Default to dashboard
        _currentIndex = 0;
    }

    notifyListeners();
  }

  // Optional: Method to go back to dashboard from any page
  void goBackToDashboard() {
    _currentIndex = 0;
    _currentPageIndex = 0;
    _isMenuOpen = false;
    notifyListeners();
  }
}
