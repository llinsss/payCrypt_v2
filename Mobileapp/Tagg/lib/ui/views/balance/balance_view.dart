import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'balance_viewmodel.dart';

class BalanceView extends StackedView<BalanceViewModel> {
  const BalanceView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    BalanceViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      body: SafeArea(
        child: Column(
          children: [
            _buildTopNavigation(viewModel),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 24),
                    _buildHeader(viewModel),
                    const SizedBox(height: 24),
                    _buildDashboardCards(viewModel),
                    const SizedBox(height: 24),
                    _buildChainFilters(viewModel),
                    const SizedBox(height: 24),
                    _buildAssetsList(viewModel),
                    const SizedBox(height: 24),
                    _buildAssetAllocation(viewModel),
                    const SizedBox(height: 100),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopNavigation(BalanceViewModel viewModel) {
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

  Widget _buildHeader(BalanceViewModel viewModel) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          'Balance',
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
              onTap: viewModel.refreshData,
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

  Widget _buildDashboardCards(BalanceViewModel viewModel) {
    return Column(
      children: [
        _buildDashboardCard(
          assetPath: AppAssets.balance,
          title: 'Portfolio Overview',
          currency: 'USD',
          value: '${viewModel.formatCurrency(viewModel.totalBalance)}',
          isLoading: viewModel.isBusy,
        ),
        const SizedBox(height: 12),
        _buildDashboardCard(
          assetPath: AppAssets.down,
          title: 'Total Deposits',
          currency: 'USD',
          value: '${viewModel.formatCurrency(viewModel.totalDeposits)}',
          isLoading: viewModel.isBusy,
        ),
        const SizedBox(height: 12),
        _buildDashboardCard(
          assetPath: AppAssets.up,
          title: 'Total Withdrawals',
          currency: 'USD',
          value: '${viewModel.formatCurrency(viewModel.totalWithdrawals)}',
          isLoading: viewModel.isBusy,
        ),
      ],
    );
  }

  Widget _buildDashboardCard({
    required String assetPath,
    required String title,
    required String value,
    required String currency,
    bool isLoading = false,
  }) {
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
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(24),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
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
                        assetPath,
                        width: 1,
                        height: 1,
                        fit: BoxFit.none,
                      )),
                  const SizedBox(width: 8),
                  Text(
                    title,
                    style: GoogleFonts.instrumentSans(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 15),
              isLoading
                  ? _buildLoadingSkeleton(width: 150, height: 24)
                  : Row(
                      children: [
                        Text(
                          currency,
                          style: GoogleFonts.instrumentSans(
                            fontSize: 20,
                            fontWeight: FontWeight.w500,
                            color: const Color(0xFF867EA5),
                          ),
                        ),
                        SizedBox(width: 5),
                        Text(
                          value,
                          style: GoogleFonts.instrumentSans(
                              fontSize: 20,
                              fontWeight: FontWeight.w600,
                              color: Colors.white),
                        ),
                      ],
                    ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingSkeleton({required double width, required double height}) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: const Color(0xFF262140),
        borderRadius: BorderRadius.circular(4),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: -1.0, end: 2.0),
          duration: const Duration(milliseconds: 1500),
          builder: (context, value, child) {
            return FractionallySizedBox(
              alignment: Alignment(value, 0),
              widthFactor: 0.3,
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.transparent,
                      const Color(0xFF867EA5).withOpacity(0.3),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            );
          },
          onEnd: () {
            // Restart animation
          },
        ),
      ),
    );
  }

  Widget _buildChainFilters(BalanceViewModel viewModel) {
    return Column(
      children: [
        _buildFilterRow([
          GradientChip(
            label: 'All Chains',
            isSelected: viewModel.selectedChain == 'All Chains',
            onTap: () => viewModel.selectChain('All Chains'),
            borderRadius: const BorderRadius.horizontal(
              left: Radius.circular(48),
              right: Radius.circular(4),
            ),
          ),
          GradientChip(
            label: 'Starknet',
            isSelected: viewModel.selectedChain == 'Starknet',
            onTap: () => viewModel.selectChain('Starknet'),
            borderRadius: const BorderRadius.all(Radius.circular(4)),
          ),
          GradientChip(
            label: 'Lisk',
            isSelected: viewModel.selectedChain == 'Lisk',
            onTap: () => viewModel.selectChain('Lisk'),
            borderRadius: const BorderRadius.horizontal(
              left: Radius.circular(4),
              right: Radius.circular(48),
            ),
          ),
        ]),
        SizedBox(height: 2),
        _buildFilterRow([
          GradientChip(
            label: 'Base',
            isSelected: viewModel.selectedChain == 'Base',
            onTap: () => viewModel.selectChain('Base'),
            borderRadius: const BorderRadius.horizontal(
              left: Radius.circular(48),
              right: Radius.circular(4),
            ),
          ),
          GradientChip(
            label: 'Flow',
            isSelected: viewModel.selectedChain == 'Flow',
            onTap: () => viewModel.selectChain('Flow'),
            borderRadius: const BorderRadius.all(Radius.circular(4)),
          ),
          GradientChip(
            label: 'U2U',
            isSelected: viewModel.selectedChain == 'U2U',
            onTap: () => viewModel.selectChain('U2U'),
            borderRadius: const BorderRadius.horizontal(
              left: Radius.circular(4),
              right: Radius.circular(48),
            ),
          ),
        ]),
      ],
    );
  }

  Widget _buildFilterRow(List<Widget> chips) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 1).copyWith(left: 2),
      child: Row(
        children: chips
            .map((chip) => Padding(
                  padding: const EdgeInsets.only(right: 2), // 👈 small gap
                  child: chip,
                ))
            .toList(),
      ),
    );
  }

  Widget _buildAssetsList(BalanceViewModel viewModel) {
    return Column(
      children: viewModel.filteredTokenBalances
          .map((token) => _buildAssetCard(token, viewModel))
          .toList(),
    );
  }

  Widget _buildAssetCard(dynamic token, BalanceViewModel viewModel) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        children: [
          Container(
            width: double.infinity,
            height: 193,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF181027), Color(0xFF110F20)],
              ),
              border: Border.all(color: const Color(0xFF262140)),
              borderRadius: BorderRadius.circular(12),
            ),
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
                      child: _buildAssetIcon(token),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      token.tokenName,
                      style: GoogleFonts.instrumentSans(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        viewModel.formatCrypto(token.amount, token.tokenSymbol),
                        style: GoogleFonts.instrumentSans(
                          color: Color(0xFFE2E2E2),
                          fontSize: 20,
                          fontWeight: FontWeight.w500,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    SvgPicture.asset(AppAssets.equal),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        viewModel.formatCurrency(token.usdValue),
                        style: GoogleFonts.instrumentSans(
                          color: Color(0xFFE2E2E2),
                          fontSize: 20,
                          fontWeight: FontWeight.w500,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 10),
                Container(
                  constraints: BoxConstraints(maxWidth: 340),
                  height: 45,
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  decoration: BoxDecoration(
                    color: const Color(0xFF262140),
                    border: Border.all(color: const Color(0xFF302A4E)),
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
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Current Price',
                        style: GoogleFonts.instrumentSans(
                          color: Color(0xFF867EA5),
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      Text(
                        viewModel.formatDollarCurrency(token.tokenPrice),
                        style: GoogleFonts.instrumentSans(
                          color: Color(0xFFE2E2E2),
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAssetIcon(dynamic token) {
    String assetPath;
    BoxFit fit = BoxFit.none;

    switch (token.tokenSymbol.toUpperCase()) {
      case 'LSK':
        assetPath = AppAssets.lsk;
        break;
      case 'BASE':
        assetPath = AppAssets.base;
        break;
      case 'STRK':
        assetPath = AppAssets.strk;
        break;
      case 'FLOW':
        assetPath = AppAssets.flow;
        fit = BoxFit.contain; // Flow needs contain fit
        break;
      case 'U2U':
        assetPath = AppAssets.u2u;
        break;
      default:
        assetPath = AppAssets.strk; // fallback
    }

    return SvgPicture.asset(
      assetPath,
      fit: fit,
    );
  }

  Widget _buildAssetAllocation(BalanceViewModel viewModel) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Asset Allocation',
          style: GoogleFonts.instrumentSans(
            color: Color(0xFFE2E2E2),
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '0%',
              style: GoogleFonts.instrumentSans(
                color: Color(0xFFE2E2E2),
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
            Text(
              '100%',
              style: GoogleFonts.instrumentSans(
                color: Color(0xFFE2E2E2),
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _buildAllocationChart(viewModel),
        const SizedBox(height: 24),
        ...viewModel.filteredTokenBalances
            .map((token) => _buildAllocationItem(token, viewModel)),
      ],
    );
  }

  Widget _buildAllocationChart(BalanceViewModel viewModel) {
    return Container(
      height: 40,
      child: Row(
        children: List.generate(60, (index) {
          Color barColor;
          if (index < 12) {
            barColor = const Color(0xFF52449C); // Starknet
          } else if (index < 24) {
            barColor = const Color(0xFF284C76); // Lisk
          } else if (index < 36) {
            barColor = const Color(0xFF0052FF); // Base
          } else if (index < 48) {
            barColor = const Color(0xFF00EF8B); // Flow
          } else {
            barColor = const Color(0xFFFF9211); // U2U
          }

          return Expanded(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 1),
              decoration: BoxDecoration(
                color: barColor,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildAllocationItem(dynamic token, BalanceViewModel viewModel) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      height: 148,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF181027), Color(0xFF110F20)],
        ),
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
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
                    child: _buildAssetIcon(token),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    token.tokenName,
                    style: GoogleFonts.instrumentSans(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                width: 114,
                height: 10,
                decoration: BoxDecoration(
                  color: _getAllocationColor(token.tokenSymbol),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ],
          ),
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              color: const Color(0xFF262140),
              border: Border.all(color: const Color(0xFF302A4E)),
              borderRadius: BorderRadius.circular(4),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.4),
                  blurRadius: 30,
                  offset: const Offset(4, 4),
                ),
              ],
            ),
            child: Center(
              child: Text(
                '${viewModel.getAssetAllocationPercentage(token).toStringAsFixed(0)}%',
                style: GoogleFonts.instrumentSans(
                  color: Color(0xFF867EA5),
                  fontSize: 24,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Color _getAllocationColor(String symbol) {
    switch (symbol) {
      case 'STRK':
        return const Color(0xFF52449C);
      case 'LSK':
        return const Color(0xFF284C76);
      case 'BASE':
        return const Color(0xFF0052FF);
      case 'FLOW':
        return const Color(0xFF00EF8B);
      case 'U2U':
        return const Color(0xFFFF9211);
      default:
        return const Color(0xFF52449C);
    }
  }

  @override
  BalanceViewModel viewModelBuilder(
    BuildContext context,
  ) {
    final viewModel = BalanceViewModel();
    viewModel.initialize();
    return viewModel;
  }
}

class GradientChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;
  final BorderRadius borderRadius;

  const GradientChip({
    super.key,
    required this.label,
    required this.isSelected,
    required this.onTap,
    required this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: borderRadius,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          gradient: isSelected
              ? const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFF674AA6), // top
                    Color(0xFF2E235C), // bottom
                  ],
                )
              : null,
          color: isSelected ? null : const Color(0xFF120F21),
          borderRadius: borderRadius,
          border: Border.all(color: const Color(0xFF262140)),
        ),
        child: Text(
          label,
          style: GoogleFonts.instrumentSans(
            color: Color(0xFFE2E2E2),
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
