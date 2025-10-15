import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/models/auth_models.dart';
import 'package:Tagg/services/auth_service.dart';
import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class SigninViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();
  final _dialogService = locator<DialogService>();
  final _snackbarService = locator<SnackbarService>();
  final _authService = locator<AuthService>();

  // Form Controllers
  final TextEditingController emailController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();

  // Focus Nodes
  final FocusNode emailFocusNode = FocusNode();
  final FocusNode passwordFocusNode = FocusNode();

  void initialize() {
    // Any initialization logic
  }

  Future<void> signIn() async {
    if (!_validateForm()) return;

    setBusy(true);

    try {
      final loginRequest = LoginRequest(
        email: emailController.text.trim(),
        password: passwordController.text,
      );

      final authResponse = await _authService.login(loginRequest);

      _snackbarService.showSnackbar(
        message: 'Signed in successfully!',
        duration: const Duration(seconds: 2),
      );

      // Navigate to dashboard after successful signin
      await _navigationService.replaceWith(Routes.bottomnavView);
    } catch (e) {
      _dialogService.showDialog(
        title: 'Sign In Failed',
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

  void navigateToSignup() {
    _navigationService.navigateTo(Routes.signupView);
  }

  bool _validateForm() {
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
    emailController.dispose();
    passwordController.dispose();

    emailFocusNode.dispose();
    passwordFocusNode.dispose();

    super.dispose();
  }
}
