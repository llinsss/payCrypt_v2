import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';
import 'swap_viewmodel.dart';

class SwapView extends StackedView<SwapViewModel> {
  const SwapView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    SwapViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      body: SafeArea(
        child: Column(
          children: [
            _buildTopNavigation(viewModel),
        
            SizedBox(height: 30),
        
            // Main Content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(
                    left: 12.0, right: 12.0, top: 16, bottom: 50),
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: const Color(0xFF130F22),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Swap',
                          style: GoogleFonts.instrumentSans(
                            color: Color(0xFFE2E2E2),
                            fontSize: 24,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 18),
        
                        // Swap Container
                        _buildSwapContainer(viewModel),
        
                        const SizedBox(height: 18),
        
                        // Slippage Section
                        _buildSlippageSection(viewModel),
        
                        const SizedBox(height: 18),
        
                        // Swap Button
                        _buildSwapButton(viewModel),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopNavigation(SwapViewModel viewModel) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF090715).withOpacity(0.1),
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(5),
          bottomRight: Radius.circular(5),
        ),
      ),
      child: Column(
        children: [
          // Navigation Bar
          Container(
            height: 64,
            decoration: const BoxDecoration(
              color: Color(0xFF090715),
              border: Border(
                bottom: BorderSide(color: Color(0xFF262140), width: 1),
              ),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Logo Section
                Row(
                  children: [
                    SvgPicture.asset(
                      AppAssets.log,
                      height: 29,
                      width: 29,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      "Tagged",
                      style: GoogleFonts.inter(
                        fontStyle: FontStyle.italic,
                        fontWeight: FontWeight.w700,
                        fontSize: 16.24,
                        height: 20 / 16.24, // line-height to font-size ratio
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),

                // Profile and Settings
                Row(
                  children: [
                    // Notification Button
                    Container(
                      width: 39,
                      height: 39,
                      decoration: BoxDecoration(
                        color: const Color(0xFF130F22),
                        border: Border.all(color: const Color(0xFF262140)),
                        borderRadius: BorderRadius.circular(48),
                      ),
                      child: const Icon(
                        Icons.notifications_outlined,
                        color: Color(0xFFE2E2E2),
                        size: 16,
                      ),
                    ),

                    const SizedBox(width: 14),

                    Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFF130F22),
                          border: Border.all(color: Colors.white),
                          borderRadius: BorderRadius.circular(48),
                        ),
                        child: Image.asset(
                          AppAssets.profile,
                        )),

                    const SizedBox(width: 14),

                    // Menu Button
                    GestureDetector(
                      onTap: () {},
                      child: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFF130F22),
                          border: Border.all(color: const Color(0xFF262140)),
                          borderRadius: BorderRadius.circular(48),
                        ),
                        child: const Icon(
                          Icons.menu,
                          color: Color(0xFFE2E2E2),
                          size: 16,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSwapContainer(SwapViewModel viewModel) {
    return Stack(
      children: [
        Column(
          children: [
            // From Token
            _buildTokenCard(
              value: "0.00",
              usdValue: "\$0.00",
              tokenSymbol: viewModel.selectedFromToken,
              isFrom: true,
              maxValue: "MAX",
              onTokenTap: () => viewModel.showFromTokenDialog(), // Updated
            ),
            const SizedBox(height: 8),

            // To Token
            _buildTokenCard(
              value: "0.00",
              usdValue: "\$0.00",
              tokenSymbol: viewModel.selectedToToken,
              isFrom: false,
              maxValue: "0",
              onTokenTap: () => viewModel.showToTokenDialog(), // Updated
            ),
          ],
        ),

        // Swap Icon
        Positioned(
          left: (334 - 32) / 2,
          top: (280 - 32) / 2 - 8,
          child: Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: const Color(0xFF262140),
              border: Border.all(color: const Color(0xFF302A4E)),
              borderRadius: BorderRadius.circular(100),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.4),
                  blurRadius: 30,
                  offset: const Offset(4, 4),
                ),
              ],
            ),
            child: const Icon(Icons.swap_vert, color: Colors.white, size: 16),
          ),
        ),
      ],
    );
  }

  Widget _buildTokenCard({
    required String value,
    required String usdValue,
    required String tokenSymbol,
    required bool isFrom,
    required String maxValue,
    required VoidCallback onTokenTap,
  }) {
    return Container(
      height: 136,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF181027), Color(0xFF110F20)],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        border: Border.all(color: Color(0xFF262140)),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Left Side
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(value,
                    style: GoogleFonts.instrumentSans(
                        color: Color(0xFFE2E2E2),
                        fontSize: 32,
                        fontWeight: FontWeight.w500)),
                Text(usdValue,
                    style: GoogleFonts.instrumentSans(
                        color: Color(0xFF867EA5),
                        fontSize: 20,
                        fontWeight: FontWeight.w500)),
              ],
            ),

            // Right Side
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Token selector
                GestureDetector(
                  onTap: onTokenTap,
                  child: Container(
                    height: 40,
                    decoration: BoxDecoration(
                      color: const Color(0xFF262140),
                      border:
                          Border.all(color: const Color(0xFF302A4E), width: 2),
                      borderRadius: BorderRadius.circular(48),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.4),
                          blurRadius: 30,
                          offset: const Offset(4, 4),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding:
                          EdgeInsets.symmetric(horizontal: isFrom ? 8 : 12),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            tokenSymbol,
                            style: GoogleFonts.instrumentSans(
                                color: Colors.white,
                                fontSize: 14,
                                fontWeight: FontWeight.w500),
                          ),
                          const SizedBox(width: 6),
                          const Icon(Icons.keyboard_arrow_down,
                              color: Colors.white, size: 18),
                        ],
                      ),
                    ),
                  ),
                ),

                // Balance / Max
                Row(
                  children: [
                    Text("0",
                        style: GoogleFonts.instrumentSans(
                            color: Color(0xFF867EA5),
                            fontSize: 20,
                            fontWeight: FontWeight.w500)),
                    if (isFrom) ...[
                      const SizedBox(width: 12),
                      ShaderMask(
                        shaderCallback: (bounds) => const LinearGradient(
                          colors: [Color(0xFF674AA6), Color(0xFF2E235C)],
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                        ).createShader(bounds),
                        child: Text(
                          maxValue,
                          style: GoogleFonts.instrumentSans(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.w500),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSlippageSection(SwapViewModel viewModel) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "Slippage",
          style: GoogleFonts.instrumentSans(
            color: Color(0xFFE2E2E2),
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 12),

        // TextField for Slippage Input
        Container(
          height: 55,
          decoration: BoxDecoration(
            color: const Color(0xFF120F21),
            border: Border.all(color: const Color(0xFF262140), width: 2),
            borderRadius: BorderRadius.circular(48),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: viewModel.slippageController,
                    keyboardType:
                        TextInputType.numberWithOptions(decimal: true),
                    style: GoogleFonts.instrumentSans(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                    ),
                    decoration: InputDecoration(
                      border: InputBorder.none,
                      hintText: "Enter slippage",
                      hintStyle: GoogleFonts.instrumentSans(
                        color: Color(0xFF867EA5),
                        fontSize: 16,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                    onChanged: (value) {
                      viewModel.updateSlippageFromText(value);
                    },
                  ),
                ),
                Text(
                  "%",
                  style: GoogleFonts.instrumentSans(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 12),

        // Options
        Row(
          children: [
            _buildSlippageOption("0.5%", 0.5, viewModel),
            const SizedBox(width: 12),
            _buildSlippageOption("1%", 1.0, viewModel),
            const SizedBox(width: 12),
            _buildSlippageOption("2%", 2.0, viewModel),
          ],
        ),
      ],
    );
  }

  Widget _buildSlippageOption(
      String text, double value, SwapViewModel viewModel) {
    bool isSelected = viewModel.slippageValue == value;

    return GestureDetector(
      onTap: () => viewModel.setSlippage(value),
      child: Container(
        width: 72,
        height: 50,
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF674AA6) : const Color(0xFF262140),
          border: Border.all(color: const Color(0xFF302A4E), width: 2),
          borderRadius: BorderRadius.circular(48),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.4),
              blurRadius: 30,
              offset: const Offset(4, 4),
            ),
          ],
        ),
        child: Center(
          child: Text(text,
              style: GoogleFonts.instrumentSans(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w500)),
        ),
      ),
    );
  }

  Widget _buildSwapButton(SwapViewModel viewModel) {
    return GestureDetector(
      onTap: () => viewModel.performSwap(),
      child: Container(
        width: double.infinity,
        height: 60,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: [Color(0xFF674AA6), Color(0xFF2E235C)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter),
          borderRadius: BorderRadius.circular(48),
        ),
        child: Center(
          child: Text("Swap",
              style: GoogleFonts.instrumentSans(
                  color: Color(0xFFE2E2E2),
                  fontSize: 14,
                  fontWeight: FontWeight.w500)),
        ),
      ),
    );
  }

  @override
  SwapViewModel viewModelBuilder(BuildContext context) => SwapViewModel();
}
