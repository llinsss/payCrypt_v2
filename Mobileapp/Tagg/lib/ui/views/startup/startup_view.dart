import 'dart:ui';

import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';
import 'startup_viewmodel.dart';

class StartupView extends StackedView<StartupViewModel> {
  const StartupView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    StartupViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      body: Stack(
        children: [
          // Star 1
          Positioned(
            left: -136,
            top: 606,
            child: Container(
              width: 450,
              height: 450,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color.fromARGB(255, 25, 13, 51), Color(0xFF2E235C)],
                ),
              ),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 150, sigmaY: 150),
                child: const SizedBox(),
              ),
            ),
          ),

          // Star 2
          Positioned(
            left: 138,
            top: 302,
            child: Container(
              width: 353,
              height: 353,
              decoration: BoxDecoration(
                color: const Color(0xFF262140),
                borderRadius: BorderRadius.circular(353 / 2),
              ),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 100, sigmaY: 100),
                child: const SizedBox(),
              ),
            ),
          ),

          // Star 4
          Positioned(
            left: -120,
            top: -51,
            child: Container(
              width: 353,
              height: 353,
              decoration: BoxDecoration(
                color: const Color.fromARGB(255, 0, 94, 59),
                borderRadius: BorderRadius.circular(353 / 2),
              ),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 150, sigmaY: 150),
                child: const SizedBox(),
              ),
            ),
          ),

          // Menu Box (Center)
          Center(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(48),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
                child: Container(
                  width: 353,
                  height: 108,
                  decoration: BoxDecoration(
                    // 👇 Add slight background tint for contrast and glass effect
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(48),
                    // 👇 Make borders pop (lighter + visible on dark background)
                    border: Border(
                      left: BorderSide(
                        width: 2,
                        color: Colors.white.withOpacity(0.06),
                      ),
                      right: BorderSide(
                        width: 2,
                        color: Colors.white.withOpacity(0.06),
                      ),
                    ),
                  ),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Logo mark
                      SvgPicture.asset(
                        AppAssets.log,
                        height: 50,
                        width: 50,
                      ),
                      const SizedBox(width: 12),

                      // Wordmark
                      Text(
                        'Tagged',
                        style: GoogleFonts.inter(
                          color: Colors.white,
                          fontStyle: FontStyle.italic,
                          fontWeight: FontWeight.w700,
                          fontSize: 28,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  StartupViewModel viewModelBuilder(BuildContext context) => StartupViewModel();

  @override
  void onViewModelReady(StartupViewModel viewModel) => SchedulerBinding.instance
      .addPostFrameCallback((timeStamp) => viewModel.runStartupLogic());
}
