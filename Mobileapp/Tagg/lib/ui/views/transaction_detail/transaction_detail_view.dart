import 'package:Tagg/models/transaction_model.dart';
import 'package:Tagg/ui/common/app_colors.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';
import 'package:intl/intl.dart';
import 'transaction_detail_viewmodel.dart';

class TransactionDetailView
    extends StackedView<TransactionDetailViewModel> {
  final String transactionId;
  const TransactionDetailView({Key? key, required this.transactionId})
      : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    TransactionDetailViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      appBar: AppBar(
        backgroundColor: const Color(0xFF090715),
        title: Text(
          'Transaction Details',
          style: GoogleFonts.instrumentSans(
            fontWeight: FontWeight.w500,
            fontSize: 18,
            color: Colors.white,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFFE2E2E2)),
          onPressed: () => viewModel.navigateBack(),
        ),
      ),
      body: _buildBody(viewModel),
    );
  }

  Widget _buildBody(TransactionDetailViewModel viewModel) {
    if (viewModel.isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF00D084)),
      );
    }

    if (viewModel.hasError) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline,
                  color: Color(0xFFE2E2E2), size: 48),
              const SizedBox(height: 16),
              Text(
                'Failed to load transaction',
                style: GoogleFonts.instrumentSans(
                  fontWeight: FontWeight.w500,
                  fontSize: 16,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => viewModel.initialize(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00D084),
                ),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final tx = viewModel.transaction;
    if (tx == null) {
      return const Center(
        child: Text(
          'Transaction not found',
          style: TextStyle(color: Color(0xFFE2E2E2)),
        ),
      );
    }

    final dateFormat = DateFormat('MMM dd, yyyy HH:mm');
    final date = tx.timestamp.isNotEmpty
        ? dateFormat.format(DateTime.parse(tx.timestamp))
        : 'N/A';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildStatusCard(tx),
          const SizedBox(height: 24),
          _buildDetailRow('Reference', tx.reference),
          _buildDetailRow('Type', tx.type.toUpperCase()),
          _buildDetailRow('Status', tx.status.toUpperCase()),
          _buildDetailRow('Amount', '${tx.amount} ${tx.tokenSymbol}'),
          _buildDetailRow('USD Value', '\$${tx.usdValue}'),
          _buildDetailRow('Date', date),
          _buildDetailRow('From', tx.fromAddress),
          _buildDetailRow('To', tx.toAddress),
          if (tx.description != null && tx.description!.isNotEmpty)
            _buildDetailRow('Description', tx.description!),
          if (tx.txHash != null && tx.txHash!.isNotEmpty)
            _buildDetailRow('Tx Hash', tx.txHash!),
        ],
      ),
    );
  }

  Widget _buildStatusCard(Transaction tx) {
    final isCompleted = tx.status == 'completed';
    final isPending = tx.status == 'pending';
    final isFailed = tx.status == 'failed';

    Color statusColor;
    String statusIcon;
    if (isCompleted) {
      statusColor = const Color(0xFF00D084);
      statusIcon = '✓';
    } else if (isPending) {
      statusColor = const Color(0xFFFFA500);
      statusIcon = '⏳';
    } else if (isFailed) {
      statusColor = const Color(0xFFFF4444);
      statusIcon = '✗';
    } else {
      statusColor = const Color(0xFF867EA5);
      statusIcon = '•';
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF130F22),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: statusColor.withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.15),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                statusIcon,
                style: TextStyle(fontSize: 24, color: statusColor),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            '${tx.amount} ${tx.tokenSymbol}',
            style: GoogleFonts.instrumentSans(
              fontWeight: FontWeight.w600,
              fontSize: 24,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            tx.type == 'credit' ? 'Payment Received' : 'Payment Sent',
            style: GoogleFonts.instrumentSans(
              fontWeight: FontWeight.w400,
              fontSize: 14,
              color: const Color(0xFF867EA5),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: GoogleFonts.manrope(
                fontWeight: FontWeight.w400,
                fontSize: 13,
                color: const Color(0xFF867EA5),
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.manrope(
                fontWeight: FontWeight.w500,
                fontSize: 13,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  TransactionDetailViewModel viewModelBuilder(BuildContext context) =>
      TransactionDetailViewModel(transactionId: transactionId);

  @override
  void onViewModelReady(TransactionDetailViewModel viewModel) {
    viewModel.initialize();
  }
}
