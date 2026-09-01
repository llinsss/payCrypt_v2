import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/services/support_ticket_service.dart';
import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

/// The possible screens shown inside the ContactSupportView.
enum ContactSupportScreen { form, tickets, success }

class ContactSupportViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();
  final _snackbarService = locator<SnackbarService>();
  final _ticketService = locator<SupportTicketService>();

  // ── Form state ────────────────────────────────────────────────────────────
  final formKey = GlobalKey<FormState>();
  final subjectController = TextEditingController();
  final descriptionController = TextEditingController();
  final transactionIdController = TextEditingController();

  int _descriptionLength = 0;
  int get descriptionLength => _descriptionLength;
  static const int maxDescriptionLength = 1000;

  String? _selectedIssueType;
  String? get selectedIssueType => _selectedIssueType;

  TicketPriority _selectedPriority = TicketPriority.medium;
  TicketPriority get selectedPriority => _selectedPriority;

  // ── Screen navigation ─────────────────────────────────────────────────────
  ContactSupportScreen _currentScreen = ContactSupportScreen.form;
  ContactSupportScreen get currentScreen => _currentScreen;

  // ── Ticket list ───────────────────────────────────────────────────────────
  List<SupportTicket> _tickets = [];
  List<SupportTicket> get tickets => _tickets;

  bool _isLoadingTickets = false;
  bool get isLoadingTickets => _isLoadingTickets;

  SupportTicket? _lastSubmittedTicket;
  SupportTicket? get lastSubmittedTicket => _lastSubmittedTicket;

  // ── Pre-fill helpers ──────────────────────────────────────────────────────

  /// Optionally pre-fill with a transaction ID (called from transaction detail).
  void prefillTransactionId(String txId) {
    transactionIdController.text = txId;
    _selectedIssueType = 'failed_transaction';
    notifyListeners();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void init() {
    super.init();
    descriptionController.addListener(() {
      _descriptionLength = descriptionController.text.length;
      notifyListeners();
    });
  }

  @override
  void dispose() {
    subjectController.dispose();
    descriptionController.dispose();
    transactionIdController.dispose();
    formKey.currentState?.reset();
    super.dispose();
  }

  // ── Selectors ─────────────────────────────────────────────────────────────

  void selectIssueType(String value) {
    _selectedIssueType = value;
    notifyListeners();
  }

  void selectPriority(TicketPriority priority) {
    _selectedPriority = priority;
    notifyListeners();
  }

  // ── Screen navigation ─────────────────────────────────────────────────────

  void showForm() {
    _currentScreen = ContactSupportScreen.form;
    notifyListeners();
  }

  Future<void> showTickets() async {
    _currentScreen = ContactSupportScreen.tickets;
    notifyListeners();
    await _loadTickets();
  }

  void showSuccess() {
    _currentScreen = ContactSupportScreen.success;
    notifyListeners();
  }

  // ── Ticket operations ─────────────────────────────────────────────────────

  Future<void> _loadTickets() async {
    _isLoadingTickets = true;
    notifyListeners();

    try {
      _tickets = await _ticketService.getTickets();
    } catch (e) {
      _snackbarService.showSnackbar(
        message: 'Could not load tickets: $e',
        duration: const Duration(seconds: 3),
      );
    } finally {
      _isLoadingTickets = false;
      notifyListeners();
    }
  }

  Future<void> submitTicket() async {
    if (!(_formKey?.currentState?.validate() ?? formKey.currentState?.validate() ?? false)) {
      return;
    }

    if (_selectedIssueType == null) {
      _snackbarService.showSnackbar(
        message: 'Please select an issue type.',
        duration: const Duration(seconds: 3),
      );
      return;
    }

    setBusy(true);

    try {
      final ticket = await _ticketService.createTicket(
        subject: subjectController.text.trim(),
        description: descriptionController.text.trim(),
        issueType: _selectedIssueType!,
        linkedTransactionId: transactionIdController.text.trim().isNotEmpty
            ? transactionIdController.text.trim()
            : null,
        priority: _selectedPriority,
      );

      _lastSubmittedTicket = ticket;
      _resetForm();
      showSuccess();
    } catch (e) {
      _snackbarService.showSnackbar(
        message: 'Failed to submit ticket: $e',
        duration: const Duration(seconds: 4),
      );
    } finally {
      setBusy(false);
    }
  }

  void _resetForm() {
    subjectController.clear();
    descriptionController.clear();
    transactionIdController.clear();
    _selectedIssueType = null;
    _selectedPriority = TicketPriority.medium;
    _descriptionLength = 0;
    formKey.currentState?.reset();
  }

  // ── Navigation helpers ────────────────────────────────────────────────────

  void navigateBack() => _navigationService.back();

  // Private alias used in submitTicket to reference formKey safely.
  GlobalKey<FormState>? get _formKey => formKey;
}
