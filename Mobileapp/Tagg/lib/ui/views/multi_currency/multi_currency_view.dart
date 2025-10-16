import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'multi_currency_viewmodel.dart';

class MultiCurrencyView extends StackedView<MultiCurrencyViewModel> {
  const MultiCurrencyView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    MultiCurrencyViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      body: SafeArea(
        child: Column(
          children: [
            // Status Bar and Navigation
            _buildTopNavigation(viewModel),

            // Main Content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 24),

                    // Header with title and action buttons
                    _buildHeader(viewModel),

                    const SizedBox(height: 24),

                    // Portfolio Overview Card
                    _buildPortfolioOverviewCard(viewModel),

                    const SizedBox(height: 24),

                    // Quick Actions Row
                    _buildQuickActionsRow(viewModel),

                    const SizedBox(height: 24),

                    // Auto-Convert Settings Card
                    _buildAutoConvertCard(viewModel),

                    const SizedBox(height: 24),

                    // Recent Conversions Section
                    _buildRecentConversionsSection(viewModel),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopNavigation(MultiCurrencyViewModel viewModel) {
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
                      onTap: viewModel.openMenu,
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

  Widget _buildHeader(MultiCurrencyViewModel viewModel) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          'Multi-Currency',
          style: GoogleFonts.instrumentSans(
            fontSize: 18,
            fontWeight: FontWeight.w500,
            color: const Color(0xFFE2E2E2),
          ),
        ),

        // Action Buttons
        Row(
          children: [
            _buildActionButton(
              assetPath: AppAssets.up,
              onTap: viewModel.withdraw,
            ),
            const SizedBox(width: 12),
            _buildActionButton(
              assetPath: AppAssets.down,
              onTap: viewModel.deposit,
            ),
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

  Widget _buildPortfolioOverviewCard(MultiCurrencyViewModel viewModel) {
    return Container(
      width: double.infinity,
      height: 142,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [Color(0xFF181027), Color(0xFF110F20)],
        ),
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(4),
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: const Color(0xFF120D1E),
                    border: Border.all(color: const Color(0xFF262140)),
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: SvgPicture.asset(
                    AppAssets.balance,
                    fit: BoxFit.none,
                  )),
              const SizedBox(width: 8),
              Text(
                'Portfolio Overview',
                style: GoogleFonts.instrumentSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Text(
                'USD',
                style: GoogleFonts.instrumentSans(
                  fontSize: 20,
                  fontWeight: FontWeight.w500,
                  color: const Color(0xFF867EA5),
                ),
              ),
              SizedBox(width: 5),
              Text(
                viewModel.portfolioValue,
                style: GoogleFonts.instrumentSans(
                    fontSize: 25,
                    fontWeight: FontWeight.w500,
                    color: Colors.white),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActionsRow(MultiCurrencyViewModel viewModel) {
    return Row(
      children: [
        Expanded(
          child: _buildQuickActionCard(
            assetPath: AppAssets.refresh,
            title: 'Quick Swaps',
            onTap: viewModel.quickSwap,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildQuickActionCard(
            assetPath: AppAssets.lock,
            title: 'Lock to NGN',
            onTap: viewModel.lockToNGN,
          ),
        ),
      ],
    );
  }

  Widget _buildQuickActionCard({
    required String assetPath,
    required String title,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 135,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [Color(0xFF181027), Color(0xFF110F20)],
          ),
          border: Border.all(color: const Color(0xFF262140)),
          borderRadius: BorderRadius.circular(4),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
                width: 48,
                height: 48,
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
                )),
            const SizedBox(height: 12),
            Text(
              title,
              style: GoogleFonts.instrumentSans(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: const Color(0xFFE2E2E2),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAutoConvertCard(MultiCurrencyViewModel viewModel) {
    return GestureDetector(
      onTap: viewModel.openAutoConvertSettings,
      child: Container(
        width: double.infinity,
        height: 135,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [Color(0xFF181027), Color(0xFF110F20)],
          ),
          border: Border.all(color: const Color(0xFF262140)),
          borderRadius: BorderRadius.circular(4),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: const Color(0xFF120D1E),
                border: Border.all(color: const Color(0xFF262140)),
                borderRadius: BorderRadius.circular(100),
              ),
              child: const Icon(
                Icons.settings_outlined,
                color: Colors.white,
                size: 24,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Auto-Convert Settings',
              style: GoogleFonts.instrumentSans(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: const Color(0xFFE2E2E2),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRecentConversionsSection(MultiCurrencyViewModel viewModel) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(24),
            child: Row(
              children: [
                Text(
                  'Recent Conversions',
                  style: GoogleFonts.instrumentSans(
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    color: const Color(0xFFE2E2E2),
                  ),
                ),
              ],
            ),
          ),

          // Conversion Items
          Column(
            children: viewModel.recentConversions.map((conversion) {
              return _buildConversionItem(conversion);
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildConversionItem(Map<String, dynamic> conversion) {
    final bool isLast = conversion['isLast'] ?? false;

    return Container(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(
                bottom: BorderSide(color: Color(0xFF262140), width: 1),
              ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Left side - Token info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: const Color(0xFF120D1E),
                        border: Border.all(color: const Color(0xFF262140)),
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: conversion['fromIcon'] != null
                          ? SvgPicture.asset(
                              conversion['fromIcon'],
                              width: 12,
                              height: 20,
                            )
                          : const Icon(
                              Icons.currency_bitcoin,
                              color: Colors.white,
                              size: 16,
                            ),
                    ),
                    const SizedBox(width: 4),
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0xFFBAB8C1)),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Image.asset(
                        AppAssets.ngn,
                        width: 32,
                        height: 32,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      conversion['fromAmount'],
                      style: GoogleFonts.instrumentSans(
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                        color: const Color(0xFF867EA5),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      conversion['toAmount'],
                      style: GoogleFonts.instrumentSans(
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                        color: const Color(0xFFE2E2E2),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Right side - Conversion details
          Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                conversion['rate'],
                style: GoogleFonts.instrumentSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: const Color(0xFFE2E2E2),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                conversion['date'],
                style: GoogleFonts.instrumentSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: const Color(0xFF867EA5),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  MultiCurrencyViewModel viewModelBuilder(
    BuildContext context,
  ) {
    final viewModel = MultiCurrencyViewModel();
    viewModel.initialize();
    return viewModel;
  }
}
