import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';

enum PaybillService {
  electricity,
  internet,
  airtime,
  transport,
  rentUtilities,
}

class BillViewModel extends BaseViewModel {
  String _selectedService = '';
  String _selectedProvider = '';
  String _firstFieldValue = '';
  String _secondFieldValue = '';
  final firstFieldController = TextEditingController();
  final secondFieldController = TextEditingController();

  String get selectedService => _selectedService;
  String get selectedProvider => _selectedProvider;
  String get firstFieldValue => _firstFieldValue;
  String get secondFieldValue => _secondFieldValue;

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
    setBusy(true);

    try {
      // Simulate API call
      await Future.delayed(const Duration(seconds: 2));

      // Handle successful payment
      print('Processing payment for $_selectedService');
      print('Provider: $_selectedProvider');
      print('Field 1: $_firstFieldValue');
      print('Field 2: $_secondFieldValue');

      // You can add navigation or show success dialog here
    } catch (e) {
      // Handle error
      print('Error processing payment: $e');
    } finally {
      setBusy(false);
    }
  }

  @override
  void dispose() {
    firstFieldController.dispose();
    secondFieldController.dispose();
    super.dispose();
  }
}
