import 'package:Tagg/models/scheduled_payment_model.dart';
import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'scheduled_payments_viewmodel.dart';

class ScheduledPaymentsView extends StackedView<ScheduledPaymentsViewModel> {
  const ScheduledPaymentsView({Key? key}) : super(key: key);

  @override
  Widget builder(BuildContext context, ScheduledPaymentsViewModel viewModel, Widget? child) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      body: SafeArea(
        child: Column(
          children: [
            _buildTopNavigation(viewModel),
            Expanded(
              child: viewModel.isBusy
                  ? const Center(child: CircularProgressIndicator(color: Color(0xFF674AA6)))
                  : viewModel.hasPayments ? _buildPaymentsList(viewModel) : _buildEmptyState(viewModel),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopNavigation(ScheduledPaymentsViewModel viewModel) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF090715).withOpacity(0.1),
        borderRadius: const BorderRadius.only(bottomLeft: Radius.circular(5), bottomRight: Radius.circular(5)),
      ),
      child: Column(
        children: [
          Container(
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
                    SvgPicture.asset(AppAssets.log, height: 29, width: 29),
                    const SizedBox(width: 6),
                    Text("Tagged", style: GoogleFonts.inter(fontStyle: FontStyle.italic, fontWeight: FontWeight.w700, fontSize: 16.24, color: Colors.white)),
                  ],
                ),
                Text("Scheduled Payments", style: GoogleFonts.instrumentSans(fontWeight: FontWeight.w600, fontSize: 16, color: Color(0xFFE2E2E2))),
                const SizedBox(width: 35),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentsList(ScheduledPaymentsViewModel viewModel) {
    final activePayments = viewModel.activePayments;
    final completedPayments = viewModel.completedPayments;
    return RefreshIndicator(
      onRefresh: () => viewModel.loadScheduledPayments(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (activePayments.isNotEmpty) ...[
            Text('Active Payments', style: GoogleFonts.instrumentSans(fontWeight: FontWeight.w600, fontSize: 18, color: Colors.white)),
            const SizedBox(height: 12),
            ...activePayments.map((p) => _buildPaymentCard(p, viewModel)),
            const SizedBox(height: 24),
          ],
          if (completedPayments.isNotEmpty) ...[
            Text('Past Payments', style: GoogleFonts.instrumentSans(fontWeight: FontWeight.w600, fontSize: 18, color: Color(0xFF867EA5))),
            const SizedBox(height: 12),
            ...completedPayments.map((p) => _buildPaymentCard(p, viewModel)),
          ],
        ],
      ),
    );
  }

  Widget _buildPaymentCard(ScheduledPayment payment, ScheduledPaymentsViewModel viewModel) {
    final isActive = payment.isActive;
    final statusColor = isActive ? const Color(0xFF00EF8B) : payment.status == 'cancelled' ? const Color(0xFFFC7171) : const Color(0xFF867EA5);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(begin: Alignment.centerLeft, end: Alignment.centerRight, colors: [Color(0xFF181027), Color(0xFF110F20)]),
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(8),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('To @${payment.recipientTag}', style: GoogleFonts.instrumentSans(fontWeight: FontWeight.w600, fontSize: 16, color: Colors.white)),
            const SizedBox(height: 4),
            Text(payment.formattedAmount, style: GoogleFonts.instrumentSans(fontWeight: FontWeight.w500, fontSize: 14, color: Color(0xFFE2E2E2))),
          ])),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: statusColor.withOpacity(0.15), borderRadius: BorderRadius.circular(12), border: Border.all(color: statusColor.withOpacity(0.3))),
            child: Text(payment.status.toUpperCase(), style: GoogleFonts.instrumentSans(fontSize: 11, fontWeight: FontWeight.w600, color: statusColor)),
          ),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          _buildInfoChip(Icons.repeat, payment.formattedFrequency),
          const SizedBox(width: 8),
          _buildInfoChip(Icons.calendar_today, payment.formattedNextRun),
        ]),
        if (payment.memo != null && payment.memo!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(payment.memo!, style: GoogleFonts.instrumentSans(fontSize: 12, color: Color(0xFF867EA5), fontStyle: FontStyle.italic)),
        ],
        if (payment.isCancellable) ...[
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => viewModel.cancelPayment(payment),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: const Color(0xFFFC7171).withOpacity(0.15), borderRadius: BorderRadius.circular(4), border: Border.all(color: const Color(0xFFFC7171).withOpacity(0.3))),
              child: Text('Cancel', style: GoogleFonts.instrumentSans(fontSize: 12, fontWeight: FontWeight.w500, color: Color(0xFFFC7171))),
            ),
          ),
        ],
      ]),
    );
  }

  Widget _buildInfoChip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: const Color(0xFF120D1E), borderRadius: BorderRadius.circular(4), border: Border.all(color: const Color(0xFF262140))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: const Color(0xFF867EA5)),
        const SizedBox(width: 4),
        Text(label, style: GoogleFonts.instrumentSans(fontSize: 11, color: Color(0xFF867EA5))),
      ]),
    );
  }

  Widget _buildEmptyState(ScheduledPaymentsViewModel viewModel) {
    return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(Icons.schedule_send, size: 64, color: const Color(0xFF867EA5).withOpacity(0.5)),
      const SizedBox(height: 16),
      Text('No Scheduled Payments', style: GoogleFonts.instrumentSans(fontWeight: FontWeight.w600, fontSize: 18, color: Colors.white)),
      const SizedBox(height: 8),
      Text('Schedule a payment from the send flow\nto see it here', textAlign: TextAlign.center, style: GoogleFonts.instrumentSans(fontSize: 14, color: Color(0xFF867EA5))),
      const SizedBox(height: 24),
      GestureDetector(
        onTap: () => viewModel.loadScheduledPayments(),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFF674AA6), Color(0xFF2E235C)]), borderRadius: BorderRadius.circular(48)),
          child: Text('Refresh', style: GoogleFonts.instrumentSans(fontWeight: FontWeight.w500, fontSize: 14, color: Colors.white)),
        ),
      ),
    ]));
  }

  @override
  ScheduledPaymentsViewModel viewModelBuilder(BuildContext context) {
    final viewModel = ScheduledPaymentsViewModel();
    viewModel.initialize();
    return viewModel;
  }
}
