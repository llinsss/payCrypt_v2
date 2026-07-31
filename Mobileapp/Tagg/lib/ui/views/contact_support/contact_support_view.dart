import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'package:Tagg/services/support_ticket_service.dart';
import 'contact_support_viewmodel.dart';

// ── Palette (matches the rest of the app) ────────────────────────────────────
const _kBg = Color(0xFF090715);
const _kCard = Color(0xFF130F22);
const _kBorder = Color(0xFF262140);
const _kPurple = Color(0xFF9D55FF);
const _kPurpleDark = Color(0xFF674AA6);
const _kMuted = Color(0xFF867EA5);
const _kSuccess = Color(0xFF00D084);
const _kError = Color(0xFFFF4444);
const _kText = Colors.white;

class ContactSupportView extends StackedView<ContactSupportViewModel> {
  /// Optional transaction ID pre-filled when navigating from a transaction detail.
  final String? prefillTransactionId;

  const ContactSupportView({Key? key, this.prefillTransactionId})
      : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    ContactSupportViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: _kBg,
      appBar: _buildAppBar(viewModel),
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          child: _buildBody(context, viewModel),
        ),
      ),
    );
  }

  // ── App bar ─────────────────────────────────────────────────────────────────

  AppBar _buildAppBar(ContactSupportViewModel viewModel) {
    final isForm = viewModel.currentScreen == ContactSupportScreen.form;
    final isTickets = viewModel.currentScreen == ContactSupportScreen.tickets;

    return AppBar(
      backgroundColor: _kBg,
      elevation: 0,
      leading: Semantics(
        label: 'Go back',
        button: true,
        child: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFFE2E2E2)),
          tooltip: 'Go back',
          onPressed: viewModel.navigateBack,
        ),
      ),
      title: Text(
        'Contact Support',
        style: GoogleFonts.instrumentSans(
          fontWeight: FontWeight.w600,
          fontSize: 18,
          color: _kText,
        ),
      ),
      actions: [
        Semantics(
          label: isForm ? 'View my tickets' : 'New ticket',
          button: true,
          child: TextButton(
            onPressed: isForm ? viewModel.showTickets : viewModel.showForm,
            child: Text(
              isForm ? 'My Tickets' : 'New Ticket',
              style: const TextStyle(color: _kPurple, fontSize: 13),
            ),
          ),
        ),
      ],
    );
  }

  // ── Body dispatcher ─────────────────────────────────────────────────────────

  Widget _buildBody(BuildContext context, ContactSupportViewModel viewModel) {
    switch (viewModel.currentScreen) {
      case ContactSupportScreen.tickets:
        return _TicketListScreen(key: const ValueKey('tickets'), viewModel: viewModel);
      case ContactSupportScreen.success:
        return _SuccessScreen(key: const ValueKey('success'), viewModel: viewModel);
      case ContactSupportScreen.form:
      default:
        return _TicketFormScreen(key: const ValueKey('form'), viewModel: viewModel);
    }
  }

  @override
  ContactSupportViewModel viewModelBuilder(BuildContext context) =>
      ContactSupportViewModel();

  @override
  void onViewModelReady(ContactSupportViewModel viewModel) {
    if (prefillTransactionId != null && prefillTransactionId!.isNotEmpty) {
      viewModel.prefillTransactionId(prefillTransactionId!);
    }
  }
}

// ── Ticket submission form ───────────────────────────────────────────────────

class _TicketFormScreen extends StatelessWidget {
  final ContactSupportViewModel viewModel;

  const _TicketFormScreen({Key? key, required this.viewModel}) : super(key: key);

