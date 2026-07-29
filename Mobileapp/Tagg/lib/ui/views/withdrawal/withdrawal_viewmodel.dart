import 'dart:async';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/models/user_token_balance.dart';
import 'package:Tagg/models/chains_models.dart';
import 'package:Tagg/services/user_service.dart';
import 'package:Tagg/services/wallet_service.dart';
import 'package:Tagg/services/chains_service.dart';
import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class WithdrawalViewModel extends BaseViewModel {
  final _walletService = locator<WalletService>();
  final _userService = locator<UserService>();
  final _chainsService = locator<ChainsService>();
  final _snackbarService = locator<SnackbarService>();
  final _navigationService = locator<NavigationService>();

  int selectedNavIndex = 1;
  int selectedWithdrawMethod = 0;

  // Form controllers
  final amountController = TextEditingController();
  final recipientTagController = TextEditingController();
  final walletAddressController = TextEditingController();
  final accountNumberController = TextEditingController();
  // Optional note attached to the transaction (issue #476)
  final notesController = TextEditingController();
  static const int maxNotesLength = 100;

  // User token balances
  List<UserTokenBalance> _tokenBalances = [];
  List<UserTokenBalance> get tokenBalances => _tokenBalances;

  // Chains
  List<Chain> _chains = [];
  List<Chain> get chains => _chains;

  // Selected balance for withdrawal
  UserTokenBalance? _selectedBalance;
  UserTokenBalance? get selectedBalance => _selectedBalance;

  String networkFee = "1%";
  String platformFee = "0.5%";

  // Fee calculation
  double _networkFeeAmount = 0.0;
  double _platformFeeAmount = 0.0;
  double _totalFeeAmount = 0.0;

  double get networkFeeAmount => _networkFeeAmount;
  double get platformFeeAmount => _platformFeeAmount;
  double get totalFeeAmount => _totalFeeAmount;

  Timer? _pollingTimer;
  Map<String, dynamic>? _withdrawal;
  Map<String, dynamic>? get withdrawal => _withdrawal;
  String _currentStep = 'submitted';
  String get currentStep => _currentStep;
  bool _isTerminalState = false;
  bool get isTerminalState => _isTerminalState;

  @override
  void dispose() {
    _pollingTimer?.cancel();
    amountController.dispose();
    recipientTagController.dispose();
    walletAddressController.dispose();
    accountNumberController.dispose();
    notesController.dispose();
    super.dispose();
  }

  /// Initialize amount controller listener for fee calculation
  void _setupAmountListener() {
    amountController.addListener(() {
      _calculateFees();
    });
  }

  // Dynamic tokens list from chains
  List<TokenData> get tokens {
    return _chains.map((chain) {
      // Map chain symbols to colors (you can customize this)
      Color color;
      switch (chain.symbol.toUpperCase()) {
        case 'STRK':
          color = const Color(0xFF29296E);
          break;
        case 'LSK':
          color = const Color(0xFF04183D);
          break;
        case 'BASE':
          color = const Color(0xFF0052FF);
          break;
        case 'FLOW':
          color = const Color(0xFF00EF8B);
          break;
        default:
          color = Colors.grey;
      }
      return TokenData(
        chain.name,
        chain.nativeCurrency.symbol,
        color,
      );
    }).toList();
  }

  final List<WithdrawalMethod> withdrawalMethods = [
    WithdrawalMethod(
      'Withdraw to Tag',
      'Send to another internal tag',
      AppAssets.balance, // <-- add this in AppAssets
    ),
    WithdrawalMethod(
      'Crypto Wallet',
      'Send to external wallet',
      AppAssets.balance, // <-- svg path
    ),
    WithdrawalMethod(
      'Bank Account (NGN)',
      'Convert to Naira via Paystack',
      AppAssets.balance, // <-- svg path
    ),
  ];

  /// Get dynamic fees list
  List<FeeItem> get fees {
    return [
      FeeItem(
          label: "Network Fee",
          amount: "\$${_networkFeeAmount.toStringAsFixed(2)}"),
      FeeItem(
          label: "Platform Fee",
          amount: "\$${_platformFeeAmount.toStringAsFixed(2)}"),
      FeeItem(
          label: "Total Charge",
          amount: "\$${_totalFeeAmount.toStringAsFixed(2)}"),
    ];
  }

  void setNavIndex(int index) {
    selectedNavIndex = index;
    notifyListeners();
  }

  void setWithdrawMethod(int index) {
    selectedWithdrawMethod = index;
    _calculateFees(); // Recalculate fees when method changes
    notifyListeners();
  }

  void continueWithdrawal() {
    debugPrint("Continue tapped with method $selectedWithdrawMethod");
  }

  void openStatusScreen(Map<String, dynamic> withdrawal) {
    _withdrawal = withdrawal;
    _currentStep = 'submitted';
    _isTerminalState = false;
    notifyListeners();
    _navigationService.navigateTo(Routes.withdrawalStatusView);
  }

  void startStatusPolling(int withdrawalId) {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 10), (_) async {
      try {
        final data = await _userService.getWithdrawalStatus(withdrawalId);
        _withdrawal = data;
        _updateStepFromStatus(data['status']?.toString() ?? 'pending');
        notifyListeners();
        if (_isTerminalState) {
          _pollingTimer?.cancel();
        }
      } catch (e) {
        debugPrint('Withdrawal status polling failed: $e');
      }
    });
  }

  void _updateStepFromStatus(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        _currentStep = 'submitted';
        _isTerminalState = false;
        break;
      case 'processing':
        _currentStep = 'processing';
        _isTerminalState = false;
        break;
      case 'completed':
        _currentStep = 'sent';
        _isTerminalState = true;
        break;
      case 'failed':
      case 'reversed':
        _currentStep = 'failed';
        _isTerminalState = true;
        break;
      default:
        _currentStep = 'submitted';
        _isTerminalState = false;
    }
  }

  /// Initialize and load user balances
  Future<void> initialize() async {
    _setupAmountListener();
    await loadChains();
    await loadBalances();
  }

  /// Load chains from API
  Future<void> loadChains() async {
    try {
      _chains = await _chainsService.getChains();
      print('✅ Chains loaded: ${_chains.length} chains');
      notifyListeners();
    } catch (e) {
      print('❌ Error loading chains: $e');
    }
  }

  /// Calculate withdrawal fees
  void _calculateFees() {
    final amount = double.tryParse(amountController.text) ?? 0.0;

    if (amount <= 0) {
      _networkFeeAmount = 0.0;
      _platformFeeAmount = 0.0;
      _totalFeeAmount = 0.0;
      notifyListeners();
      return;
    }

    // Calculate fees based on withdrawal method
    switch (selectedWithdrawMethod) {
      case 0: // Withdraw to Tag (internal transfer - lower fees)
        _networkFeeAmount = 0.0; // No network fee for internal transfers
        _platformFeeAmount = amount * 0.001; // 0.1% platform fee
        break;
      case 1: // Crypto Wallet (external transfer - higher fees)
        _networkFeeAmount = amount * 0.01; // 1% network fee
        _platformFeeAmount = amount * 0.005; // 0.5% platform fee
        break;
      case 2: // Bank Account (fiat conversion - highest fees)
        _networkFeeAmount = amount * 0.015; // 1.5% conversion fee
        _platformFeeAmount = amount * 0.01; // 1% platform fee
        break;
      default:
        _networkFeeAmount = 0.0;
        _platformFeeAmount = 0.0;
    }

    _totalFeeAmount = _networkFeeAmount + _platformFeeAmount;
    notifyListeners();
  }

  /// Load user token balances
  Future<void> loadBalances() async {
    setBusy(true);
    try {
      _tokenBalances = await _userService.getUserTokenBalances();
      if (_tokenBalances.isNotEmpty) {
        _selectedBalance = _tokenBalances.first;
      }
      notifyListeners();
    } catch (e) {
      print('Error loading balances: $e');
      _snackbarService.showSnackbar(
        message: 'Failed to load balances',
        duration: const Duration(seconds: 3),
      );
    } finally {
      setBusy(false);
    }
  }

  /// Set selected balance for withdrawal
  void setSelectedBalance(UserTokenBalance balance) {
    _selectedBalance = balance;
    notifyListeners();
  }

  /// Set amount to maximum available balance
  void setMaxAmount() {
    if (_selectedBalance != null) {
      amountController.text = _selectedBalance!.amount.toString();
      notifyListeners();
    }
  }

  /// Validate withdrawal form
  String? validateWithdrawal() {
    if (_selectedBalance == null) {
      return 'Please select a token to withdraw';
    }

    final amount = double.tryParse(amountController.text);
    if (amount == null || amount <= 0) {
      return 'Please enter a valid amount';
    }

    if (amount > _selectedBalance!.amount) {
      return 'Insufficient balance';
    }

    switch (selectedWithdrawMethod) {
      case 0: // Withdraw to Tag
        if (recipientTagController.text.trim().isEmpty) {
          return 'Please enter recipient tag';
        }
        break;
      case 1: // Crypto Wallet
        if (walletAddressController.text.trim().isEmpty) {
          return 'Please enter wallet address';
        }
        break;
      case 2: // Bank Account
        if (accountNumberController.text.trim().isEmpty) {
          return 'Please enter account number';
        }
        break;
    }

    return null;
  }

  /// Send withdrawal
  /// Send withdrawal with callbacks for success/error
  Future<void> send({
    required Function(String message) onSuccess,
    required Function(String message) onError,
  }) async {
    // Validate form
    final error = validateWithdrawal();
    if (error != null) {
      onError(error);
      return;
    }

    setBusy(true);
    try {
      switch (selectedWithdrawMethod) {
        case 0: // Withdraw to Tag
          await _withdrawToTag(onSuccess: onSuccess, onError: onError);
          break;
        case 1: // Crypto Wallet
          onError('Crypto wallet withdrawal coming soon');
          break;
        case 2: // Bank Account
          await _initiateBankWithdrawal(onSuccess: onSuccess, onError: onError);
          break;
      }
    } catch (e) {
      print('Error during withdrawal: $e');
      onError('Withdrawal failed: ${e.toString()}');
    } finally {
      setBusy(false);
    }
  }

  Future<void> _initiateBankWithdrawal({
    required Function(String message) onSuccess,
    required Function(String message) onError,
  }) async {
    final amount = amountController.text.trim();
    try {
      final response = await _walletService.initiateBankWithdrawal(
        tokenId: _selectedBalance!.tokenId,
        bankAccountId: 1,
        amountCrypto: double.parse(amount),
      );

      if (response is Map<String, dynamic> && response['data'] != null) {
        final id = response['data']['id'];
        if (id != null) {
          amountController.clear();
          accountNumberController.clear();
          startStatusPolling(id);
          _navigationService.navigateTo(Routes.withdrawalStatusView);
          return;
        }
      }

      onError('Withdrawal failed');
    } catch (e) {
      onError('Withdrawal failed: ${e.toString()}');
    }
  }

  /// Withdraw to tag implementation
  /// Withdraw to tag implementation with callbacks
  Future<void> _withdrawToTag({
    required Function(String message) onSuccess,
    required Function(String message) onError,
  }) async {
    final amount = amountController.text.trim();
    final receiverTag = recipientTagController.text.trim();
    final notes = notesController.text.trim();

    try {
      final response = await _walletService.withdrawToTag(
        balanceId: _selectedBalance!.id,
        amount: amount,
        receiverTag: receiverTag,
        notes: notes.isNotEmpty ? notes : null,
      );

      if (response.isSuccess) {
        // Clear form
        amountController.clear();
        recipientTagController.clear();
        notesController.clear();

        // Reload balances
        await loadBalances();

        // Show success dialog
        onSuccess('Transaction Successful');
      } else {
        onError('Transaction Failed');
      }
    } catch (e) {
      onError('Transaction Failed');
    }
  }
}

class FeeItem {
  final String label;
  final String amount;
  FeeItem({required this.label, required this.amount});
}

class TokenData {
  final String name;
  final String symbol;
  final Color color;
  TokenData(this.name, this.symbol, this.color);
}

class WithdrawalMethod {
  final String title;
  final String subtitle;
  final String assetPath;
  WithdrawalMethod(this.title, this.subtitle, this.assetPath);
}
