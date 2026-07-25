import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/transaction_model.dart';
import 'package:Tagg/services/transaction_service.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

class TransactionDetailViewModel extends BaseViewModel {
  final _navigationService = locator<NavigationService>();
  final _transactionService = locator<TransactionService>();

  final String transactionId;

  TransactionDetailViewModel({required this.transactionId});

  Transaction? _transaction;
  bool _isLoading = true;
  bool _hasError = false;

  Transaction? get transaction => _transaction;
  bool get isLoading => _isLoading;
  bool get hasError => _hasError;

  Future<void> initialize() async {
    _isLoading = true;
    _hasError = false;
    rebuildUi();

    try {
      final id = int.tryParse(transactionId);
      if (id != null) {
        _transaction = await _transactionService.getTransactionById(id);
      }
      _hasError = _transaction == null;
    } catch (e) {
      _hasError = true;
      print('Error loading transaction: $e');
    }

    _isLoading = false;
    rebuildUi();
  }

  void navigateBack() {
    _navigationService.back();
  }
}
