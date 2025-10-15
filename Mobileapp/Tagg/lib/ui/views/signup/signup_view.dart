import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'signup_viewmodel.dart';

class SignupView extends StackedView<SignupViewModel> {
  const SignupView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    SignupViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      resizeToAvoidBottomInset: true, // important for keyboard
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.only(bottom: 20), // spacing for keyboard
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title
              Padding(
                padding: const EdgeInsets.only(left: 16, top: 80),
                child: Text(
                  'Sign Up',
                  style: GoogleFonts.instrumentSans(
                    fontSize: 24,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFFE2E2E2),
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // Form Section
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  children: [
                    _buildInputField(
                      'Enter Unique Tag',
                      viewModel.tagController,
                      viewModel.tagFocusNode,
                    ),
                    const SizedBox(height: 24),
                    _buildInputField(
                      'Enter your email address',
                      viewModel.emailController,
                      viewModel.emailFocusNode,
                    ),
                    const SizedBox(height: 24),
                    _buildInputField(
                      'Enter your password',
                      viewModel.passwordController,
                      viewModel.passwordFocusNode,
                      isPassword: true,
                    ),
                    const SizedBox(height: 24),
                    _buildInputField(
                      'Confirm Password',
                      viewModel.confirmPasswordController,
                      viewModel.confirmPasswordFocusNode,
                      isPassword: true,
                    ),
                    const SizedBox(height: 24),

                    // OR Divider
                    Text(
                      'or',
                      style: GoogleFonts.josefinSans(
                        fontSize: 18,
                        fontWeight: FontWeight.w400,
                        color: const Color(0xFF867EA5),
                      ),
                    ),
                    const SizedBox(height: 24),

                    _buildGoogleSignInButton(viewModel),
                    const SizedBox(height: 34),

                    _buildTermsCheckbox(viewModel),
                  ],
                ),
              ),

              const SizedBox(height: 40),

              // Bottom Section
              Center(child: _buildBottomSection(viewModel)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInputField(
    String placeholder,
    TextEditingController controller,
    FocusNode focusNode, {
    bool isPassword = false,
  }) {
    return Container(
      width: 400,
      height: 64,
      decoration: BoxDecoration(
        color: const Color(0xFF120F21),
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(48),
      ),
      child: Center(
        child: TextField(
          controller: controller,
          focusNode: focusNode,
          obscureText: isPassword,
          style: GoogleFonts.instrumentSans(
            fontSize: 16,
            fontWeight: FontWeight.w500,
            color: Color(0xFFE2E2E2),
          ),
          decoration: InputDecoration(
            hintText: placeholder,
            hintStyle: GoogleFonts.instrumentSans(
              fontSize: 16,
              fontWeight: FontWeight.w500,
              color: Color(0xFF867EA5),
            ),
            border: InputBorder.none,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
          ),
        ),
      ),
    );
  }

  Widget _buildGoogleSignInButton(SignupViewModel viewModel) {
    return GestureDetector(
      onTap: viewModel.signInWithGoogle,
      child: Container(
        width: 400,
        height: 72,
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFF1B434D)),
          borderRadius: BorderRadius.circular(48),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(160.725),
              ),
              child: Center(
                  child: Image.asset(
                AppAssets.google,
                height: 23,
                width: 23,
              )),
            ),
            const SizedBox(width: 12),
            Text(
              'Sign in with Google',
              style: GoogleFonts.instrumentSans(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: Color(0xFF39364F),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTermsCheckbox(SignupViewModel viewModel) {
    return SizedBox(
      width: 345,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: viewModel.toggleTermsAgreement,
            child: Container(
              width: 19,
              height: 19,
              decoration: BoxDecoration(
                color: viewModel.agreeToTerms ? null : Colors.transparent,
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFE2E2E2), width: 1.5),
              ),
              child: viewModel.agreeToTerms
                  ? const Icon(Icons.check, size: 14, color: Colors.white)
                  : null,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: GoogleFonts.instrumentSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w400,
                  color: const Color(0xFFE2E2E2),
                ),
                children: const [
                  TextSpan(text: 'I agree to the '),
                  TextSpan(
                    text: 'Terms of Service',
                    style: TextStyle(
                      decoration: TextDecoration.underline,
                      color: Color(0xFFE2E2E2),
                    ),
                    // recognizer lets you make it tappable
                    // recognizer: TapGestureRecognizer()..onTap = () => print("Terms tapped"),
                  ),
                  TextSpan(text: ' and '),
                  TextSpan(
                    text: 'Privacy Policy',
                    style: TextStyle(
                      decoration: TextDecoration.underline,
                      color: Color(0xFFE2E2E2),
                    ),
                    // recognizer: TapGestureRecognizer()..onTap = () => print("Privacy tapped"),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomSection(SignupViewModel viewModel) {
    return SizedBox(
      width: 400,
      height: 175,
      child: Column(
        children: [
          // Create Account Button
          GestureDetector(
            onTap: viewModel.createAccount,
            child: Container(
              width: 400,
              height: 60,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFF674AA6), Color(0xFF2E235C)],
                ),
                borderRadius: BorderRadius.circular(48),
              ),
              child: Center(
                child: viewModel.isBusy
                    ? const CircularProgressIndicator(color: Colors.white)
                    : Text(
                        'Create Account',
                        style: GoogleFonts.nunito(
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          color: Colors.white,
                        ),
                      ),
              ),
            ),
          ),
          const SizedBox(height: 34),

          // Sign In Link
          GestureDetector(
            onTap: viewModel.navigateToSignIn,
            child: RichText(
              text: TextSpan(
                style: GoogleFonts.instrumentSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFFE2E2E2),
                ),
                children: [
                  TextSpan(text: 'Already have an account? '),
                  TextSpan(
                    text: 'Sign In',
                    style: TextStyle(
                      decoration: TextDecoration.underline,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  SignupViewModel viewModelBuilder(
    BuildContext context,
  ) =>
      SignupViewModel();
}
