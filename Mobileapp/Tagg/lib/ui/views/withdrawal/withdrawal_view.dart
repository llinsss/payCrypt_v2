import 'package:Tagg/models/user_token_balance.dart';
import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'withdrawal_viewmodel.dart';

class WithdrawalView extends StackedView<WithdrawalViewModel> {
  const WithdrawalView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    WithdrawalViewModel viewModel,
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
                    _buildHeader(viewModel),
                    const SizedBox(height: 24),
                    _buildWithdrawalMethods(viewModel),
                    const SizedBox(height: 24),
                    _buildSelectAsset(viewModel),
                    const SizedBox(height: 24),
                    _buildSlippageCard(viewModel),
                    const SizedBox(height: 24),
                    // Conditionally display recipient widget based on selected method
                    _buildConditionalRecipientWidget(viewModel),
                    const SizedBox(height: 24),
                    _buildFeesBreakdown(viewModel),
                    const SizedBox(height: 24),
                    _buildOverviewCard(),
                    const SizedBox(height: 24),
                    _buildSendButton(context, viewModel),
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

  // New method to conditionally display recipient widgets
  Widget _buildConditionalRecipientWidget(WithdrawalViewModel viewModel) {
    switch (viewModel.selectedWithdrawMethod) {
      case 0: // Withdraw to Tag
        return _buildRecipientTag(viewModel);
      case 1: // Crypto Wallet
        return _buildRecipientAddress(viewModel);
      case 2: // Bank Account
        return _buildRecipientAccount(viewModel);
      default:
        return _buildRecipientTag(viewModel); // Default fallback
    }
  }

