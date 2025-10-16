import 'package:stacked/stacked.dart';
import 'package:Tagg/ui/common/app_assets.dart';

class MultiCurrencyViewModel extends BaseViewModel {
  String _portfolioValue = '0.00';
  String get portfolioValue => _portfolioValue;

  List<Map<String, dynamic>> _recentConversions = [];
  List<Map<String, dynamic>> get recentConversions => _recentConversions;

  void initialize() {
    _loadRecentConversions();
    notifyListeners();
  }

  void _loadRecentConversions() {
    _recentConversions = [
      {
        'fromIcon': AppAssets.strk,
        'toAmount': '0.5 STRK',
        'fromAmount': 'Amount',
        'rate': '₦1,960,000',
        'date': '2 hours ago',
        'isLast': false,
      },
      {
        'fromIcon': AppAssets.lsk,
        'toAmount': '0.5 LSK',
        'fromAmount': 'Amount',
        'rate': '₦1,960,000',
        'date': '2 hours ago',
        'isLast': false,
      },
      {
        'fromIcon': AppAssets.base,
        'toAmount': '0.5 BASE',
        'fromAmount': 'Amount',
        'rate': '₦1,960,000',
        'date': '2 hours ago',
        'isLast': true,
      },
    ];
  }

  void openMenu() {
    // Handle menu opening
  }

  void withdraw() {
    // Handle withdraw action
  }

  void deposit() {
    // Handle deposit action
  }

  void refresh() {
    // Handle refresh action
    initialize();
  }

  void quickSwap() {
    // Handle quick swap action
  }

  void lockToNGN() {
    // Handle lock to NGN action
  }

  void openAutoConvertSettings() {
    // Handle auto-convert settings
  }
}
