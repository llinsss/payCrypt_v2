import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';
import 'withdrawal_status_viewmodel.dart';

class WithdrawalStatusView extends StackedView<WithdrawalStatusViewModel> {
  const WithdrawalStatusView({Key? key}) : super(key: key);

  @override
  Widget builder(BuildContext context, WithdrawalStatusViewModel viewModel, Widget? child) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Withdrawal Status', style: GoogleFonts.instrumentSans(fontSize: 24, fontWeight: FontWeight.w600, color: Colors.white)),
              const SizedBox(height: 24),
              _buildProgressSteps(viewModel),
              const SizedBox(height: 24),
              if (viewModel.isTerminalState)
                _buildFinalState(viewModel)
              else
                _buildPendingState(viewModel),
              const Spacer(),
              if (viewModel.isFailed)
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: viewModel.retry,
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF674AA6)),
                    child: const Text('Try Again'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProgressSteps(WithdrawalStatusViewModel viewModel) {
    final steps = ['Submitted', 'Processing', 'Sent to Bank', 'Completed'];
    final currentIndex = viewModel.currentStepIndex;
    return Column(
      children: List.generate(steps.length, (index) {
        final completed = index <= currentIndex;
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: completed ? const Color(0xFF181027) : const Color(0xFF120D1E),
            border: Border.all(color: completed ? const Color(0xFF674AA6) : const Color(0xFF262140)),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(completed ? Icons.check_circle : Icons.radio_button_unchecked, color: completed ? Colors.white : const Color(0xFF867EA5)),
              const SizedBox(width: 12),
              Text(steps[index], style: GoogleFonts.instrumentSans(fontSize: 16, color: Colors.white)),
            ],
          ),
        );
      }),
    );
  }

  Widget _buildPendingState(WithdrawalStatusViewModel viewModel) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: const Color(0xFF120D1E), borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Your withdrawal is on the way', style: GoogleFonts.instrumentSans(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white)),
          const SizedBox(height: 8),
          Text('We are checking the latest bank transfer status. This usually updates every 10 seconds.', style: GoogleFonts.instrumentSans(fontSize: 14, color: const Color(0xFF867EA5))),
        ],
      ),
    );
  }

  Widget _buildFinalState(WithdrawalStatusViewModel viewModel) {
    if (viewModel.isFailed) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: const Color(0xFF1F1111), borderRadius: BorderRadius.circular(16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Withdrawal failed', style: GoogleFonts.instrumentSans(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white)),
            const SizedBox(height: 8),
            Text(viewModel.failureMessage, style: GoogleFonts.instrumentSans(fontSize: 14, color: const Color(0xFF867EA5))),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: const Color(0xFF11251A), borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Withdrawal completed', style: GoogleFonts.instrumentSans(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white)),
          const SizedBox(height: 8),
          Text('Bank: ${viewModel.bankName}', style: GoogleFonts.instrumentSans(fontSize: 14, color: const Color(0xFF867EA5))),
          const SizedBox(height: 4),
          Text('Amount: ${viewModel.amount}', style: GoogleFonts.instrumentSans(fontSize: 14, color: const Color(0xFF867EA5))),
          const SizedBox(height: 4),
          Text('Reference: ${viewModel.reference}', style: GoogleFonts.instrumentSans(fontSize: 14, color: const Color(0xFF867EA5))),
        ],
      ),
    );
  }

  @override
  WithdrawalStatusViewModel viewModelBuilder(BuildContext context) => WithdrawalStatusViewModel();

  @override
  void onViewModelReady(WithdrawalStatusViewModel viewModel) {
    viewModel.initialize();
    super.onViewModelReady(viewModel);
  }
}
