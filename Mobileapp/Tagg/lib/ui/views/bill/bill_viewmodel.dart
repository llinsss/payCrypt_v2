import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/services/api_service.dart';

enum PaybillService {
  electricity,
  internet,
  airtime,
  transport,
  rentUtilities,
}

class BillViewModel extends BaseViewModel {
  final _apiService = locator<ApiService>();

  String _selectedService = '';
  String _selectedProvider = '';
  String _firstFieldValue = '';
  String _secondFieldValue = '';
  final firstFieldController = TextEditingController();
  final secondFieldController = TextEditingController();

  String _errorMessage = '';
  String _successMessage = '';

  String get selectedService => _selectedService;
  String get selectedProvider => _selectedProvider;
  String get firstFieldValue => _firstFieldValue;
  String get secondFieldValue => _secondFieldValue;
  String get errorMessage => _errorMessage;
  String get successMessage => _successMessage;

  void selectService(String service) {
    _selectedService = service;
    _selectedProvider = ''; // Reset provider when service changes
    _firstFieldValue = '';
    _secondFieldValue = '';
    notifyListeners();
  }

  void selectProvider(String provider) {
    _selectedProvider = provider;
    notifyListeners();
  }

  void updateFirstField(String value) {
    _firstFieldValue = value;
    notifyListeners();
  }

  void updateSecondField(String value) {
    _secondFieldValue = value;
    notifyListeners();
  }

  List<String> getProvidersForService() {
    switch (_selectedService) {
      case 'Electricity':
        return ['AEDC', 'EEDC', 'IBEDC', 'KEDCO'];
      case 'Internet':
        return ['Airtel', 'Mtn', 'Glo', '9mobile', 'Spectranet'];
      case 'Airtime':
        return ['Airtel', 'Mtn', 'Glo', '9mobile'];
      case 'Transport':
        return ['Lagos BRT', 'Uber', 'Bolt', 'Keke NAPEP'];
      case 'Rent/Utilities':
        return ['Property Manager', 'Landlord Direct', 'Estate Office'];
      default:
        return [];
    }
  }

  bool shouldShowProviderGrid() {
    return ['Internet', 'Airtime'].contains(_selectedService);
  }

  String getFirstFieldLabel() {
    switch (selectedService) {
      case "Electricity":
        return "Meter Number";
      case "Internet":
        return "Account/Customer ID";
      case "Airtime":
        return "Phone Number";
      case "Transport":
        return "Account/Reference Number";
      case "Rent/Utilities":
        return "Customer Reference";
      default:
        return "Reference";
    }
  }

  String getSecondFieldLabel() {
    switch (selectedService) {
      case "Electricity":
      case "Internet":
      case "Airtime":
      case "Transport":
      case "Rent/Utilities":
        return "Amount";
      default:
        return "Amount";
    }
  }

  bool canProceed() {
    return _selectedService.isNotEmpty &&
        (_selectedProvider.isNotEmpty || !shouldShowProviderGrid());
  }

  Future<void> processBill() async {
    if (!canProceed()) {
      _errorMessage = 'Please complete all required fields';
      notifyListeners();
      return;
    }

    setBusy(true);
    _errorMessage = '';
    _successMessage = '';

    try {
      final amount = double.tryParse(secondFieldController.text);
      if (amount == null || amount <= 0) {
        _errorMessage = 'Invalid amount';
        notifyListeners();
        return;
      }

      final response = await _apiService.post('/bills/pay', {
        'category': _selectedService.toLowerCase(),
        'provider': _selectedProvider.toLowerCase(),
        'phone': firstFieldController.text,
        'amount': amount,
      });

      if (response['status'] == 'success') {
        _successMessage = response['data']['message'] ?? 'Bill payment successful';
        _selectedService = '';
        _selectedProvider = '';
        firstFieldController.clear();
        secondFieldController.clear();
      } else {
        _errorMessage = response['message'] ?? 'Payment failed';
      }
    } catch (e) {
      _errorMessage = 'Error processing payment: $e';
      print('Bill Payment Error: $e');
    } finally {
      setBusy(false);
      notifyListeners();
    }
  }

  @override
  void dispose() {
    firstFieldController.dispose();
    secondFieldController.dispose();
    super.dispose();
  }
}
