import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/models/auth_models.dart';
import 'package:Tagg/services/auth_service.dart';
import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class SignupViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();
  final _dialogService = locator<DialogService>();
  final _snackbarService = locator<SnackbarService>();
  final _authService = locator<AuthService>();

  // Form Controllers
  final TextEditingController tagController = TextEditingController();
  final TextEditingController emailController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();
  final TextEditingController confirmPasswordController =
      TextEditingController();

  // Focus Nodes
  final FocusNode tagFocusNode = FocusNode();
  final FocusNode emailFocusNode = FocusNode();
  final FocusNode passwordFocusNode = FocusNode();
  final FocusNode confirmPasswordFocusNode = FocusNode();

  // State
  bool _agreeToTerms = false;
  bool get agreeToTerms => _agreeToTerms;

  void initialize() {
    // Any initialization logic
  }

  void toggleTermsAgreement() {
    _agreeToTerms = !_agreeToTerms;
    notifyListeners();
  }

  Future<void> createAccount() async {
    if (!_validateForm()) return;

    setBusy(true);

    try {
      final registerRequest = RegisterRequest(
        email: emailController.text.trim(),
        tag: tagController.text.trim(),
        address: '', // TODO: Add address field to signup form if needed
        password: passwordController.text,
        role: 'user',
      );

      final authResponse = await _authService.register(registerRequest);

      _snackbarService.showSnackbar(
        message: 'Account created successfully!',
        duration: const Duration(seconds: 2),
      );

      // Navigate to dashboard after successful registration
      await _navigationService.replaceWith(Routes.signinView);
    } catch (e) {
      _dialogService.showDialog(
        title: 'Registration Failed',
        description: e.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      setBusy(false);
    }
  }

  Future<void> signInWithGoogle() async {
    setBusy(true);

    try {
      // TODO: Implement Google Sign In
      await Future.delayed(const Duration(seconds: 1));

      _snackbarService.showSnackbar(
        message: 'Google Sign In coming soon!',
        duration: const Duration(seconds: 2),
      );
    } catch (e) {
      _dialogService.showDialog(
        title: 'Error',
        description: 'Failed to sign in with Google. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  void navigateToSignIn() {
    _navigationService.navigateTo(Routes.signinView);
  }

  bool _validateForm() {
    if (tagController.text.isEmpty) {
      _showValidationError('Please enter a unique tag');
      tagFocusNode.requestFocus();
      return false;
    }

    if (emailController.text.isEmpty) {
      _showValidationError('Please enter your email address');
      emailFocusNode.requestFocus();
      return false;
    }

    if (!_isValidEmail(emailController.text)) {
      _showValidationError('Please enter a valid email address');
      emailFocusNode.requestFocus();
      return false;
    }

    if (passwordController.text.isEmpty) {
      _showValidationError('Please enter your password');
      passwordFocusNode.requestFocus();
      return false;
    }

    if (passwordController.text.length < 6) {
      _showValidationError('Password must be at least 6 characters');
      passwordFocusNode.requestFocus();
      return false;
    }

    if (confirmPasswordController.text != passwordController.text) {
      _showValidationError('Passwords do not match');
      confirmPasswordFocusNode.requestFocus();
      return false;
    }

    if (!_agreeToTerms) {
      _showValidationError(
          'Please agree to the Terms of Service and Privacy Policy');
      return false;
    }

    return true;
  }

  bool _isValidEmail(String email) {
    return RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(email);
  }

  void _showValidationError(String message) {
    _snackbarService.showSnackbar(
      message: message,
      duration: const Duration(seconds: 3),
    );
  }

  @override
  void dispose() {
    tagController.dispose();
    emailController.dispose();
    passwordController.dispose();
    confirmPasswordController.dispose();

    tagFocusNode.dispose();
    emailFocusNode.dispose();
    passwordFocusNode.dispose();
    confirmPasswordFocusNode.dispose();

    super.dispose();
  }
}
