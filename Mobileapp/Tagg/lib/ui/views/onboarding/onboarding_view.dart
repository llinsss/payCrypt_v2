import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'onboarding_viewmodel.dart';

class OnboardingView extends StackedView<OnboardingViewModel> {
  const OnboardingView({Key? key}) : super(key: key);

  static const Color _bg = Color(0xFF090715);
  static const Color _accent = Color(0xFF6C5CE7);

  @override
  Widget builder(
    BuildContext context,
    OnboardingViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: viewModel.showFundPrompt
            ? _buildFundPrompt(viewModel)
            : _buildCarousel(viewModel),
      ),
    );
  }

  Widget _buildCarousel(OnboardingViewModel viewModel) {
    return Column(
      children: [
        // Skip button — present on every slide.
        Align(
          alignment: Alignment.centerRight,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextButton(
              onPressed: viewModel.skip,
              child: Text(
                'Skip',
                style: GoogleFonts.instrumentSans(
                  color: const Color(0xFF867EA5),
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                ),
              ),
            ),
          ),
        ),

        Expanded(
          child: PageView.builder(
            controller: viewModel.pageController,
            onPageChanged: viewModel.onPageChanged,
            itemCount: viewModel.slides.length,
            itemBuilder: (context, index) {
              final slide = viewModel.slides[index];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 140,
                      height: 140,
                      decoration: BoxDecoration(
                        color: _accent.withOpacity(0.15),
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        slide.emoji,
                        style: const TextStyle(fontSize: 64),
                      ),
                    ),
                    const SizedBox(height: 48),
                    Text(
                      slide.title,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.instrumentSans(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 26,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      slide.description,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.instrumentSans(
                        color: const Color(0xFF867EA5),
                        fontWeight: FontWeight.w500,
                        fontSize: 16,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),

        // Page indicator dots
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(
            viewModel.slides.length,
            (i) => AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              margin: const EdgeInsets.symmetric(horizontal: 4),
              width: viewModel.currentPage == i ? 24 : 8,
              height: 8,
              decoration: BoxDecoration(
                color: viewModel.currentPage == i
                    ? _accent
                    : const Color(0xFF262140),
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
        ),

        const SizedBox(height: 32),

        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: viewModel.next,
              style: ElevatedButton.styleFrom(
                backgroundColor: _accent,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(48),
                ),
              ),
              child: Text(
                viewModel.isLastPage ? 'Get Started' : 'Next',
                style: GoogleFonts.instrumentSans(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 32),
      ],
    );
  }

  Widget _buildFundPrompt(OnboardingViewModel viewModel) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // QR-code shortcut affordance
          GestureDetector(
            onTap: viewModel.fundWallet,
            child: Container(
              width: 160,
              height: 160,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
              ),
              alignment: Alignment.center,
              child: const Icon(
                Icons.qr_code_2,
                size: 110,
                color: Color(0xFF090715),
              ),
            ),
          ),
          const SizedBox(height: 40),
          Text(
            'Fund your wallet',
            textAlign: TextAlign.center,
            style: GoogleFonts.instrumentSans(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 26,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Add crypto to get started — scan or share your wallet QR code to '
            'receive your first deposit.',
            textAlign: TextAlign.center,
            style: GoogleFonts.instrumentSans(
              color: const Color(0xFF867EA5),
              fontWeight: FontWeight.w500,
              fontSize: 16,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 40),
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: viewModel.fundWallet,
              style: ElevatedButton.styleFrom(
                backgroundColor: _accent,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(48),
                ),
              ),
              child: Text(
                'Fund with QR code',
                style: GoogleFonts.instrumentSans(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: viewModel.continueToApp,
            child: Text(
              'I’ll do this later',
              style: GoogleFonts.instrumentSans(
                color: const Color(0xFF867EA5),
                fontWeight: FontWeight.w600,
                fontSize: 15,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  OnboardingViewModel viewModelBuilder(BuildContext context) =>
      OnboardingViewModel();
}
