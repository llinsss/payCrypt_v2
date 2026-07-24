import 'package:Tagg/app/app.dialogs.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/services/connectivity_service.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class SwapViewModel extends BaseViewModel {
  // Create a static instance to ensure we use the same one everywhere
  final _dialogService = locator<DialogService>();
  final _connectivityService = locator<ConnectivityService>();
  final _connectivityService = locator<ConnectivityService>();
  final TextEditingController slippageController = TextEditingController();

  bool _isOffline = false;

  double _slippageValue = 0.5;
  String _selectedFromToken = "STRK";
  String _selectedToToken = "Select Token";

  // Getters
  void initialize() {
    _connectivityService.connectivityStream.listen((result) {
      _isOffline = result == ConnectivityResult.none;
      notifyListeners();
    });
  }

  double get slippageValue => _slippageValue;
  String get selectedFromToken => _selectedFromToken;
  bool get isOffline => _isOffline;
  String get selectedToToken => _selectedToToken;

  // Setters
  void setSlippage(double value) {
    _slippageValue = value;
    slippageController.text = value.toString();
    notifyListeners();
  }

  void updateSlippageFromText(String value) {
    final parsed = double.tryParse(value);
    if (parsed != null) {
      _slippageValue = parsed;
      notifyListeners();
    }
  }

  void setFromToken(String token) {
    _selectedFromToken = token;
    notifyListeners();
  }

  void setToToken(String token) {
    _selectedToToken = token;
    notifyListeners();
  }

  // Show token selection dialog for "From" token
  Future<void> showFromTokenDialog() async {
    final response = await _dialogService.showCustomDialog(
      variant: DialogType.token,
      title: 'Select From Token',
      description: 'Choose the token you want to swap from',
    );

    if (response?.confirmed == true && response?.data != null) {
      final tokenData = response!.data as Map<String, dynamic>;
      setFromToken(tokenData['token']);
    }
  }

  // Show token selection dialog for "To" token
  Future<void> showToTokenDialog() async {
    final response = await _dialogService.showCustomDialog(
      variant: DialogType.token,
      title: 'Select To Token',
      description: 'Choose the token you want to swap to',
    );

    if (response?.confirmed == true && response?.data != null) {
      final tokenData = response!.data as Map<String, dynamic>;
      setToToken(tokenData['token']);
    }
  }

  void performSwap() {
    if (_isOffline) {
      print('Offline: swap blocked');
      return;
    }
    // TODO: Implement swap logic
    print(
        "Swapping $_selectedFromToken → $_selectedToToken with slippage $_slippageValue%");
  }
}
import 'package:Tagg/app/app.dialogs.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/services/swap_service.dart';
import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class SwapViewModel extends BaseViewModel {
  // Create a static instance to ensure we use the same one everywhere
  final _dialogService = locator<DialogService>();
  final _swapService = locator<SwapService>();
  final TextEditingController slippageController = TextEditingController();
  final TextEditingController amountController = TextEditingController();

  double _slippageValue = 0.5;
  String _selectedFromToken = "STRK";
  String _selectedToToken = "Select Token";
  String _amount = "0";
  String _expectedOutput = "0.00";
  String _errorMessage = "";
  bool _isQuoting = false;
  bool _isSwapping = false;
  SwapQuote? _currentQuote;
  SwapResult? _lastSwapResult;

  // Getters
  double get slippageValue => _slippageValue;
  String get selectedFromToken => _selectedFromToken;
  String get selectedToToken => _selectedToToken;
  String get amount => _amount;
  String get expectedOutput => _expectedOutput;
  String get errorMessage => _errorMessage;
  bool get isQuoting => _isQuoting;
  bool get isSwapping => _isSwapping;
  SwapQuote? get currentQuote => _currentQuote;
  SwapResult? get lastSwapResult => _lastSwapResult;

  // Setters
  void setSlippage(double value) {
    _slippageValue = value;
    slippageController.text = value.toString();
    notifyListeners();
  }

  void updateSlippageFromText(String value) {
    final parsed = double.tryParse(value);
    if (parsed != null && parsed >= 0.01 && parsed <= 50) {
      _slippageValue = parsed;
      notifyListeners();
    }
  }

  void setFromToken(String token) {
    _selectedFromToken = token;
    notifyListeners();
  }

  void setToToken(String token) {
    _selectedToToken = token;
    notifyListeners();
  }

  void setAmount(String value) {
    _amount = value;
    notifyListeners();
  }

  void clearError() {
    _errorMessage = "";
    notifyListeners();
  }

  // Show token selection dialog for "From" token
  Future<void> showFromTokenDialog() async {
    final response = await _dialogService.showCustomDialog(
      variant: DialogType.token,
      title: 'Select From Token',
      description: 'Choose the token you want to swap from',
    );

    if (response?.confirmed == true && response?.data != null) {
      final tokenData = response!.data as Map<String, dynamic>;
      setFromToken(tokenData['token']);
    }
  }

  // Show token selection dialog for "To" token
  Future<void> showToTokenDialog() async {
    final response = await _dialogService.showCustomDialog(
      variant: DialogType.token,
      title: 'Select To Token',
      description: 'Choose the token you want to swap to',
    );

    if (response?.confirmed == true && response?.data != null) {
      final tokenData = response!.data as Map<String, dynamic>;
      setToToken(tokenData['token']);
    }
  }

  /// Get a swap quote from the backend (step 1 of two-step flow).
  /// Called before confirming a swap to show the user the expected output.
  Future<void> fetchQuote({String? amountStr}) async {
    clearError();

    final amountToUse = amountStr ?? _amount;
    final parsedAmount = double.tryParse(amountToUse);

    if (parsedAmount == null || parsedAmount <= 0) {
      _errorMessage = "Please enter a valid amount";
      notifyListeners();
      return;
    }

    if (_selectedToToken == "Select Token" || _selectedToToken.isEmpty) {
      _errorMessage = "Please select a token to swap to";
      notifyListeners();
      return;
    }

    if (_selectedFromToken == _selectedToToken) {
      _errorMessage = "From and to tokens must be different";
      notifyListeners();
      return;
    }

    _isQuoting = true;
    notifyListeners();

    try {
      // Default to chain ID 1 (Starknet) since the UI doesn't currently
      // expose chain selection. This can be extended later.
      final quote = await _swapService.getQuote(
        fromToken: _selectedFromToken,
        toToken: _selectedToToken,
        amount: parsedAmount,
        chainId: 1,
        slippage: _slippageValue,
      );

      _currentQuote = quote;
      _expectedOutput = double.parse(quote.expectedOutput).toStringAsFixed(6);
      print("✅ Quote received: ${quote.expectedOutput} ${quote.toToken}");
    } catch (e) {
      _errorMessage = "Failed to get quote: ${e.toString()}";
      _expectedOutput = "0.00";
      print("❌ Quote error: $e");
    } finally {
      _isQuoting = false;
      notifyListeners();
    }
  }

  /// Execute the swap (step 2 of two-step flow).
  /// Uses the two-step flow: first gets a quote, then confirms it.
  ///
  /// If a quote is already available and fresh, it will use it directly.
  /// Otherwise, it will fetch a new quote first.
  Future<void> performSwap() async {
    clearError();

    final parsedAmount = double.tryParse(_amount);
    if (parsedAmount == null || parsedAmount <= 0) {
      _errorMessage = "Please enter a valid amount";
      notifyListeners();
      return;
    }

    if (_selectedToToken == "Select Token" || _selectedToToken.isEmpty) {
      _errorMessage = "Please select a token to swap to";
      notifyListeners();
      return;
    }

    if (_selectedFromToken == _selectedToToken) {
      _errorMessage = "From and to tokens must be different";
      notifyListeners();
      return;
    }

    _isSwapping = true;
    notifyListeners();

    try {
      // Check if we have a fresh quote to use
      if (_currentQuote != null &&
          _currentQuote!.fromToken == _selectedFromToken &&
          _currentQuote!.toToken == _selectedToToken &&
          double.tryParse(_currentQuote!.amount) == parsedAmount) {
        // Use existing quote to confirm
        print("🔄 Using existing quote to confirm swap...");
        final result = await _swapService.confirmSwap(
          quoteId: _currentQuote!.quoteId,
          fromToken: _selectedFromToken,
          toToken: _selectedToToken,
          amount: parsedAmount,
          chainId: 1,
        );

        _lastSwapResult = result;
        _currentQuote = null; // Clear used quote
        print(
            "✅ Swap completed! ${result.outputAmount} ${result.toToken} (tx: ${result.txHash})");
      } else {
        // No valid quote, execute in one step
        print("🔄 Executing swap with fresh quote...");
        final result = await _swapService.executeSwap(
          fromToken: _selectedFromToken,
          toToken: _selectedToToken,
          amount: parsedAmount,
          chainId: 1,
          slippage: _slippageValue,
          confirm: true,
        );

        if (result is SwapResult) {
          _lastSwapResult = result;
          print(
              "✅ Swap completed! ${result.outputAmount} ${result.toToken} (tx: ${result.txHash})");
        }
      }
    } catch (e) {
      _errorMessage = "Swap failed: ${e.toString()}";
      print("❌ Swap error: $e");
    } finally {
      _isSwapping = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    slippageController.dispose();
    amountController.dispose();
    super.dispose();
  }
}
