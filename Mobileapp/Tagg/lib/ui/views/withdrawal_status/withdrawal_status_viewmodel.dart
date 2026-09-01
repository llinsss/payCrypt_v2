import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/services/user_service.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class WithdrawalStatusViewModel extends BaseViewModel {
  final _userService = locator<UserService>();
  final _navigationService = locator<NavigationService>();

  Map<String, dynamic>? _withdrawal;
  String _status = 'pending';
  bool _isTerminalState = false;
  bool _isFailed = false;

  Map<String, dynamic>? get withdrawal => _withdrawal;
  String get status => _status;
  bool get isTerminalState => _isTerminalState;
  bool get isFailed => _isFailed;
  String get failureMessage => _withdrawal?['status_message']?.toString() ?? 'The transfer could not be completed.';
  String get bankName => _withdrawal?['bank_name']?.toString() ?? 'Bank account';
  String get amount => _withdrawal?['amount_fiat']?.toString() ?? '0';
  String get reference => _withdrawal?['provider_reference']?.toString() ?? 'N/A';
  int get currentStepIndex {
    switch (_status.toLowerCase()) {
      case 'pending':
        return 0;
      case 'processing':
        return 1;
      case 'completed':
        return 3;
      default:
        return 0;
    }
  }

  Future<void> initialize() async {
    final args = _navigationService.currentArguments;
    if (args is Map<String, dynamic> && args.containsKey('withdrawalId')) {
      await refreshStatus(args['withdrawalId'] as int);
    }
  }

  Future<void> refreshStatus(int withdrawalId) async {
    try {
      final data = await _userService.getWithdrawalStatus(withdrawalId);
      _withdrawal = data;
      _status = data['status']?.toString() ?? 'pending';
      _isTerminalState = _status.toLowerCase() == 'completed' || _status.toLowerCase() == 'failed' || _status.toLowerCase() == 'reversed';
      _isFailed = _status.toLowerCase() == 'failed' || _status.toLowerCase() == 'reversed';
      notifyListeners();
    } catch (e) {
      _status = 'failed';
      _isFailed = true;
      _isTerminalState = true;
      notifyListeners();
    }
  }

  Future<void> retry() async {
    _navigationService.back();
  }
}
