import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';
import 'package:qr_flutter/qr_flutter.dart'; // Add this to pubspec.yaml

import 'deposit_viewmodel.dart';

class DepositView extends StackedView<DepositViewModel> {
  const DepositView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    DepositViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      body: SafeArea(
        child: Column(
          children: [
            // Navigation Bar
            _buildTopNavigation(viewModel),

            // Content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 24),

                    // Header with action buttons
                    _buildHeader(viewModel),

                    const SizedBox(height: 24),

                    // Deposit using tags section
                    _buildDepositTagsSection(viewModel),

                    const SizedBox(height: 24),

                    // QR Code section
                    _buildQRCodeSection(context, viewModel),

                    const SizedBox(height: 24),

                    // How to Use section
                    _buildHowToUseSection(viewModel),

                    const SizedBox(height: 16),

                    // Security Reminder section
                    _buildSecurityReminderSection(),

                    const SizedBox(height: 100), // Space for bottom navigation
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopNavigation(DepositViewModel viewModel) {
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

  Widget _buildHeader(DepositViewModel viewModel) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          'Deposit',
          style: GoogleFonts.instrumentSans(
            fontSize: 18,
            fontWeight: FontWeight.w500,
            color: const Color(0xFFE2E2E2),
          ),
        ),

        // Action Buttons
        Row(
          children: [
            _buildActionButton(assetPath: AppAssets.up, onTap: () {}),
            const SizedBox(width: 12),
            _buildActionButton(assetPath: AppAssets.down, onTap: () {}),
            const SizedBox(width: 12),
            _buildActionButton(
              assetPath: AppAssets.refresh,
              onTap: viewModel.refresh,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildActionButton({
    required String assetPath,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [Color(0xFF181027), Color(0xFF110F20)],
          ),
          border: Border.all(color: const Color(0xFFa262140)),
          borderRadius: BorderRadius.circular(48),
        ),
        child: Center(
          child: Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: const Color(0xFF120D1E),
              border: Border.all(color: const Color(0xFF262140)),
              borderRadius: BorderRadius.circular(100),
            ),
            child: SvgPicture.asset(
              assetPath,
              width: 1,
              height: 1,
              fit: BoxFit.none,
            ),
          ),
        ),
      ),
    );
  }

  /// ------------------------
  /// TAGS SECTION
  /// ------------------------
  Widget _buildDepositTagsSection(DepositViewModel viewModel) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Deposit using tags',
          style: GoogleFonts.instrumentSans(
            color: Color(0xFFE2E2E2),
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: [Color(0xFF181027), Color(0xFF110F20)],
            ),
            border: Border.all(color: const Color(0xFF262140)),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                textAlign: TextAlign.right,
                'Send crypto to:',
                style: GoogleFonts.instrumentSans(
                  color: Color(0xFF867EA5),
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 18),
              Center(
                child: Text(
                  viewModel.tag,
                  style: GoogleFonts.instrumentSans(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Flexible(
                    child: GestureDetector(
                      onTap: () => viewModel.copyTagToClipboard(),
                      child: _buildTagButton('Copy Tag', Icons.copy_rounded),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Flexible(
                    child: GestureDetector(
                      onTap: () => viewModel.shareTag(),
                      child: _buildTagButton(
                        'Share',
                        Icons.share_outlined,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Center(
                child: Text(
                  'Anyone can send you crypto using this tag',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.instrumentSans(
                    color: Color(0xFF867EA5),
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTagButton(String text, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF262140),
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
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Flexible(
            child: Text(
              text,
              style: GoogleFonts.instrumentSans(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w500,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 6),
          Icon(icon, color: Colors.white, size: 16),
        ],
      ),
    );
  }

  /// ------------------------
  /// QR CODE SECTION
  /// ------------------------
  Widget _buildQRCodeSection(BuildContext context, DepositViewModel viewModel) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Deposit using QR Code',
          style: GoogleFonts.instrumentSans(
            color: Color(0xFFE2E2E2),
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Select a token to receive money via QR code',
          style: GoogleFonts.instrumentSans(
            color: Color(0xFF867EA5),
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 24),

        // Token Selector
        GestureDetector(
          onTap: () => _showTokenSelector(context, viewModel),
          child: Container(
            width: double.infinity,
            height: 60,
            decoration: BoxDecoration(
              color: const Color(0xFF120F21),
              border: Border.all(color: const Color(0xFF262140), width: 2),
              borderRadius: BorderRadius.circular(48),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      if (viewModel.selectedToken != "Select Token") ...[
                        SvgPicture.asset(
                          AppAssets.tokenLogos[viewModel.selectedChainSymbol] ??
                              AppAssets.balance,
                          width: 20,
                          height: 20,
                        ),
                        const SizedBox(width: 8),
                      ],
                      Text(
                        viewModel.selectedChainName,
                        style: GoogleFonts.instrumentSans(
                          color: viewModel.selectedToken == "Select Token"
                              ? const Color(0xFF867EA5)
                              : Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                  const Icon(Icons.keyboard_arrow_down,
                      color: Colors.white, size: 24),
                ],
              ),
            ),
          ),
        ),

        const SizedBox(height: 24),

        // QR Code Container
        Container(
          width: double.infinity,
          height: 358,
          decoration: BoxDecoration(
            color: const Color(0xFF0D0A18),
            border: Border.all(color: const Color(0xFF262140)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: viewModel.isGeneratingQr
              ? const Center(
                  child: CircularProgressIndicator(
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : viewModel.qrData.isNotEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(24.0),
                      // QR Code
                      child: Center(
                        child: QrImageView(
                          data: viewModel.qrData,
                          version: QrVersions.auto,
                          size: 300.0,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    )
                  : Center(
                      child: Text(
                        'QR code will appear here',
                        style: GoogleFonts.instrumentSans(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
        ),
      ],
    );
  }

  // Token Selector Dialog
  void _showTokenSelector(BuildContext context, DepositViewModel viewModel) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFF130F22),
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(24),
            topRight: Radius.circular(24),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle bar
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFF867EA5),
                borderRadius: BorderRadius.circular(2),
              ),
            ),

            // Title
            Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Select Token',
                style: GoogleFonts.instrumentSans(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),

            // Token List - dynamically from chains
            ...viewModel.chains
                .map(
                  (chain) => ListTile(
                    onTap: () async {
                      viewModel.selectToken(chain.nativeCurrency.symbol);
                      Navigator.pop(context);
                      // Generate QR code after selection
                      await viewModel.generateQRCodeData();
                    },
                    leading: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: const Color(0xFF262140),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(6),
                        child: SvgPicture.asset(
                          AppAssets.tokenLogos[chain.symbol] ??
                              AppAssets.balance, // Use chain.symbol instead of nativeCurrency.symbol
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                    title: Text(
                      chain.name,
                      style: GoogleFonts.instrumentSans(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    subtitle: Text(
                      chain.nativeCurrency.symbol,
                      style: GoogleFonts.instrumentSans(
                        color: const Color(0xFF867EA5),
                        fontSize: 14,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                    trailing: viewModel.selectedToken == chain.nativeCurrency.symbol
                        ? const Icon(Icons.check, color: Colors.green)
                        : null,
                  ),
                )
                .toList(),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  /// ------------------------
  /// HOW TO USE
  /// ------------------------
  Widget _buildHowToUseSection(DepositViewModel viewModel) {
    return _instructionCard(
      title: "How to Use",
      color: const Color(0xFF40996B),
      items: [
        'Share your QR code or tag with anyone who wants to send you crypto',
        'They can scan the QR code with their wallet app',
        'Or they can send directly to your tag: ${viewModel.tag}',
        'Funds will appear in your balance once confirmed on-chain',
      ],
    );
  }

  /// ------------------------
  /// SECURITY REMINDER
  /// ------------------------
  Widget _buildSecurityReminderSection() {
    return _instructionCard(
      title: "Security Reminder",
      color: const Color(0xFF994040),
      items: [
        'Only accept crypto from trusted sources',
        'Double-check network compatibility before sending funds',
        'Large deposits may require additional verification',
        'Contact support if you don\'t see your deposit after 1 hour',
      ],
    );
  }

  Widget _instructionCard({
    required String title,
    required Color color,
    required List<String> items,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF130F22),
        border: Border.all(color: const Color(0xFF302A4E)),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 30,
            offset: const Offset(4, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(48),
            ),
            child: Text(
              title,
              style: GoogleFonts.instrumentSans(
                color: Color(0xFFE2E2E2),
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(height: 24),
          ...items.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(
                  item,
                  style: GoogleFonts.instrumentSans(
                    color: Color(0xFFE2E2E2),
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    height: 1.2,
                  ),
                ),
              )),
        ],
      ),
    );
  }

  @override
  DepositViewModel viewModelBuilder(BuildContext context) => DepositViewModel();

  @override
  void onViewModelReady(DepositViewModel viewModel) {
    viewModel.initialize();
    super.onViewModelReady(viewModel);
  }
}
