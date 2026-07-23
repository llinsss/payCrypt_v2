import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'package:Tagg/models/batch_payment_models.dart';
import 'batch_payment_viewmodel.dart';

// ─── palette constants ────────────────────────────────────────────────────────
const _kBg = Color(0xFF090715);
const _kCard = Color(0xFF130F22);
const _kBorder = Color(0xFF262140);
const _kAccentStart = Color(0xFF674AA6);
const _kAccentEnd = Color(0xFF2E235C);
const _kTextPrimary = Color(0xFFE2E2E2);
const _kTextMuted = Color(0xFF867EA5);
const _kSuccess = Color(0xFF22C55E);
const _kError = Color(0xFFEF4444);
const _kWarning = Color(0xFFF59E0B);

// ─── entry point ─────────────────────────────────────────────────────────────
class BatchPaymentView extends StackedView<BatchPaymentViewModel> {
  const BatchPaymentView({Key? key}) : super(key: key);

  @override
  BatchPaymentViewModel viewModelBuilder(BuildContext context) =>
      BatchPaymentViewModel();

  @override
  void onViewModelReady(BatchPaymentViewModel viewModel) =>
      viewModel.initialize();

  @override
  Widget builder(
    BuildContext context,
    BatchPaymentViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: _kBg,
      body: SafeArea(
        child: Column(
          children: [
            _TopBar(viewModel: viewModel),
            _StepIndicator(step: viewModel.step),
            Expanded(
              child: _stepBody(context, viewModel),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stepBody(BuildContext context, BatchPaymentViewModel vm) {
    switch (vm.step) {
      case BatchStep.addRecipients:
        return _AddRecipientsStep(viewModel: vm);
      case BatchStep.review:
        return _ReviewStep(viewModel: vm);
      case BatchStep.progress:
        return _ProgressStep(viewModel: vm);
    }
  }
}

// ─── top navigation bar ───────────────────────────────────────────────────────
class _TopBar extends StatelessWidget {
  const _TopBar({required this.viewModel});
  final BatchPaymentViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      decoration: const BoxDecoration(
        color: _kBg,
        border: Border(bottom: BorderSide(color: _kBorder, width: 1)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      child: Row(
        children: [
          GestureDetector(
            onTap: viewModel.navigateBack,
            child: const Icon(Icons.arrow_back_ios_new,
                color: _kTextPrimary, size: 20),
          ),
          const SizedBox(width: 12),
          Text(
            'Batch Payment',
            style: GoogleFonts.instrumentSans(
              color: _kTextPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                  colors: [_kAccentStart, _kAccentEnd]),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              '${viewModel.recipientCount}/${BatchPaymentViewModel.maxRecipients}',
              style: GoogleFonts.instrumentSans(
                  color: _kTextPrimary, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── step indicator ───────────────────────────────────────────────────────────
class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.step});
  final BatchStep step;

  @override
  Widget build(BuildContext context) {
    final labels = ['Add Recipients', 'Review', 'Processing'];
    final current = step.index;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
      color: _kCard,
      child: Row(
        children: List.generate(labels.length * 2 - 1, (i) {
          if (i.isOdd) {
            // connector line
            final filled = (i ~/ 2) < current;
            return Expanded(
              child: Container(
                height: 2,
                color: filled ? _kAccentStart : _kBorder,
              ),
            );
          }
          final idx = i ~/ 2;
          final active = idx == current;
          final done = idx < current;
          return Column(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: (active || done)
                      ? const LinearGradient(
                          colors: [_kAccentStart, _kAccentEnd])
                      : null,
                  color: (active || done) ? null : _kBorder,
                ),
                child: Center(
                  child: done
                      ? const Icon(Icons.check, color: Colors.white, size: 14)
                      : Text(
                          '${idx + 1}',
                          style: GoogleFonts.instrumentSans(
                            color: active ? Colors.white : _kTextMuted,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                labels[idx],
                style: GoogleFonts.instrumentSans(
                  color: active ? _kTextPrimary : _kTextMuted,
                  fontSize: 10,
                ),
              ),
            ],
          );
        }),
      ),
    );
  }
}

// ─── shared helpers ───────────────────────────────────────────────────────────
Widget _sectionLabel(String text) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: GoogleFonts.instrumentSans(
          color: _kTextMuted,
          fontSize: 12,
          fontWeight: FontWeight.w500,
          letterSpacing: 0.5,
        ),
      ),
    );

Widget _card({required Widget child, EdgeInsets? padding}) => Container(
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _kCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorder),
      ),
      child: child,
    );

InputDecoration _inputDecoration(String hint, {Widget? suffix}) =>
    InputDecoration(
      hintText: hint,
      hintStyle: GoogleFonts.instrumentSans(color: _kTextMuted, fontSize: 14),
      filled: true,
      fillColor: const Color(0xFF120D1E),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: _kBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: _kBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: _kAccentStart),
      ),
      suffixIcon: suffix,
    );

Widget _gradientButton({
  required String label,
  required VoidCallback onTap,
  bool enabled = true,
  IconData? icon,
}) =>
    GestureDetector(
      onTap: enabled ? onTap : null,
      child: AnimatedOpacity(
        opacity: enabled ? 1.0 : 0.5,
        duration: const Duration(milliseconds: 200),
        child: Container(
          width: double.infinity,
          height: 52,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
                colors: [_kAccentStart, _kAccentEnd]),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, color: Colors.white, size: 18),
                const SizedBox(width: 8),
              ],
              Text(
                label,
                style: GoogleFonts.instrumentSans(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );

// ─── Step 1 : Add Recipients ──────────────────────────────────────────────────
class _AddRecipientsStep extends StatelessWidget {
  const _AddRecipientsStep({required this.viewModel});
  final BatchPaymentViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── asset selector ──────────────────────────────────────────────
          _sectionLabel('SELECT ASSET'),
          _card(
            child: viewModel.chains.isEmpty
                ? Text('Loading assets…',
                    style: GoogleFonts.instrumentSans(color: _kTextMuted))
                : DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      dropdownColor: _kCard,
                      value: viewModel.selectedAsset.isEmpty
                          ? null
                          : viewModel.selectedAsset,
                      isExpanded: true,
                      hint: Text('Choose asset',
                          style: GoogleFonts.instrumentSans(
                              color: _kTextMuted)),
                      items: viewModel.chains
                          .map((c) => DropdownMenuItem(
                                value: c.nativeCurrency.symbol,
                                child: Text(
                                  '${c.name} (${c.nativeCurrency.symbol})',
                                  style: GoogleFonts.instrumentSans(
                                      color: _kTextPrimary),
                                ),
                              ))
                          .toList(),
                      onChanged: (v) {
                        if (v != null) viewModel.setSelectedAsset(v);
                      },
                      icon: const Icon(Icons.keyboard_arrow_down,
                          color: _kTextMuted),
                    ),
                  ),
          ),
          const SizedBox(height: 20),

          // ── add recipient form ──────────────────────────────────────────
          _sectionLabel('ADD RECIPIENT'),
          _card(
            child: Column(
              children: [
                // tag
                TextField(
                  controller: viewModel.tagController,
                  style: GoogleFonts.instrumentSans(color: _kTextPrimary),
                  decoration: _inputDecoration('@tag'),
                ),
                const SizedBox(height: 10),
                // amount
                TextField(
                  controller: viewModel.amountController,
                  keyboardType: const TextInputType.numberWithOptions(
                      decimal: true),
                  style: GoogleFonts.instrumentSans(color: _kTextPrimary),
                  decoration: _inputDecoration(
                    'Amount',
                    suffix: viewModel.selectedAsset.isNotEmpty
                        ? Padding(
                            padding: const EdgeInsets.only(right: 12),
                            child: Text(
                              viewModel.selectedAsset,
                              style: GoogleFonts.instrumentSans(
                                  color: _kTextMuted, fontSize: 13),
                            ),
                          )
                        : null,
                  ),
                ),
                const SizedBox(height: 10),
                // memo (optional)
                TextField(
                  controller: viewModel.memoController,
                  style: GoogleFonts.instrumentSans(color: _kTextPrimary),
                  decoration: _inputDecoration('Memo (optional)'),
                ),
                if (viewModel.formError != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    viewModel.formError!,
                    style: GoogleFonts.instrumentSans(
                        color: _kError, fontSize: 12),
                  ),
                ],
                const SizedBox(height: 14),
                _gradientButton(
                  label: 'Add Recipient',
                  icon: Icons.add,
                  onTap: () => viewModel.addRecipient(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ── csv import ──────────────────────────────────────────────────
          GestureDetector(
            onTap: viewModel.importFromCsv,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                border: Border.all(color: _kAccentStart),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.upload_file,
                      color: _kAccentStart, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Import from CSV',
                    style: GoogleFonts.instrumentSans(
                      color: _kAccentStart,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (viewModel.csvError != null) ...[
            const SizedBox(height: 6),
            Text(
              viewModel.csvError!,
              style:
                  GoogleFonts.instrumentSans(color: _kError, fontSize: 12),
            ),
          ],
          const SizedBox(height: 6),
          Text(
            'CSV columns: tag, amount, asset (optional), memo (optional)',
            style:
                GoogleFonts.instrumentSans(color: _kTextMuted, fontSize: 11),
          ),
          const SizedBox(height: 24),

          // ── recipient list ──────────────────────────────────────────────
          if (viewModel.recipients.isNotEmpty) ...[
            _sectionLabel(
                'RECIPIENTS  (${viewModel.recipientCount}/${BatchPaymentViewModel.maxRecipients})'),
            ...List.generate(viewModel.recipients.length, (i) {
              final r = viewModel.recipients[i];
              return _RecipientTile(
                entry: r,
                index: i,
                onRemove: () => viewModel.removeRecipient(i),
              );
            }),
            const SizedBox(height: 20),
          ],

          // ── proceed button ──────────────────────────────────────────────
          _gradientButton(
            label: 'Review Batch',
            icon: Icons.arrow_forward,
            onTap: () => viewModel.proceedToReview(),
            enabled: viewModel.recipients.isNotEmpty,
          ),
        ],
      ),
    );
  }
}

// ─── recipient tile ───────────────────────────────────────────────────────────
class _RecipientTile extends StatelessWidget {
  const _RecipientTile({
    required this.entry,
    required this.index,
    required this.onRemove,
  });
  final BatchPaymentEntry entry;
  final int index;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: _kCard,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _kBorder),
      ),
      child: Row(
        children: [
          // index badge
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: _kBorder,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Center(
              child: Text(
                '${index + 1}',
                style: GoogleFonts.instrumentSans(
                    color: _kTextMuted, fontSize: 12),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.recipientTag,
                  style: GoogleFonts.instrumentSans(
                    color: _kTextPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (entry.memo != null && entry.memo!.isNotEmpty)
                  Text(
                    entry.memo!,
                    style: GoogleFonts.instrumentSans(
                        color: _kTextMuted, fontSize: 11),
                  ),
              ],
            ),
          ),
          Text(
            '${entry.amount.toStringAsFixed(entry.amount.truncateToDouble() == entry.amount ? 0 : 4)} ${entry.asset}',
            style: GoogleFonts.instrumentSans(
              color: _kTextPrimary,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
            onTap: onRemove,
            child: const Icon(Icons.close, color: _kError, size: 18),
          ),
        ],
      ),
    );
  }
}

