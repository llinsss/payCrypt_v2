import 'package:Tagg/app/app.dialogs.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class SwapViewModel extends BaseViewModel {
  // Create a static instance to ensure we use the same one everywhere
  final _dialogService = locator<DialogService>();
  final TextEditingController slippageController = TextEditingController();

  double _slippageValue = 0.5;
  String _selectedFromToken = "STRK";
  String _selectedToToken = "Select Token";

  // Getters
  double get slippageValue => _slippageValue;
  String get selectedFromToken => _selectedFromToken;
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
    // TODO: Implement swap logic
    print(
        "Swapping $_selectedFromToken → $_selectedToToken with slippage $_slippageValue%");
  }
}
