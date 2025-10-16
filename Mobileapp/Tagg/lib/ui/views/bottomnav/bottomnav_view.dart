import 'dart:ui';

import 'package:Tagg/ui/common/app_assets.dart';
import 'package:Tagg/ui/views/balance/balance_view.dart';
import 'package:Tagg/ui/views/bill/bill_view.dart';
import 'package:Tagg/ui/views/deposit/deposit_view.dart';
import 'package:Tagg/ui/views/multi_currency/multi_currency_view.dart';
import 'package:Tagg/ui/views/swap/swap_view.dart';
import 'package:Tagg/ui/views/withdrawal/withdrawal_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';
import 'bottomnav_viewmodel.dart';
import '../dashboard/dashboard_view.dart';
import '../settings/settings_view.dart';

class BottomnavView extends StackedView<BottomnavViewModel> {
  const BottomnavView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    BottomnavViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      body: Stack(
        children: [
          // Main content - this will show different pages based on currentPageIndex
          _buildCurrentPage(viewModel),

          // Menu overlay - only covers the body area, not the bottom nav
          if (viewModel.isMenuOpen)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              bottom: 105, // Stop at the bottom nav height
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
                child: Container(
                  color: Colors.transparent,
                ),
              ),
            ),

          // Menu buttons overlay
          if (viewModel.isMenuOpen)
            Positioned(
              bottom: 0, // Position directly on top of the bottom nav
              left: 0,
              right: 0,
              child: Container(
                height: 265,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: const Color(0xFF262140), width: 1),
                  ),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(24),
                    topRight: Radius.circular(24),
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // First row - 2 buttons
                    Row(
                      children: [
                        Expanded(
                          child: _buildNavButton(
                            assetPath: AppAssets.balance,
                            label: "Balance",
                            onTap: () => viewModel.navigateToPage('bill_payments'),
                            isSelected: viewModel.currentPageIndex == 2,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _buildNavButton(
                            assetPath: AppAssets.balance,
                            label: "Convert Fiat",
                            onTap: () => viewModel.navigateToPage('swap'),
                            isSelected: viewModel.currentPageIndex == 3,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    // Second row - 2 buttons
                    Row(
                      children: [
                        Expanded(
                          child: _buildNavButton(
                            assetPath: AppAssets.balance,
                            label: "Deposits",
                            onTap: () => viewModel.navigateToPage('deposits'),
                            isSelected: viewModel.currentPageIndex == 4,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _buildNavButton(
                            assetPath: AppAssets.balance,
                            label: "Withdrawal",
                            onTap: () => viewModel.navigateToPage('withdrawal'),
                            isSelected: viewModel.currentPageIndex == 5,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    // Third row - 2 buttons
                    Row(
                      children: [
                        Expanded(
                          child: _buildNavButton(
                            assetPath: AppAssets.balance,
                            label: "Swap",
                            onTap: () => viewModel.navigateToPage('multicurrency'),
                            isSelected: viewModel.currentPageIndex == 6,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _buildNavButton(
                            assetPath: AppAssets.balance,
                            label: "Pay Bills",
                            onTap: () => viewModel.navigateToPage('pay_bills'),
                            isSelected: viewModel.currentPageIndex == 7,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: _buildBottomNavigation(viewModel),
    );
  }

  Widget _buildCurrentPage(BottomnavViewModel viewModel) {
    switch (viewModel.currentPageIndex) {
      case 0: // Dashboard
        return DashboardView();
      case 1: // Settings
        return SettingsView();
      case 2: // Bill Payments
        // return BillPaymentsView();
        return BalanceView();
      case 3: // Convert Fiat
        // return ConvertFiatView();
        return SwapView();
      case 4: // Deposits
        // return DepositsView();
        return DepositView();
      case 5: // Withdrawal
        // return WithdrawalView();
        return WithdrawalView();
      case 6: // Swap
        // return SwapView();
        return MultiCurrencyView();
      case 7: // Pay Bills
        // return PayBillsView();
        return BillView();
      default:
        return DashboardView();
    }
  }

  // Temporary placeholder for pages that don't exist yet
  Widget _buildPlaceholderPage(String pageName) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      appBar: AppBar(
        backgroundColor: const Color(0xFF090715),
        title: Text(
          pageName,
          style: GoogleFonts.dmSans(
            color: const Color(0xFFE2E2E2),
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFFE2E2E2)),
          onPressed: () {
            // This will go back to dashboard and close the menu
            // You can modify this behavior as needed
          },
        ),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.construction,
              size: 64,
              color: const Color(0xFFB2B2B2),
            ),
            const SizedBox(height: 16),
            Text(
              '$pageName Page',
              style: GoogleFonts.dmSans(
                color: const Color(0xFFE2E2E2),
                fontSize: 24,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'This page is under construction',
              style: GoogleFonts.dmSans(
                color: const Color(0xFFB2B2B2),
                fontSize: 16,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomNavigation(BottomnavViewModel viewModel) {
    return ClipRRect(
      borderRadius: const BorderRadius.only(
        topLeft: Radius.circular(24),
        topRight: Radius.circular(24),
      ),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
        child: Container(
          height: 105,
          decoration: BoxDecoration(
            color: viewModel.isMenuOpen
                ? Colors.transparent
                : const Color(0xFF090715).withOpacity(0.1),
            border: viewModel.isMenuOpen
                ? null
                : const Border(
                    top: BorderSide(color: Color(0xFF262140), width: 1),
                  ),
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(24),
              topRight: Radius.circular(24),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.only(top: 20, left: 24, right: 35),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Dashboard Tab
                GestureDetector(
                  onTap: () => viewModel.setIndex(0),
                  child: Column(
                    children: [
                      Icon(Icons.dashboard_outlined,
                          color: viewModel.currentIndex == 0
                              ? const Color(0xFFE2E2E2)
                              : const Color(0xFFB2B2B2),
                          size: 24),
                      const SizedBox(height: 4),
                      Text(
                        'Dashboard',
                        style: GoogleFonts.instrumentSans(
                          fontSize: 12,
                          fontWeight: viewModel.currentIndex == 0
                              ? FontWeight.w500
                              : FontWeight.w400,
                          color: viewModel.currentIndex == 0
                              ? const Color(0xFFE2E2E2)
                              : const Color(0xFFB2B2B2),
                        ),
                      ),
                    ],
                  ),
                ),

                // Menu Button
                GestureDetector(
                  onTap: viewModel.toggleMenu,
                  child: Column(
                    children: [
                      Container(
                        width: 100,
                        height: 44,
                        decoration: BoxDecoration(
                          gradient: viewModel.isMenuOpen
                              ? null
                              : const LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Color(0xFF674AA6),
                                    Color(0xFF2E235C)
                                  ],
                                ),
                          color: viewModel.isMenuOpen
                              ? const Color(0xFF181027)
                              : null,
                          border: viewModel.isMenuOpen
                              ? Border.all(color: Color(0xFF262140), width: 2)
                              : null,
                          borderRadius: BorderRadius.circular(48),
                        ),
                        child: Center(
                          child: Text(
                            viewModel.isMenuOpen ? 'Collapse' : 'Menu',
                            style: GoogleFonts.instrumentSans(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: Color(0xFFE2E2E2),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '', // empty text keeps height consistent with Dashboard/Settings
                        style: GoogleFonts.dmSans(fontSize: 12),
                      ),
                    ],
                  ),
                ),

                // Settings Tab
                GestureDetector(
                  onTap: () => viewModel.setIndex(1),
                  child: Column(children: [
                    Icon(Icons.settings_outlined,
                        color: viewModel.currentIndex == 1
                            ? const Color(0xFFE2E2E2)
                            : const Color(0xFFB2B2B2),
                        size: 24),
                    const SizedBox(height: 4),
                    Text(
                      'Settings',
                      style: GoogleFonts.instrumentSans(
                        fontSize: 12,
                        fontWeight: viewModel.currentIndex == 1
                            ? FontWeight.w500
                            : FontWeight.w400,
                        color: viewModel.currentIndex == 1
                            ? const Color(0xFFE2E2E2)
                            : const Color(0xFFB2B2B2),
                      ),
                    )
                  ]),
                )
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavButton({
    required String assetPath,
    required String label,
    required VoidCallback onTap,
    required bool isSelected, // Track if this button is selected
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 56,
        padding:
            const EdgeInsets.only(left: 12, top: 12, right: 16, bottom: 12),
        decoration: BoxDecoration(
          // Use solid color when selected, gradient when not selected
          gradient: isSelected
              ? null
              : const LinearGradient(
                  colors: [Color(0xFF181027), Color(0xFF110F20)],
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                ),
          color: isSelected ? const Color(0xFF090715) : null,
          border: Border.all(color: const Color(0xFF262140)),
          borderRadius: BorderRadius.circular(48),
          boxShadow: const [
            BoxShadow(
              color: Colors.black38,
              offset: Offset(4, 4),
              blurRadius: 30,
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0xFF120D1E),
                borderRadius: BorderRadius.circular(100),
                border: Border.all(color: const Color(0xFF262140)),
              ),
              child: Center(
                  child: SvgPicture.asset(
                assetPath,
                width: 18,
                height: 18,
              )),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.instrumentSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFFE2E2E2),
                ),
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  BottomnavViewModel viewModelBuilder(BuildContext context) =>
      BottomnavViewModel();
}