// ─── Step 2 : Review ──────────────────────────────────────────────────────────
class _ReviewStep extends StatelessWidget {
  const _ReviewStep({required this.viewModel});
  final BatchPaymentViewModel viewModel;

  @override
  Widget build(BuildContext ctx) {
    final total = viewModel.totalAmount;
    final asset = viewModel.selectedAsset;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── summary card ────────────────────────────────────────────────
          _card(
            child: Column(
              children: [
                _summaryRow('Recipients',
                    '${viewModel.recipientCount}/${BatchPaymentViewModel.maxRecipients}'),
                const Divider(color: _kBorder, height: 20),
                _summaryRow(
                  'Total Amount',
                  '${total.toStringAsFixed(total.truncateToDouble() == total ? 0 : 4)} $asset',
                  valueColor: _kTextPrimary,
                  bold: true,
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // ── failure mode ────────────────────────────────────────────────
          _sectionLabel('ON FAILURE'),
          _card(
            child: Column(
              children: [
                _failureModeOption(
                  title: 'Continue',
                  subtitle:
                      'Skip failed payments and process the rest.',
                  value: 'continue',
                  groupValue: viewModel.failureMode,
                  onChanged: viewModel.setFailureMode,
                ),
                const SizedBox(height: 8),
                _failureModeOption(
                  title: 'Abort',
                  subtitle:
                      'Stop the entire batch if any payment fails.',
                  value: 'abort',
                  groupValue: viewModel.failureMode,
                  onChanged: viewModel.setFailureMode,
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // ── recipient preview list ──────────────────────────────────────
          _sectionLabel('PAYMENT DETAILS'),
          ...List.generate(viewModel.recipients.length, (i) {
            final r = viewModel.recipients[i];
            return _RecipientTile(
              entry: r,
              index: i,
              onRemove: () {
                viewModel.removeRecipient(i);
                if (viewModel.recipients.isEmpty) {
                  viewModel.backToAddRecipients();
                }
              },
            );
          }),
          const SizedBox(height: 24),

          // ── action buttons ──────────────────────────────────────────────
          _gradientButton(
            label: 'Confirm & Send Batch',
            icon: Icons.send,
            onTap: () => viewModel.submitBatch(
              onSuccess: () {},
              onError: (msg) => ScaffoldMessenger.of(ctx).showSnackBar(
                SnackBar(
                  content: Text(msg,
                      style: GoogleFonts.instrumentSans(
                          color: Colors.white)),
                  backgroundColor: _kError,
                ),
              ),
            ),
            enabled: !viewModel.isBusy,
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: viewModel.backToAddRecipients,
            child: Center(
              child: Text(
                'Back  –  Edit Recipients',
                style: GoogleFonts.instrumentSans(
                  color: _kTextMuted,
                  fontSize: 13,
                  decoration: TextDecoration.underline,
                  decorationColor: _kTextMuted,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _summaryRow(
    String label,
    String value, {
    Color? valueColor,
    bool bold = false,
  }) =>
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style:
                GoogleFonts.instrumentSans(color: _kTextMuted, fontSize: 13),
          ),
          Text(
            value,
            style: GoogleFonts.instrumentSans(
              color: valueColor ?? _kTextPrimary,
              fontSize: 14,
              fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
            ),
          ),
        ],
      );

  Widget _failureModeOption({
    required String title,
    required String subtitle,
    required String value,
    required String groupValue,
    required void Function(String) onChanged,
  }) {
    final selected = value == groupValue;
    return GestureDetector(
      onTap: () => onChanged(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? _kAccentEnd.withOpacity(0.35) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? _kAccentStart : _kBorder,
          ),
        ),
        child: Row(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected ? _kAccentStart : _kBorder,
                  width: 2,
                ),
              ),
              child: selected
                  ? Center(
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: _kAccentStart,
                        ),
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.instrumentSans(
                      color: _kTextPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: GoogleFonts.instrumentSans(
                        color: _kTextMuted, fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Step 3 : Progress ───────────────────────────────────────────────────────
class _ProgressStep extends StatelessWidget {
  const _ProgressStep({required this.viewModel});
  final BatchPaymentViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final response = viewModel.batchResponse;
    final busy = viewModel.isBusy;

    if (busy && response == null) {
      return const Center(
        child: CircularProgressIndicator(color: _kAccentStart),
      );
    }

    if (response == null) {
      return Center(
        child: Text('Waiting for batch response…',
            style: GoogleFonts.instrumentSans(color: _kTextMuted)),
      );
    }

    final isComplete =
        response.status == 'completed' || response.status == 'failed';
    final successCount = response.successfulPayments;
    final failCount = response.failedPayments;
    final total = response.totalPayments;
    final progressValue = total > 0
        ? (successCount + failCount) / total
        : 0.0;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── status banner ───────────────────────────────────────────────
          _card(
            child: Column(
              children: [
                Row(
                  children: [
                    _statusIcon(response.status),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _statusLabel(response.status),
                            style: GoogleFonts.instrumentSans(
                              color: _kTextPrimary,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            'Batch #${response.batchId}',
                            style: GoogleFonts.instrumentSans(
                                color: _kTextMuted, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                // progress bar
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: isComplete ? progressValue : null,
                    minHeight: 6,
                    backgroundColor: _kBorder,
                    valueColor:
                        const AlwaysStoppedAnimation<Color>(_kAccentStart),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _statChip('Total', '$total', _kTextMuted),
                    _statChip('Success', '$successCount', _kSuccess),
                    _statChip('Failed', '$failCount', _kError),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // ── individual results ──────────────────────────────────────────
          _sectionLabel('PAYMENT RESULTS'),
          ...response.results.map((r) => _ResultTile(item: r)),

          if (!isComplete) ...[
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: _kAccentStart),
                ),
                const SizedBox(width: 10),
                Text(
                  'Processing payments…',
                  style: GoogleFonts.instrumentSans(
                      color: _kTextMuted, fontSize: 13),
                ),
              ],
            ),
          ],

          if (isComplete) ...[
            const SizedBox(height: 24),
            _gradientButton(
              label: 'Start New Batch',
              icon: Icons.refresh,
              onTap: viewModel.resetBatch,
            ),
            const SizedBox(height: 12),
            GestureDetector(
              onTap: viewModel.navigateBack,
              child: Center(
                child: Text(
                  'Back to Dashboard',
                  style: GoogleFonts.instrumentSans(
                    color: _kTextMuted,
                    fontSize: 13,
                    decoration: TextDecoration.underline,
                    decorationColor: _kTextMuted,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _statusIcon(String status) {
    switch (status) {
      case 'completed':
        return const CircleAvatar(
          radius: 22,
          backgroundColor: _kSuccess,
          child: Icon(Icons.check, color: Colors.white, size: 20),
        );
      case 'failed':
        return const CircleAvatar(
          radius: 22,
          backgroundColor: _kError,
          child: Icon(Icons.close, color: Colors.white, size: 20),
        );
      default:
        return const CircleAvatar(
          radius: 22,
          backgroundColor: _kWarning,
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(
                strokeWidth: 2.5, color: Colors.white),
          ),
        );
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'completed':
        return 'Batch Completed';
      case 'failed':
        return 'Batch Failed';
      case 'processing':
        return 'Processing Batch…';
      default:
        return 'Batch Submitted';
    }
  }

  Widget _statChip(String label, String value, Color color) => Column(
        children: [
          Text(
            value,
            style: GoogleFonts.instrumentSans(
              color: color,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          Text(
            label,
            style:
                GoogleFonts.instrumentSans(color: _kTextMuted, fontSize: 11),
          ),
        ],
      );
}

// ─── individual result tile ───────────────────────────────────────────────────
class _ResultTile extends StatelessWidget {
  const _ResultTile({required this.item});
  final BatchPaymentResultItem item;

  @override
  Widget build(BuildContext context) {
    final ok = item.isSuccess;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: _kCard,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: ok ? _kSuccess.withOpacity(0.4) : _kError.withOpacity(0.4),
        ),
      ),
      child: Row(
        children: [
          // status icon
          CircleAvatar(
            radius: 14,
            backgroundColor:
                ok ? _kSuccess.withOpacity(0.15) : _kError.withOpacity(0.15),
            child: Icon(
              ok ? Icons.check : Icons.close,
              color: ok ? _kSuccess : _kError,
              size: 14,
            ),
          ),
          const SizedBox(width: 12),
          // tag + error
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.recipientTag.isNotEmpty
                      ? item.recipientTag
                      : 'Payment #${item.index + 1}',
                  style: GoogleFonts.instrumentSans(
                    color: _kTextPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (!ok && item.error != null && item.error!.isNotEmpty)
                  Text(
                    item.error!,
                    style: GoogleFonts.instrumentSans(
                        color: _kError, fontSize: 11),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                if (ok && item.transactionId != null)
                  Text(
                    'TX #${item.transactionId}',
                    style: GoogleFonts.instrumentSans(
                        color: _kTextMuted, fontSize: 11),
                  ),
              ],
            ),
          ),
          // amount
          if (item.amount > 0)
            Text(
              '${item.amount.toStringAsFixed(item.amount.truncateToDouble() == item.amount ? 0 : 4)} ${item.asset}',
              style: GoogleFonts.instrumentSans(
                color: ok ? _kSuccess : _kError,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
        ],
      ),
    );
  }
}
