import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/scheduled_payment_model.dart';
import 'package:Tagg/services/scheduled_payment_service.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class ScheduledPaymentsViewModel extends BaseViewModel {
  final _scheduledPaymentService = locator<ScheduledPaymentService>();
  final _dialogService = locator<DialogService>();
  final _snackbarService = locator<SnackbarService>();

  List<ScheduledPayment> _scheduledPayments = [];
  List<ScheduledPayment> get scheduledPayments => _scheduledPayments;

  bool get hasPayments => _scheduledPayments.isNotEmpty;

  Future<void> initialize() async {
    await loadScheduledPayments();
  }

  Future<void> loadScheduledPayments() async {
    setBusy(true);

    try {
      _scheduledPayments =
          await _scheduledPaymentService.getScheduledPayments();
      notifyListeners();
    } catch (e) {
      print('Error loading scheduled payments: $e');
      _showError('Failed to load scheduled payments');
    } finally {
      setBusy(false);
    }
  }

  List<ScheduledPayment> get activePayments =>
      _scheduledPayments.where((p) => p.isActive).toList();

  List<ScheduledPayment> get completedPayments =>
      _scheduledPayments.where((p) => !p.isActive).toList();

  Future<void> cancelPayment(ScheduledPayment payment) async {
    final result = await _dialogService.showDialog(
      title: 'Cancel Scheduled Payment',
      description:
          'Are you sure you want to cancel the payment of ${payment.formattedAmount} to @${payment.recipientTag}?',
      buttonTitle: 'Yes, Cancel',
      cancelTitle: 'No, Keep It',
    );

    if (result?.confirmed == true) {
      try {
        await _scheduledPaymentService.cancelScheduledPayment(payment.id);
        await loadScheduledPayments();
        _snackbarService.showSnackbar(
          message: 'Scheduled payment cancelled successfully',
          duration: const Duration(seconds: 3),
        );
      } catch (e) {
        _showError('Failed to cancel scheduled payment');
      }
    }
  }

  void _showError(String message) {
    _dialogService.showDialog(
      title: 'Error',
      description: message,
    );
  }
}