  Widget _buildTopNavigation(WithdrawalViewModel viewModel) {
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

  Widget _buildHeader(WithdrawalViewModel viewModel) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          'Withdrawal',
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
              onTap: () {},
            ),
            const SizedBox(width: 12),
            _buildActionButton(
              assetPath: AppAssets.down,
              onTap: () {},
            ),
            const SizedBox(width: 12),
            _buildActionButton(
              assetPath: AppAssets.refresh,
              onTap: () {},
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

  /// ✅ Withdrawal Methods driven by VM
  Widget _buildWithdrawalMethods(WithdrawalViewModel viewModel) {
    return Column(
      children: viewModel.withdrawalMethods.asMap().entries.map((entry) {
        final index = entry.key;
        final method = entry.value;
        final isSelected = viewModel.selectedWithdrawMethod == index;

        return GestureDetector(
          onTap: () => viewModel.setWithdrawMethod(index),
          child: Container(
            width: double.infinity,
            height: 106,
            margin: EdgeInsets.only(
                bottom:
                    index < viewModel.withdrawalMethods.length - 1 ? 12 : 0),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [Color(0xFF181027), Color(0xFF110F20)],
              ),
              border: Border.all(
                color: isSelected
                    ? const Color(0xFF674AA6)
                    : const Color(0xFF262140),
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    color: const Color(0xFF120D1E),
                    border: Border.all(color: const Color(0xFF262140)),
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Center(
                    child: SvgPicture.asset(
                      method.assetPath,
                      width: 20,
                      height: 20,
                    ),
                  ),
                ),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        method.title,
                        style: GoogleFonts.instrumentSans(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        method.subtitle,
                        style: GoogleFonts.instrumentSans(
                          color: Color(0xFF867EA5),
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
        );
      }).toList(),
    );
  }

  Widget _buildSelectAsset(WithdrawalViewModel viewModel) {
    // Map chain symbols to asset paths
    final assetPathMap = {
      'STRK': AppAssets.strk,
      'LSK': AppAssets.lsk,
      'BASE': AppAssets.base,
      'FLOW': AppAssets.flow,
      'U2U': AppAssets.u2u,
    };

    // Build asset buttons dynamically from chains
    final assetButtons = <Widget>[];
    for (var i = 0; i < viewModel.chains.length; i += 2) {
      final chain1 = viewModel.chains[i];
      final chain2 =
          i + 1 < viewModel.chains.length ? viewModel.chains[i + 1] : null;

      assetButtons.add(
        Row(
          children: [
            Expanded(
              child: _buildAssetButton(
                viewModel,
                assetPathMap[chain1.symbol] ?? AppAssets.strk,
                chain1.name,
                chain1.nativeCurrency.symbol,
              ),
            ),
            const SizedBox(width: 12),
            if (chain2 != null)
              Expanded(
                child: _buildAssetButton(
                  viewModel,
                  assetPathMap[chain2.symbol] ?? AppAssets.strk,
                  chain2.name,
                  chain2.nativeCurrency.symbol,
                ),
              )
            else
              Expanded(child: SizedBox()), // Empty space if odd number of chains
          ],
        ),
      );

      if (i + 2 < viewModel.chains.length) {
        assetButtons.add(const SizedBox(height: 20));
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("Select Asset",
            style: GoogleFonts.instrumentSans(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w500)),
        const SizedBox(height: 12),
        ...assetButtons,
      ],
    );
  }

  Widget _buildAssetButton(
    WithdrawalViewModel viewModel,
    String assetPath,
    String name,
    String symbol,
  ) {
    // Find matching balance for this symbol
    UserTokenBalance? balance;
    try {
      balance = viewModel.tokenBalances.firstWhere(
        (b) =>
            b.tokenSymbol.toUpperCase() == symbol.toUpperCase() ||
            b.tokenName.toUpperCase() == name.toUpperCase(),
      );
    } catch (e) {
      // No matching balance found
      balance = null;
    }

    final isSelected =
        balance != null && viewModel.selectedBalance?.id == balance.id;

    return GestureDetector(
      onTap:
          balance != null ? () => viewModel.setSelectedBalance(balance!) : null,
      child: Container(
        height: 58,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF120D1E),
          borderRadius: BorderRadius.circular(100),
          border: Border.all(
            color:
                isSelected ? const Color(0xFF674AA6) : const Color(0xFF262140),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.start,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0xFF120D1E),
                border: Border.all(color: Color(0xFF262140)),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: SvgPicture.asset(
                  assetPath,
                  width: 14,
                  height: 20,
                  fit: symbol == 'FLOW' ? BoxFit.contain : BoxFit.none,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                name,
                style: GoogleFonts.instrumentSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFeesBreakdown(WithdrawalViewModel viewModel) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(top: 24),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title Row
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text("Fees Breakdown",
                style: GoogleFonts.instrumentSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: const Color(0xFFE2E2E2),
                )),
          ),
          const SizedBox(height: 24),

          // Dynamic Rows
          Column(
            children: viewModel.fees.map((fee) {
              final isLast = viewModel.fees.last == fee;
              return Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                decoration: BoxDecoration(
                  border: isLast
                      ? null
                      : const Border(
                          bottom: BorderSide(color: Color(0xFF262140)),
                        ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(fee.label,
                        style: GoogleFonts.instrumentSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: const Color(0xFF867EA5),
                        )),
                    Text(fee.amount,
                        style: GoogleFonts.instrumentSans(
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          color: const Color(0xFFE2E2E2),
                        )),
                  ],
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildOverviewCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(30),
      decoration: BoxDecoration(
        color: const Color(0xFF130F22),
        border: Border.all(color: const Color(0xFF302A4E)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            offset: const Offset(4, 4),
            blurRadius: 30,
          ),
        ],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF999840),
              borderRadius: BorderRadius.circular(48),
            ),
            child: Text(
              "Important",
              style: GoogleFonts.instrumentSans(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: Color(0xFFE2E2E2),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Text lines
          Text(
            "Withdrawals are irreversible once processed",
            style: GoogleFonts.instrumentSans(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Color(0xFFE2E2E2),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            "Make sure you entered the correct tag",
            style: GoogleFonts.instrumentSans(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Color(0xFFE2E2E2),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            "Contact support if you encounter any issues",
            style: GoogleFonts.instrumentSans(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Color(0xFFE2E2E2),
            ),
          ),
        ],
      ),
    );
  }

// Update your _buildSendButton method to pass context to viewModel
  Widget _buildSendButton(BuildContext context, WithdrawalViewModel viewModel) {
    String buttonText;
    switch (viewModel.selectedWithdrawMethod) {
      case 0:
        buttonText = "Send to Tag";
        break;
      case 1:
        buttonText = "Withdraw to Wallet";
        break;
      case 2:
        buttonText = "Withdraw to Bank Account";
        break;
      default:
        buttonText = "Send";
    }

    return GestureDetector(
      onTap: viewModel.isBusy
          ? null
          : () => viewModel.send(
                onSuccess: (message) => _showTransactionResult(
                  context,
                  isSuccess: true,
                  message: message,
                ),
                onError: (message) => _showTransactionResult(
                  context,
                  isSuccess: false,
                  message: message,
                ),
              ),
      child: Container(
        width: double.infinity,
        height: 60,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF674AA6), Color(0xFF2E235C)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
          borderRadius: BorderRadius.circular(48),
        ),
        child: Center(
          child: viewModel.isBusy
              ? const CircularProgressIndicator(color: Colors.white)
              : Text(
                  buttonText,
                  style: GoogleFonts.instrumentSans(
                    color: const Color(0xFFE2E2E2),
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
        ),
      ),
    );
  }

  Widget _buildSlippageCard(WithdrawalViewModel viewModel) {
    return Container(
      width: double.infinity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Name and CTA row
          Container(
            height: 20,
            child: Row(
              children: [
                // Slippage Label
                Text(
                  'Amount',
                  style: GoogleFonts.instrumentSans(
                    fontWeight: FontWeight.w500,
                    fontSize: 16,
                    height: 1.25, // line-height: 20px / font-size: 16px
                    color: Color(0xFFE2E2E2),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12), // gap between sections

          // Percentage section with button
// Percentage section with button
          Container(
            width: double.infinity,
            height: 60,
            decoration: BoxDecoration(
              color: const Color(0xFF120F21),
              border: Border.all(
                color: const Color(0xFF262140),
                width: 2,
              ),
              borderRadius: BorderRadius.circular(48),
            ),
            alignment: Alignment.center,
            child: TextField(
              controller: viewModel.amountController,
              keyboardType: TextInputType.numberWithOptions(decimal: true),
              style: GoogleFonts.instrumentSans(
                fontWeight: FontWeight.w500,
                fontSize: 16,
                color: Colors.white,
              ),
              decoration: InputDecoration(
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
                border: InputBorder.none,
                hintText: "Enter amount",
                hintStyle: GoogleFonts.instrumentSans(
                  fontWeight: FontWeight.w500,
                  fontSize: 16,
                  color: const Color(0xFF867EA5),
                ),
                suffix: GestureDetector(
                  onTap: () => viewModel.setMaxAmount(),
                  child: Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Text(
                      "MAX",
                      style: GoogleFonts.instrumentSans(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          color: Colors.white),
                    ),
                  ),
                ),
              ),
            ),
          ),

          SizedBox(height: 12),
          Row(
            children: [
              Text(
                'Available Balance: ',
                style: GoogleFonts.instrumentSans(
                    fontWeight: FontWeight.w500,
                    fontSize: 16,
                    color: Color(0xFF867EA5)),
              ),
              Text(
                viewModel.selectedBalance != null
                    ? '${viewModel.selectedBalance!.amount.toStringAsFixed(2)} ${viewModel.selectedBalance!.tokenSymbol}'
                    : '0.0',
                style: GoogleFonts.instrumentSans(
                    fontWeight: FontWeight.w500,
                    fontSize: 16,
                    color: Colors.white),
              )
            ],
          )
        ],
      ),
    );
  }

  Widget _buildRecipientTag(WithdrawalViewModel viewModel) {
    return Container(
      width: double.infinity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Name and CTA row
          Container(
            height: 20,
            child: Row(
              children: [
                // Slippage Label
                Text(
                  'Recipient Tag',
                  style: GoogleFonts.instrumentSans(
                    fontWeight: FontWeight.w500,
                    fontSize: 16,
                    height: 1.25, // line-height: 20px / font-size: 16px
                    color: Color(0xFFE2E2E2),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12), // gap between sections

          // Percentage section with button
          Container(
            width: double.infinity,
            height: 60,
            decoration: BoxDecoration(
              color: const Color(0xFF120F21),
              border: Border.all(
                color: const Color(0xFF262140),
                width: 2,
              ),
              borderRadius: BorderRadius.circular(48),
            ),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: TextField(
              controller: viewModel.recipientTagController,
              style: GoogleFonts.instrumentSans(
                fontWeight: FontWeight.w500,
                fontSize: 16,
                color: Colors.white,
              ),
              decoration: InputDecoration(
                border: InputBorder.none,
                hintText: "Enter recipient tag (e.g., uche)",
                hintStyle: GoogleFonts.instrumentSans(
                  fontWeight: FontWeight.w500,
                  fontSize: 16,
                  color: const Color(0xFF867EA5),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecipientAddress(WithdrawalViewModel viewModel) {
    return Container(
      width: double.infinity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Name and CTA row
          Container(
            height: 20,
            child: Row(
              children: [
                // Address Label
                Text(
                  'Recipient Wallet Address',
                  style: GoogleFonts.instrumentSans(
                    fontWeight: FontWeight.w500,
                    fontSize: 16,
                    height: 1.25, // line-height: 20px / font-size: 16px
                    color: Color(0xFFE2E2E2),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12), // gap between sections

          // Address input
          Container(
            width: double.infinity,
            height: 60,
            decoration: BoxDecoration(
              color: const Color(0xFF120F21),
              border: Border.all(
                color: const Color(0xFF262140),
                width: 2,
              ),
              borderRadius: BorderRadius.circular(48),
            ),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: TextField(
              controller: viewModel.walletAddressController,
              style: GoogleFonts.instrumentSans(
                fontWeight: FontWeight.w500,
                fontSize: 16,
                color: Colors.white,
              ),
              decoration: InputDecoration(
                border: InputBorder.none,
                hintText: "Enter wallet address",
                hintStyle: GoogleFonts.instrumentSans(
                  fontWeight: FontWeight.w500,
                  fontSize: 16,
                  color: const Color(0xFF867EA5),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecipientAccount(WithdrawalViewModel viewModel) {
    return Container(
      width: double.infinity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Account Number Label
          Container(
            height: 20,
            child: Row(
              children: [
                Text(
                  'Account Number',
                  style: GoogleFonts.instrumentSans(
                    fontWeight: FontWeight.w500,
                    fontSize: 16,
                    height: 1.25,
                    color: Color(0xFFE2E2E2),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Account Number Input
          Container(
            width: double.infinity,
            height: 60,
            decoration: BoxDecoration(
              color: const Color(0xFF120F21),
              border: Border.all(
                color: const Color(0xFF262140),
                width: 2,
              ),
              borderRadius: BorderRadius.circular(48),
            ),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: TextField(
              controller: viewModel.accountNumberController,
              keyboardType: TextInputType.number,
              style: GoogleFonts.instrumentSans(
                fontWeight: FontWeight.w500,
                fontSize: 16,
                color: Colors.white,
              ),
              decoration: InputDecoration(
                border: InputBorder.none,
                hintText: "Enter account number",
                hintStyle: GoogleFonts.instrumentSans(
                  fontWeight: FontWeight.w500,
                  fontSize: 16,
                  color: const Color(0xFF867EA5),
                ),
              ),
            ),
          ),

          const SizedBox(height: 12),

          // Bank Selection
          GestureDetector(
            onTap: () {
              print('Bank selection tapped');
            },
            child: Container(
              width: double.infinity,
              height: 60,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              decoration: BoxDecoration(
                color: Color(0xFF120F21),
                border: Border.all(
                  color: Color(0xFF262140),
                  width: 2,
                ),
                borderRadius: BorderRadius.circular(48),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Select Bank',
                    style: GoogleFonts.instrumentSans(
                      fontWeight: FontWeight.w500,
                      fontSize: 16,
                      height: 1.25,
                      color: Color(0xFF867EA5),
                    ),
                  ),
                  Icon(
                    Icons.keyboard_arrow_down,
                    color: Color(0xFF867EA5),
                    size: 20,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTransactionResultBottomSheet(
    BuildContext context, {
    required bool isSuccess,
    required String message,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(
        color: const Color(0xFF090715),
        border: Border.all(
          color: const Color(0xFF262140),
          width: 1,
        ),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(12),
          topRight: Radius.circular(12),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Check/Error icon container
          Container(
            width: 80,
            height: 80,
            padding: const EdgeInsets.all(13.7143),
            decoration: BoxDecoration(
              color:
                  isSuccess ? const Color(0xFF00D084) : const Color(0xFFE74C3C),
              borderRadius: BorderRadius.circular(571.429),
            ),
            child: Center(
              child: Icon(
                isSuccess ? Icons.check : Icons.close,
                color: Colors.white,
                size: 32,
              ),
            ),
          ),

          const SizedBox(height: 40),

          // Text
          Text(
            message,
            textAlign: TextAlign.center,
            style: GoogleFonts.instrumentSans(
              fontWeight: FontWeight.w500,
              fontSize: 18,
              height: 1.22,
              color: const Color(0xFFE2E2E2),
            ),
          ),

          const SizedBox(height: 24),

          // Close button
          GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            child: Container(
              width: double.infinity,
              height: 48,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF674AA6), Color(0xFF2E235C)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
                borderRadius: BorderRadius.circular(48),
              ),
              child: Center(
                child: Text(
                  'Close',
                  style: GoogleFonts.instrumentSans(
                    color: const Color(0xFFE2E2E2),
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

// Method to show the bottom sheet
  void _showTransactionResult(
    BuildContext context, {
    required bool isSuccess,
    required String message,
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isDismissible: false,
      enableDrag: false,
      builder: (context) => _buildTransactionResultBottomSheet(
        context,
        isSuccess: isSuccess,
        message: message,
      ),
    );
  }

  @override
  WithdrawalViewModel viewModelBuilder(
    BuildContext context,
  ) =>
      WithdrawalViewModel();

  @override
  void onViewModelReady(WithdrawalViewModel viewModel) {
    viewModel.initialize();
    super.onViewModelReady(viewModel);
  }
}
