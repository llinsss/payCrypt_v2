import 'dart:convert';

import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';
import 'package:Tagg/ui/views/transaction_detail/transaction_detail_viewmodel.dart';
import 'package:Tagg/models/transaction_model.dart';

class TransactionDetailView extends StackedView<TransactionDetailViewModel> {
  final int transactionId;

  const TransactionDetailView({Key? key, required this.transactionId}) : super(key: key);

  @override
  Widget builder(BuildContext context, TransactionDetailViewModel viewModel, Widget? child) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      body: SafeArea(
        child: Column(
          children: [
            _buildTopNavigation(viewModel),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: viewModel.isLoading
                    ? const Center(child: CircularProgressIndicator(color: Color(0xFF8024DE)))
                    : viewModel.transaction == null
                        ? const Center(child: Text('Transaction not found', style: TextStyle(color: Colors.white)))
                        : _buildTransactionDetails(viewModel.transaction!, viewModel),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopNavigation(TransactionDetailViewModel viewModel) {
    return Container(
      height: 64,
      decoration: const BoxDecoration(
        color: Color(0xFF090715),
        border: Border(bottom: BorderSide(color: Color(0xFF262140), width: 1)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: viewModel.goBack,
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: const Color(0xFF130F22),
                    border: Border.all(color: const Color(0xFF262140)),
                    borderRadius: BorderRadius.circular(48),
                  ),
                  child: const Icon(Icons.arrow_back, color: Color(0xFFE2E2E2), size: 18),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                'Transaction Details',
                style: GoogleFonts.instrumentSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w500,
                  color: const Color(0xFFE2E2E2),
                ),
              ),
            ],
          ),
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: const Color(0xFF130F22),
              border: Border.all(color: Colors.white),
              borderRadius: BorderRadius.circular(48),
            ),
            child: Image.asset(AppAssets.profile),
          ),
        ],
      ),
    );
  }

  Widget _buildTransactionDetails(Transaction transaction, TransactionDetailViewModel viewModel) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildAmountSection(transaction),
        const SizedBox(height: 24),
        _buildInfoRow('Status', _capitalize(transaction.status), _getStatusColor(transaction.statusEnum)),
        _buildInfoRow('Date', transaction.formattedDate),
        _buildInfoRow('Type', transaction.displayType),
        _buildInfoRow('Amount', transaction.formattedAmount),
        _buildInfoRow('USD Value', transaction.formattedUsdValue),
        _buildInfoRow('Token', '${transaction.tokenName} (${transaction.tokenSymbol})'),
        if (transaction.chainName != null)
          _buildInfoRow('Chain', transaction.chainName!),
        _buildInfoRow('Fees', transaction.fee ?? 'N/A'),
        _buildCopyableRow('Transaction Hash', transaction.txHash ?? 'N/A', () {
          if (transaction.txHash != null) {
            viewModel.copyToClipboard(transaction.txHash!, 'Transaction Hash');
          }
        }),
        _buildCopyableRow('From', transaction.fromAddress, () {
          viewModel.copyToClipboard(transaction.fromAddress, 'From Address');
        }),
        _buildCopyableRow('To', transaction.toAddress, () {
          viewModel.copyToClipboard(transaction.toAddress, 'To Address');
        }),
        _buildCopyableRow('Sender Tag', transaction.userTag, () {
          viewModel.copyToClipboard(transaction.userTag, 'Sender Tag');
        }),
        if (transaction.receiverTag != null && transaction.receiverTag!.isNotEmpty)
          _buildCopyableRow('Receiver Tag', transaction.receiverTag!, () {
            viewModel.copyToClipboard(transaction.receiverTag!, 'Receiver Tag');
          }),
        if ((transaction.notes ?? transaction.description) != null)
          _buildInfoRow('Notes', transaction.notes ?? transaction.description!),
        if (transaction.metadata != null)
          _buildInfoRow('Metadata', _formatMetadata(transaction.metadata)),
        _buildInfoRow('Reference', transaction.reference),
        const SizedBox(height: 24),
        if (transaction.explorerLink != null && transaction.explorerLink!.isNotEmpty)
          _buildExplorerButton(viewModel),
      ],
    );
  }

  Widget _buildAmountSection(Transaction transaction) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF181027), Color(0xFF110F20)],
        ),
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: const Color(0xFF120D1E),
              border: Border.all(color: const Color(0xFF262140)),
              borderRadius: BorderRadius.circular(100),
            ),
            child: _buildAssetIcon(transaction.tokenSymbol),
          ),
          const SizedBox(height: 12),
          Text(
            transaction.formattedAmount,
            style: GoogleFonts.instrumentSans(
              fontSize: 32,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            transaction.formattedUsdValue,
            style: GoogleFonts.instrumentSans(
              fontSize: 16,
              fontWeight: FontWeight.w400,
              color: const Color(0xFF867EA5),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAssetIcon(String symbol) {
    String assetPath;
    switch (symbol.toUpperCase()) {
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
        break;
      case 'U2U':
        assetPath = AppAssets.u2u;
        break;
      default:
        assetPath = AppAssets.strk;
    }
    return SvgPicture.asset(
      assetPath,
      fit: symbol.toUpperCase() == 'FLOW' ? BoxFit.contain : BoxFit.none,
    );
  }

  Widget _buildInfoRow(String label, String value, [Color? valueColor]) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFF262140), width: 1)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GoogleFonts.instrumentSans(
              fontSize: 14,
              fontWeight: FontWeight.w400,
              color: const Color(0xFF867EA5),
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: GoogleFonts.instrumentSans(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                color: valueColor ?? const Color(0xFFE2E2E2),
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCopyableRow(String label, String value, VoidCallback onCopy) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFF262140), width: 1)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GoogleFonts.instrumentSans(
              fontSize: 14,
              fontWeight: FontWeight.w400,
              color: const Color(0xFF867EA5),
            ),
          ),
          Row(
            children: [
              Flexible(
                child: Text(
                  value,
                  textAlign: TextAlign.right,
                  style: GoogleFonts.instrumentSans(
                    fontSize: 14,
                    fontWeight: FontWeight.w400,
                    color: const Color(0xFFE2E2E2),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: onCopy,
                child: const Icon(Icons.copy, color: Color(0xFF867EA5), size: 18),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildExplorerButton(TransactionDetailViewModel viewModel) {
    return GestureDetector(
      onTap: viewModel.openInExplorer,
      child: Container(
        width: double.infinity,
        height: 56,
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
            'View on Explorer',
            style: GoogleFonts.instrumentSans(
              fontSize: 16,
              fontWeight: FontWeight.w500,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }

  String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1).toLowerCase();
  }

  String _formatMetadata(dynamic metadata) {
    if (metadata is String) return metadata;
    try {
      return const JsonEncoder.withIndent('  ').convert(metadata);
    } catch (_) {
      return metadata.toString();
    }
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

  @override
  TransactionDetailViewModel viewModelBuilder(BuildContext context) {
    final viewModel = TransactionDetailViewModel();
    viewModel.initialize(transactionId);
    return viewModel;
  }
}
