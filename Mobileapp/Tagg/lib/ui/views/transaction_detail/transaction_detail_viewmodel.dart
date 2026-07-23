import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/transaction_model.dart';
import 'package:Tagg/services/transaction_service.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/services.dart';

class TransactionDetailViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();
  final _transactionService = locator<TransactionService>();
  final _snackbarService = locator<SnackbarService>();

  Transaction? _transaction;
  Transaction? get transaction => _transaction;

  bool get isLoading => isBusy;

  void initialize(int transactionId) async {
    setBusy(true);
    try {
      _transaction = await _transactionService.getTransactionById(transactionId);
      notifyListeners();
    } catch (e) {
      print('Error loading transaction: $e');
    } finally {
      setBusy(false);
    }
  }

  void goBack() {
    _navigationService.back();
  }

  Future<void> openInExplorer() async {
    final explorerLink = _transaction?.explorerLink;
    if (explorerLink != null && explorerLink.isNotEmpty) {
      final uri = Uri.tryParse(explorerLink);
      if (uri == null) {
        _snackbarService.showSnackbar(message: 'Invalid explorer link');
        return;
      }
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        _snackbarService.showSnackbar(message: 'Could not open explorer');
      }
    }
  }

  Future<void> copyToClipboard(String text, String label) async {
    await Clipboard.setData(ClipboardData(text: text));
    _snackbarService.showSnackbar(
      message: '$label copied to clipboard',
      duration: const Duration(seconds: 1),
    );
  }
}
