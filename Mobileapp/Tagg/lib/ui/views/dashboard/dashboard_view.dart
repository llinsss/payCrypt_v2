import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'dashboard_viewmodel.dart';
import 'package:Tagg/models/transaction_model.dart';

class DashboardView extends StackedView<DashboardViewModel> {
  const DashboardView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    DashboardViewModel viewModel,
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

                    // Dashboard Cards
                    _buildDashboardCards(viewModel),

                    const SizedBox(height: 24),

                    // Asset Balance Section
                    _buildAssetBalanceSection(viewModel),

                    _buildTransactionsWithFilter(viewModel)
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopNavigation(DashboardViewModel viewModel) {
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

  Widget _buildHeader(DashboardViewModel viewModel) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          'Dashboard',
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

  Widget _buildDashboardCards(DashboardViewModel viewModel) {
    return Column(
      children: [
        _buildDashboardCard(
          assetPath: AppAssets.balance,
          currency: 'NGN',
          title: 'Naira Balance',
          value: '${viewModel.formatCurrencyToNGN(
            viewModel.nairaBalance,
          )}',
          isLoading: viewModel.isBusy,
        ),
        const SizedBox(height: 24),
        _buildDashboardCard(
          assetPath: AppAssets.balance,
          currency: 'USD',
          title: 'Total Balance',
          value: '${viewModel.formatCurrency(viewModel.totalBalance)}',
          isLoading: viewModel.isBusy,
        ),
        const SizedBox(height: 24),
        _buildDashboardCard(
          assetPath: AppAssets.down,
          currency: 'USD',
          title: 'Total Deposits',
          value: '${viewModel.formatCurrency(viewModel.totalDeposits)}',
          isLoading: viewModel.isBusy,
        ),
        const SizedBox(height: 24),
        _buildDashboardCard(
          assetPath: AppAssets.up,
          currency: 'USD',
          title: 'Total Withdrawals',
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
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFFE2E2E2),
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

  // New Asset Balance Section - using dynamic chains from API
  Widget _buildAssetBalanceSection(DashboardViewModel viewModel) {
    // Map chain symbols to asset paths
    final assetPathMap = {
      'STRK': AppAssets.strk,
      'LSK': AppAssets.lsk,
      'BASE': AppAssets.base,
      'FLOW': AppAssets.flow,
      'U2U': AppAssets.u2u,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section Header
        Text(
          'Asset Balance',
          style: GoogleFonts.instrumentSans(
            fontSize: 16,
            fontWeight: FontWeight.w500,
            color: const Color(0xFFE2E2E2),
          ),
        ),

        const SizedBox(height: 12),

        // Asset Cards - dynamically generated from chains
        Column(
          children: viewModel.chains.map((chain) {
            // Get token balance by native currency symbol
            final symbol = chain.nativeCurrency.symbol;
            final tokenBalance = viewModel.getTokenBalance(symbol);
            final usdValue = tokenBalance?.usdValue ?? 0.0;
            final amount = tokenBalance?.amount ?? 0.0;

            final balanceText = '${amount.toStringAsFixed(2)} $symbol';
            final usdValueText = viewModel.formatCurrencyToUSD(usdValue);

            // Get asset path or use default
            final assetPath = assetPathMap[chain.symbol] ?? AppAssets.strk;

            return Column(
              children: [
                _buildAssetCard(
                  assetName: chain.name,
                  assetSymbol: symbol,
                  balance: balanceText,
                  usdValue: usdValueText,
                  assetPath: assetPath,
                  isLoading: viewModel.isBusy,
                ),
                const SizedBox(height: 12),
              ],
            );
          }).toList(),
        ),

        const SizedBox(height: 24),

        //_buildRecentTransactionsSection(viewModel)
      ],
    );
  }

  Widget _buildAssetCard({
    required String assetName,
    required String assetSymbol,
    required String balance,
    required String usdValue,
    required String assetPath,
    bool isLoading = false,
  }) {
    return Container(
      width: double.infinity,
      height: 135,
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
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Asset Name Row
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
                        child: Center(
                          child: Container(
                            width: 18,
                            height: 18,
                            child: SvgPicture.asset(
                              assetPath,
                              width: 1,
                              height: 1,
                              fit: assetSymbol == 'FLOW' ? BoxFit.contain : BoxFit.none,
                            ),
                          ),
                        )),
                    const SizedBox(width: 8),
                    Text(
                      assetName,
                      style: GoogleFonts.instrumentSans(
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // Balance Row with loading state
                isLoading
                    ? _buildLoadingSkeleton(width: 200, height: 20)
                    : Row(
                        children: [
                          Flexible(
                            child: Text(
                              balance,
                              style: GoogleFonts.instrumentSans(
                                fontSize: 20,
                                fontWeight: FontWeight.w500,
                                color: const Color(0xFFE2E2E2),
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          SvgPicture.asset(
                            AppAssets.equal,
                            width: 9,
                            height: 9,
                          ),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              usdValue,
                              style: GoogleFonts.instrumentSans(
                                fontSize: 20,
                                fontWeight: FontWeight.w500,
                                color: const Color(0xFFE2E2E2),
                              ),
                              overflow: TextOverflow.ellipsis,
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

  Widget _buildRecentTransactionsSection(DashboardViewModel viewModel) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Column(
          children: [
            // Table Header Row
            Container(
              height: 48,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              decoration: const BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: Color(0xFF262140), width: 1),
                ),
              ),
              child: Row(
                children: [
                  _buildTableHeader('Type', 100),
                  const SizedBox(width: 24),
                  _buildTableHeader('Amount', 100),
                  const SizedBox(width: 24),
                  _buildTableHeader('Sender', 100),
                  const SizedBox(width: 24),
                  _buildTableHeader('Recipient', 100),
                  const SizedBox(width: 24),
                  _buildTableHeader('Status', 87),
                  const SizedBox(width: 24),
                  _buildTableHeader('Date', 100),
                  const SizedBox(width: 24),
                  _buildTableHeader('Action', 53),
                ],
              ),
            ),

            // Transaction Rows - from API
            if (viewModel.isBusy)
              Container(
                height: 200,
                child: const Center(
                  child: CircularProgressIndicator(
                    color: Color(0xFF8024DE),
                  ),
                ),
              )
            else if (viewModel.filteredTransactions.isEmpty)
              Container(
                height: 200,
                child: Center(
                  child: Text(
                    'No transactions found',
                    style: GoogleFonts.instrumentSans(
                      fontSize: 16,
                      fontWeight: FontWeight.w400,
                      color: const Color(0xFF867EA5),
                    ),
                  ),
                ),
              )
            else
              Column(
                children:
                    viewModel.filteredTransactions.asMap().entries.map((entry) {
                  final index = entry.key;
                  final transaction = entry.value;
                  final isLast =
                      index == viewModel.filteredTransactions.length - 1;

                  return _buildTransactionRow(
                    type: transaction.displayType,
                    amount: transaction.formattedUsdValue,
                    sender: transaction.fromAddress,
                    recipient: transaction.toAddress,
                    status: transaction.statusEnum,
                    date: transaction.formattedDate,
                    isLast: isLast,
                    onTap: () => viewModel.openTransactionDetails(transaction),
                  );
                }).toList(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildTableHeader(String text, double width) {
    return SizedBox(
      width: width,
      height: 24,
      child: Text(
        text,
        style: GoogleFonts.instrumentSans(
          fontSize: 16,
          fontWeight: FontWeight.w400,
          height: 24 / 16,
          color: const Color(0xFF867EA5),
        ),
      ),
    );
  }

  Widget _buildTransactionRow({
    required String type,
    required String amount,
    required String sender,
    required String recipient,
    required TransactionStatus status,
    required String date,
    required bool isLast,
    required VoidCallback onTap,
  }) {
    return Container(
      height: 60,
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(
                bottom: BorderSide(color: Color(0xFF262140), width: 1),
              ),
      ),
      child: Row(
        children: [
          // Type
          SizedBox(
            width: 100,
            height: 24,
            child: Text(
              type,
              style: GoogleFonts.instrumentSans(
                fontSize: 16,
                fontWeight: FontWeight.w400,
                height: 24 / 16,
                color: const Color(0xFFE2E2E2),
              ),
            ),
          ),
          const SizedBox(width: 24),

          // Amount
          SizedBox(
            width: 100,
            height: 24,
            child: Text(
              amount,
              style: GoogleFonts.instrumentSans(
                fontSize: 16,
                fontWeight: FontWeight.w400,
                height: 24 / 16,
                color: const Color(0xFF8024DE),
              ),
            ),
          ),
          const SizedBox(width: 24),

          // Sender
          SizedBox(
            width: 100,
            height: 24,
            child: Text(
              sender,
              style: GoogleFonts.instrumentSans(
                fontSize: 16,
                fontWeight: FontWeight.w400,
                height: 24 / 16,
                color: const Color(0xFFE2E2E2),
              ),
            ),
          ),
          const SizedBox(width: 24),

          // Recipient
          SizedBox(
            width: 100,
            height: 24,
            child: Text(
              recipient,
              style: GoogleFonts.instrumentSans(
                fontSize: 16,
                fontWeight: FontWeight.w400,
                height: 24 / 16,
                color: const Color(0xFFE2E2E2),
              ),
            ),
          ),
          const SizedBox(width: 24),

          // Status Badge
          Container(
            width: 87,
            height: 23,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: _getStatusColor(status),
              borderRadius: BorderRadius.circular(48),
            ),
            child: Center(
              child: SizedBox(
                width: 63,
                height: 15,
                child: Text(
                  _getStatusText(status),
                  textAlign: TextAlign.center,
                  style: GoogleFonts.instrumentSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                    height: 15 / 12,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 24),

          // Date
          SizedBox(
            width: 100,
            height: 24,
            child: Text(
              date,
              style: GoogleFonts.instrumentSans(
                fontSize: 16,
                fontWeight: FontWeight.w400,
                height: 24 / 16,
                color: const Color(0xFFE2E2E2),
              ),
            ),
          ),
          const SizedBox(width: 24),

          // Action Icon
          SizedBox(
            width: 53,
            height: 24,
            child: GestureDetector(
              onTap: onTap,
              child: Container(
                width: 24,
                height: 24,
                padding: const EdgeInsets.all(3),
                child: const Icon(
                  Icons.open_in_new,
                  color: Colors.white,
                  size: 18,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(TransactionStatus status) {
    switch (status) {
      case TransactionStatus.completed:
        return const Color(0xFF40996B);
      case TransactionStatus.pending:
        return const Color(0xFFFFA726);
      case TransactionStatus.failed:
        return const Color(0xFFE57373);
    }
  }

  String _getStatusText(TransactionStatus status) {
    switch (status) {
      case TransactionStatus.completed:
        return 'Completed';
      case TransactionStatus.pending:
        return 'Pending';
      case TransactionStatus.failed:
        return 'Failed';
    }
  }

  Widget _buildTransactionFilter(DashboardViewModel viewModel) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title
          Text(
            'Recent Transactions',
            style: GoogleFonts.instrumentSans(
              fontWeight: FontWeight.w500,
              fontSize: 16,
              height: 1.25, // 20px / 16px
              color: const Color(0xFFE2E2E2),
            ),
          ),

          const SizedBox(height: 12),

          // Filter buttons
          Container(
            height: 49,
            decoration: BoxDecoration(
              color: const Color(0xFF130F22),
              borderRadius: BorderRadius.circular(24),
            ),
            padding: const EdgeInsets.all(4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildFilterButton(
                  text: 'All',
                  isSelected: viewModel.selectedFilterIndex == 0,
                  onTap: () => viewModel.selectFilter(0),
                  isFirst: true,
                  isLast: false,
                ),
                _buildFilterButton(
                  text: 'Credit',
                  isSelected: viewModel.selectedFilterIndex == 1,
                  onTap: () => viewModel.selectFilter(1),
                  isFirst: false,
                  isLast: false,
                ),
                _buildFilterButton(
                  text: 'Debit',
                  isSelected: viewModel.selectedFilterIndex == 2,
                  onTap: () => viewModel.selectFilter(2),
                  isFirst: false,
                  isLast: true,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterButton({
    required String text,
    required bool isSelected,
    required VoidCallback onTap,
    required bool isFirst,
    required bool isLast,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 41,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          gradient: isSelected
              ? const LinearGradient(
                  colors: [Color(0xFF674AA6), Color(0xFF2E235C)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                )
              : const LinearGradient(
                  colors: [Color(0xFF181027), Color(0xFF110F20)],
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                ),
          border: isSelected
              ? null
              : Border.all(
                  color: const Color(0xFF262140),
                  width: 1,
                ),
          borderRadius: BorderRadius.horizontal(
            left:
                isFirst ? const Radius.circular(48) : const Radius.circular(4),
            right:
                isLast ? const Radius.circular(48) : const Radius.circular(4),
          ),
        ),
        child: Center(
          child: Text(
            text,
            style: GoogleFonts.instrumentSans(
              fontWeight: FontWeight.w500,
              fontSize: 14,
              height: 17 / 14, // 17px / 14px
              color: const Color(0xFFE2E2E2),
            ),
          ),
        ),
      ),
    );
  }

// Update your builder method to include the filter before the transactions table
// Replace the _buildRecentTransactionsSection call with:

  Widget _buildTransactionsWithFilter(DashboardViewModel viewModel) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildTransactionFilter(viewModel),
        const SizedBox(height: 24),
        _buildRecentTransactionsSection(viewModel),
      ],
    );
  }

  @override
  DashboardViewModel viewModelBuilder(
    BuildContext context,
  ) {
    final viewModel = DashboardViewModel();
    viewModel.initialize();
    return viewModel;
  }
}
