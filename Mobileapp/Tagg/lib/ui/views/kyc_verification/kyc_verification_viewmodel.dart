import 'dart:io';

import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';

class KycVerificationViewModel extends BaseViewModel {
  int _currentStep = 0;

  int get currentStep => _currentStep;

  final List<String> steps = ['Personal Details', 'Documents', 'Review'];

  // Form fields - using obscured text for sensitive data
  // Text Controllers
  final fullNameController = TextEditingController();
  final phoneController = TextEditingController();
  final addressController = TextEditingController();
  final dobController = TextEditingController();
  final bvnController = TextEditingController();

  bool _isBvnVisible = false;
  bool _isDobVisible = false;
  bool get isBvnVisible => _isBvnVisible;
  bool get isDobVisible => _isDobVisible;

  // Document uploads
  File? _idDocument;
  File? _proofOfAddress;

  File? get idDocument => _idDocument;
  File? get proofOfAddress => _proofOfAddress;

  // Form data for review
  final Map<String, String> _formData = {
    'Full Name': 'John Doe',
    'Phone Number': '+234 123 456 7890',
    'Address': '123 Main Street, Lagos',
    'Date of Birth': '01/01/1990',
    'BVN': '12345678901',
  };

  Map<String, String> get formData => _formData;

  void toggleBvnVisibility() {
    _isBvnVisible = !_isBvnVisible;
    notifyListeners();
  }

  void toggleDobVisibility() {
    _isDobVisible = !_isDobVisible;
    notifyListeners();
  }

  void setIdDocument(File? file) {
    _idDocument = file;
    notifyListeners();
  }

  void setProofOfAddress(File? file) {
    _proofOfAddress = file;
    notifyListeners();
  }

  void nextStep() {
    if (_currentStep < steps.length - 1) {
      _currentStep++;
      notifyListeners();
    }
  }

  void previousStep() {
    if (_currentStep > 0) {
      _currentStep--;
      notifyListeners();
    }
  }

  void goToStep(int step) {
    if (step >= 0 && step < steps.length) {
      _currentStep = step;
      notifyListeners();
    }
  }

  String get buttonText {
    if (_currentStep == steps.length - 1) {
      return 'Submit Verification';
    }
    return 'Next';
  }

  void handleButtonPress() {
    if (_currentStep == steps.length - 1) {
      submitKyc();
    } else {
      nextStep();
    }
  }

  void submitKyc() {
    setBusy(true);
    // Simulate API call
    Future.delayed(const Duration(seconds: 2), () {
      setBusy(false);
      // Navigate to success screen
    });
  }

  @override
  void dispose() {
    fullNameController.dispose();
    phoneController.dispose();
    addressController.dispose();
    dobController.dispose();
    bvnController.dispose();
    super.dispose();
  }
}
