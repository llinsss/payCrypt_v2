import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'signin_viewmodel.dart';

class SigninView extends StackedView<SigninViewModel> {
  const SigninView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    SigninViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: MediaQuery.of(context).size.height -
                  MediaQuery.of(context).padding.top -
                  MediaQuery.of(context).padding.bottom,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Title - keep original spacing for larger screens, reduce for smaller
                Padding(
                  padding: EdgeInsets.only(
                    top: MediaQuery.of(context).size.height > 700 ? 180.0 : 80.0,
                  ),
                  child: Text(
                    'Sign In',
                    style: GoogleFonts.instrumentSans(
                      fontWeight: FontWeight.w500,
                      fontSize: 24,
                      height: 29 / 24,
                      color: const Color(0xFFE2E2E2),
                    ),
                  ),
                ),

                SizedBox(height: 24),

                // Input Fields
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

                // OR Divider
                Text(
                  'or',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.josefinSans(
                    fontSize: 18,
                    fontWeight: FontWeight.w400,
                    color: Color(0xFF867EA5),
                  ),
                ),
                const SizedBox(height: 24),

                // Google Sign In Button
                _buildGoogleSignInButton(viewModel),
                
                const SizedBox(height: 32),

                // Bottom CTA Section
                _buildBottomSection(viewModel),
                
                const SizedBox(height: 24),
              ],
            ),
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
                const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          ),
        ),
      ),
    );
  }

  Widget _buildBottomSection(SigninViewModel viewModel) {
    return Column(
      children: [
        // New User? Sign Up
        GestureDetector(
          onTap: viewModel.navigateToSignup,
          child: RichText(
            text: TextSpan(
              style: GoogleFonts.instrumentSans(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: const Color(0xFFE2E2E2),
              ),
              children: const [
                TextSpan(text: 'New User? '),
                TextSpan(
                  text: 'Sign Up',
                  style: TextStyle(decoration: TextDecoration.underline),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 32),

        // Sign In Button
        GestureDetector(
          onTap: viewModel.signIn,
          child: Container(
            height: 60,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
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
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : Text(
                      'Sign In',
                      style: GoogleFonts.nunito(
                        fontWeight: FontWeight.w500,
                        fontSize: 16,
                        height: 22 / 16,
                        color: Colors.white,
                      ),
                    ),
            ),
          ),
        ),

        const SizedBox(height: 20),

        // Forgot Password Link
        Text(
          'Forgot password?',
          style: GoogleFonts.nunito(
            fontWeight: FontWeight.w500,
            fontSize: 16,
            height: 22 / 16,
            decoration: TextDecoration.underline,
            decorationColor: const Color(0xFFE2E2E2),
            decorationThickness: 1.5,
            color: const Color(0xFFE2E2E2),
          ),
        ),
      ],
    );
  }

  Widget _buildGoogleSignInButton(SigninViewModel viewModel) {
    return GestureDetector(
      onTap: viewModel.signInWithGoogle,
      child: Container(
        height: 64,
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFF1B434D)),
          borderRadius: BorderRadius.circular(48),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Center(
                child: Image.asset(
                  AppAssets.google,
                  height: 23,
                  width: 23,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Flexible(
              child: Text(
                'Sign in with Google',
                style: GoogleFonts.instrumentSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF39364F),
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  SigninViewModel viewModelBuilder(
    BuildContext context,
  ) =>
      SigninViewModel();
}
