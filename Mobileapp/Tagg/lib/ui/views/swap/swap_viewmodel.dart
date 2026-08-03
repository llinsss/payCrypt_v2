import 'package:Tagg/app/app.dialogs.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/services/connectivity_service.dart';
import 'package:Tagg/services/swap_service.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class SwapViewModel extends BaseViewModel {
  final _dialogService = locator<DialogService>();
  final _connectivityService = locator<ConnectivityService>();
  final _swapService = locator<SwapService>();

  final TextEditingController amountController = TextEditingController();
  final TextEditingController slippageController = TextEditingController();

  static const Map<String, String> _tokenChainMap = {
    'STRK': 'STRK',
    'LSK': 'LSK',
    'BASE': 'BASE',
    'FLOW': 'FLOW',
    'U2U': 'U2U',
  };

  bool _isOffline = false;
  double _slippageValue = 0.5;
  String _selectedFromToken = 'STRK';
  String _selectedToToken = 'Select Token';
  String _estimatedToAmount = '0.00';
  String? _lastTxHash;
  String? _statusMessage;

  void initialize() {
    slippageController.text = _slippageValue.toString();
    _connectivityService.connectivityStream.listen((result) {
      _isOffline = result == ConnectivityResult.none;
      notifyListeners();
    });
  }

  double get slippageValue => _slippageValue;
  String get selectedFromToken => _selectedFromToken;
  bool get isOffline => _isOffline;
  String get selectedToToken => _selectedToToken;
  String get estimatedToAmount => _estimatedToAmount;
  String? get lastTxHash => _lastTxHash;
  String? get statusMessage => _statusMessage;

  void setSlippage(double value) {
    _slippageValue = value;
    slippageController.text = value.toString();
    notifyListeners();
  }

  void updateSlippageFromText(String value) {
    final parsed = double.tryParse(value);
    if (parsed != null && parsed >= 0) {
      _slippageValue = parsed;
      notifyListeners();
    }
  }

  void onAmountChanged(String value) {
    _estimatedToAmount = '0.00';
    _statusMessage = null;
    notifyListeners();
  }

  void setFromToken(String token) {
    _selectedFromToken = token;
    _estimatedToAmount = '0.00';
    _statusMessage = null;
    notifyListeners();
  }

  void setToToken(String token) {
    _selectedToToken = token;
    _estimatedToAmount = '0.00';
    _statusMessage = null;
    notifyListeners();
  }

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

  Future<void> performSwap() async {
    if (_isOffline) {
      await _showInfo('Offline', 'Reconnect to the internet before swapping.');
      return;
    }

    final validationError = _validateSwapInput();
    if (validationError != null) {
      await _showInfo('Swap unavailable', validationError);
      return;
    }

    final amount = amountController.text.trim();
    final chainId = _tokenChainMap[_selectedFromToken]!;

    setBusy(true);
    _statusMessage = 'Getting quote...';
    notifyListeners();

    try {
      final quote = await _swapService.getQuote(
        fromToken: _selectedFromToken,
        toToken: _selectedToToken,
        amount: amount,
        chainId: chainId,
        slippagePercent: _slippageValue,
      );

      _estimatedToAmount = quote.amountOut;
      _statusMessage = 'Quote ready';
      notifyListeners();

      await _dialogService.showCustomDialog(
        variant: DialogType.infoAlert,
        title: 'Confirm swap quote',
        description:
            '$amount ${quote.fromToken} ≈ ${quote.amountOut} ${quote.toToken}. Minimum received: ${quote.minAmountOut}. Tap Got it to confirm.',
      );

      _statusMessage = 'Executing swap...';
      notifyListeners();

      final result = await _swapService.confirmSwap(quote.quoteId);
      _lastTxHash = result.txHash;
      _statusMessage = 'Swap completed';
      notifyListeners();

      await _showInfo(
        'Swap completed',
        "Your swap was completed successfully.${result.txHash.isNotEmpty ? ' Tx: ${result.txHash}' : ''}",
      );
    } catch (e) {
      _statusMessage = 'Swap failed';
      notifyListeners();
      await _showInfo('Swap failed', e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setBusy(false);
    }
  }

  String? _validateSwapInput() {
    if (!_tokenChainMap.containsKey(_selectedFromToken)) {
      return 'Only supported crypto tokens can be swapped from this screen.';
    }
    if (!_tokenChainMap.containsKey(_selectedToToken)) {
      return 'Select a supported crypto token to receive.';
    }
    if (_selectedFromToken == _selectedToToken) {
      return 'Choose two different tokens.';
    }

    final amount = double.tryParse(amountController.text.trim());
    if (amount == null || amount <= 0) {
      return 'Enter an amount greater than 0.';
    }

    if (_slippageValue < 0 || _slippageValue > 50) {
      return 'Slippage must be between 0% and 50%.';
    }

    return null;
  }

  Future<void> _showInfo(String title, String description) async {
    await _dialogService.showCustomDialog(
      variant: DialogType.infoAlert,
      title: title,
      description: description,
    );
  }

  @override
  void dispose() {
    amountController.dispose();
    slippageController.dispose();
    super.dispose();
  }
}