  static const List<String> _issueTypes = [
    'Failed Transaction',
    'KYC / Verification',
    'Deposit Issue',
    'Withdrawal Issue',
    'Account Access',
    'Other',
  ];

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
      child: Form(
        key: viewModel.formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader(
              icon: Icons.headset_mic_outlined,
              title: 'Submit a Support Ticket',
              subtitle:
                  'Describe your issue and our team will respond within 24 hours.',
            ),

            const SizedBox(height: 24),

            // Issue type selector
            _label('Issue Type *'),
            const SizedBox(height: 8),
            Semantics(
              label: 'Select issue type',
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _issueTypes.map((type) {
                  final value = kIssueTypeValues[type] ?? type.toLowerCase();
                  final selected = viewModel.selectedIssueType == value;
                  return Semantics(
                    label: type,
                    selected: selected,
                    button: true,
                    child: GestureDetector(
                      onTap: () => viewModel.selectIssueType(value),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: selected ? _kPurpleDark : _kCard,
                          border: Border.all(
                              color: selected ? _kPurple : _kBorder),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          type,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: selected ? _kText : _kMuted,
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),

            const SizedBox(height: 20),

            // Subject field
            _label('Subject *'),
            const SizedBox(height: 8),
            _buildTextField(
              controller: viewModel.subjectController,
              hint: 'e.g. Transaction stuck for 2 hours',
              semanticsLabel: 'Ticket subject',
              validator: (v) {
                if (v == null || v.trim().isEmpty) return 'Subject is required';
                if (v.trim().length < 5) return 'Please be more descriptive';
                return null;
              },
            ),

            const SizedBox(height: 20),

            // Description field
            _label('Description *'),
            const SizedBox(height: 8),
            Semantics(
              label: 'Ticket description',
              child: TextFormField(
                controller: viewModel.descriptionController,
                maxLines: 6,
                maxLength: ContactSupportViewModel.maxDescriptionLength,
                keyboardType: TextInputType.multiline,
                style: const TextStyle(color: _kText, fontSize: 14),
                decoration: _inputDecoration(
                  'Describe the issue in detail. Include what you were trying to do and what happened.',
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Description is required';
                  if (v.trim().length < 20) return 'Please provide more detail (min 20 chars)';
                  return null;
                },
              ),
            ),

            const SizedBox(height: 20),

            // Optional transaction ID
            _label('Transaction ID (optional)'),
            const SizedBox(height: 4),
            Text(
              'Link a specific transaction to help us investigate faster.',
              style: const TextStyle(color: _kMuted, fontSize: 12),
            ),
            const SizedBox(height: 8),
            _buildTextField(
              controller: viewModel.transactionIdController,
              hint: 'e.g. 12345 or TX-abc123',
              semanticsLabel: 'Transaction ID to link',
              validator: null,
            ),

            const SizedBox(height: 20),

            // Priority
            _label('Priority'),
            const SizedBox(height: 8),
            _buildPrioritySelector(viewModel),

            const SizedBox(height: 32),

            // Submit button
            Semantics(
              label: 'Submit support ticket',
              button: true,
              child: SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: viewModel.isBusy ? null : viewModel.submitTicket,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _kPurple,
                    disabledBackgroundColor: _kPurple.withOpacity(0.5),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(48)),
                  ),
                  child: viewModel.isBusy
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: _kText),
                        )
                      : Text(
                          'Submit Ticket',
                          style: GoogleFonts.instrumentSans(
                            fontWeight: FontWeight.w600,
                            fontSize: 16,
                            color: _kText,
                          ),
                        ),
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Fallback email
            Semantics(
              label: 'Alternative: send an email to support',
              child: Center(
                child: Column(
                  children: [
                    const Text(
                      'Prefer email?',
                      style: TextStyle(color: _kMuted, fontSize: 13),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'support@taggedpay.xyz',
                      style: const TextStyle(
                        color: _kPurple,
                        fontSize: 13,
                        decoration: TextDecoration.underline,
                        decorationColor: _kPurple,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildPrioritySelector(ContactSupportViewModel viewModel) {
    return Semantics(
      label: 'Select ticket priority',
      child: Row(
        children: [
          _priorityChip(viewModel, TicketPriority.low, 'Low', _kSuccess),
          const SizedBox(width: 8),
          _priorityChip(viewModel, TicketPriority.medium, 'Medium',
              const Color(0xFFFFA500)),
          const SizedBox(width: 8),
          _priorityChip(viewModel, TicketPriority.high, 'High', _kError),
        ],
      ),
    );
  }

  Widget _priorityChip(ContactSupportViewModel viewModel,
      TicketPriority priority, String label, Color color) {
    final selected = viewModel.selectedPriority == priority;
    return Semantics(
      label: '$label priority',
      selected: selected,
      button: true,
      child: GestureDetector(
        onTap: () => viewModel.selectPriority(priority),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? color.withOpacity(0.2) : _kCard,
            border: Border.all(color: selected ? color : _kBorder),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: selected ? color : _kMuted,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: selected ? color : _kMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static Widget _buildTextField({
    required TextEditingController controller,
    required String hint,
    required String semanticsLabel,
    FormFieldValidator<String>? validator,
  }) {
    return Semantics(
      label: semanticsLabel,
      child: TextFormField(
        controller: controller,
        style: const TextStyle(color: _kText, fontSize: 14),
        decoration: _inputDecoration(hint),
        validator: validator,
        textCapitalization: TextCapitalization.sentences,
      ),
    );
  }

  static InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: _kMuted, fontSize: 13),
      filled: true,
      fillColor: _kCard,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: _kBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: _kBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: _kPurple),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: _kError),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: _kError),
      ),
    );
  }

  static Widget _label(String text) {
    return Text(
      text,
      style: const TextStyle(
        color: Color(0xFFE2E2E2),
        fontSize: 14,
        fontWeight: FontWeight.w500,
      ),
    );
  }
}

// ── Ticket list screen ───────────────────────────────────────────────────────

class _TicketListScreen extends StatelessWidget {
  final ContactSupportViewModel viewModel;

  const _TicketListScreen({Key? key, required this.viewModel}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (viewModel.isLoadingTickets) {
      return const Center(
        child: CircularProgressIndicator(color: _kPurple),
      );
    }

    if (viewModel.tickets.isEmpty) {
      return Center(
        child: Semantics(
          label: 'No support tickets yet',
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.inbox_outlined, color: _kMuted, size: 64),
              const SizedBox(height: 16),
              Text(
                'No tickets yet',
                style: GoogleFonts.instrumentSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w500,
                  color: _kText,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Submit a ticket and it will appear here.',
                style: TextStyle(color: _kMuted, fontSize: 14),
              ),
              const SizedBox(height: 24),
              Semantics(
                label: 'Submit a new support ticket',
                button: true,
                child: TextButton.icon(
                  onPressed: viewModel.showForm,
                  icon: const Icon(Icons.add, color: _kPurple),
                  label: const Text('New Ticket',
                      style: TextStyle(color: _kPurple)),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Semantics(
      label: 'Your support tickets list',
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        itemCount: viewModel.tickets.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final ticket = viewModel.tickets[index];
          return _TicketCard(ticket: ticket);
        },
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  final SupportTicket ticket;

  const _TicketCard({required this.ticket});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Ticket: ${ticket.subject}, status: ${ticket.statusLabel}',
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: _kCard,
          border: Border.all(color: _kBorder),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    ticket.subject,
                    style: const TextStyle(
                      color: _kText,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                _StatusBadge(status: ticket.status, label: ticket.statusLabel),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              ticket.description,
              style: const TextStyle(color: _kMuted, fontSize: 13),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Semantics(
                  label: 'Priority: ${ticket.priorityLabel}',
                  child: _PriorityBadge(priority: ticket.priority, label: ticket.priorityLabel),
                ),
                const SizedBox(width: 8),
                Text(
                  '#${ticket.id}',
                  style: const TextStyle(color: _kMuted, fontSize: 11),
                ),
                const Spacer(),
                Text(
                  _formatDate(ticket.createdAt),
                  style: const TextStyle(color: _kMuted, fontSize: 11),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _formatDate(DateTime dt) {
    return '${dt.day.toString().padLeft(2, '0')}/'
        '${dt.month.toString().padLeft(2, '0')}/'
        '${dt.year}';
  }
}

class _StatusBadge extends StatelessWidget {
  final TicketStatus status;
  final String label;

  const _StatusBadge({required this.status, required this.label});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status) {
      case TicketStatus.open:
        color = _kPurple;
        break;
      case TicketStatus.inProgress:
        color = const Color(0xFFFFA500);
        break;
      case TicketStatus.resolved:
        color = _kSuccess;
        break;
      case TicketStatus.closed:
        color = _kMuted;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        border: Border.all(color: color.withOpacity(0.5)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _PriorityBadge extends StatelessWidget {
  final TicketPriority priority;
  final String label;

  const _PriorityBadge({required this.priority, required this.label});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (priority) {
      case TicketPriority.high:
        color = _kError;
        break;
      case TicketPriority.medium:
        color = const Color(0xFFFFA500);
        break;
      case TicketPriority.low:
        color = _kSuccess;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        border: Border.all(color: color.withOpacity(0.4)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

// ── Success screen ───────────────────────────────────────────────────────────

class _SuccessScreen extends StatelessWidget {
  final ContactSupportViewModel viewModel;

  const _SuccessScreen({Key? key, required this.viewModel}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final ticket = viewModel.lastSubmittedTicket;

    return Semantics(
      label: 'Ticket submitted successfully',
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _kSuccess.withOpacity(0.15),
                border: Border.all(color: _kSuccess.withOpacity(0.5)),
              ),
              child: const Icon(Icons.check, color: _kSuccess, size: 40),
            ),
            const SizedBox(height: 24),
            Text(
              'Ticket Submitted!',
              style: GoogleFonts.instrumentSans(
                fontWeight: FontWeight.w700,
                fontSize: 22,
                color: _kText,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Your support ticket has been received. Our team will respond within 24 hours.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: _kMuted, fontSize: 15, height: 1.5),
            ),
            if (ticket != null) ...[
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _kCard,
                  border: Border.all(color: _kBorder),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  children: [
                    _infoRow('Ticket ID', '#${ticket.id}'),
                    const SizedBox(height: 8),
                    _infoRow('Subject', ticket.subject),
                    const SizedBox(height: 8),
                    _infoRow('Status', ticket.statusLabel),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: viewModel.showTickets,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kPurple,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(48)),
                ),
                child: Text(
                  'View My Tickets',
                  style: GoogleFonts.instrumentSans(
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                    color: _kText,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: viewModel.showForm,
              child: const Text('Submit Another Ticket',
                  style: TextStyle(color: _kMuted)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: _kMuted, fontSize: 13)),
        Text(value,
            style: const TextStyle(
                color: _kText, fontSize: 13, fontWeight: FontWeight.w500)),
      ],
    );
  }
}

// ── Section header ───────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _SectionHeader({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: _kPurple.withOpacity(0.15),
            border: Border.all(color: _kPurple.withOpacity(0.4)),
            borderRadius: BorderRadius.circular(100),
          ),
          child: Icon(icon, color: _kPurple, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: GoogleFonts.instrumentSans(
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                  color: _kText,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: const TextStyle(color: _kMuted, fontSize: 13, height: 1.4),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
