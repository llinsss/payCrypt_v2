import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/batch_payment_models.dart';
import 'package:Tagg/models/chains_models.dart';
import 'package:Tagg/services/batch_payment_service.dart';
import 'package:Tagg/services/chains_service.dart';
import 'package:Tagg/services/user_service.dart';
import 'package:Tagg/models/user_token_balance.dart';

// ---------------------------------------------------------------------------
// Step enum
// ---------------------------------------------------------------------------

enum BatchStep { addRecipients, review, progress }

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

class BatchPaymentViewModel extends BaseViewModel {
  // -- services --
  final _batchService = locator<BatchPaymentService>();
  final _chainsService = locator<ChainsService>();
  final _userService = locator<UserService>();
  final _snackbarService = locator<SnackbarService>();
  final _navigationService = locator<NavigationService>();

  // -- step --
  BatchStep _step = BatchStep.addRecipients;
  BatchStep get step => _step;

  // -- form controllers (add recipient) --
  final tagController = TextEditingController();
  final amountController = TextEditingController();
  final memoController = TextEditingController();

  // -- recipient list (up to 50) --
  final List<BatchPaymentEntry> _recipients = [];
  List<BatchPaymentEntry> get recipients => List.unmodifiable(_recipients);
  static const int maxRecipients = 50;

  // -- asset / chain selection --
  List<Chain> _chains = [];
  List<Chain> get chains => _chains;

  String _selectedAsset = '';
  String get selectedAsset => _selectedAsset;

  // -- failure mode --
  String _failureMode = 'continue'; // 'abort' | 'continue'
  String get failureMode => _failureMode;

  // -- user balances (for asset picker) --
  List<UserTokenBalance> _balances = [];
  List<UserTokenBalance> get balances => _balances;

  // -- review totals --
  double get totalAmount =>
      _recipients.fold(0.0, (sum, r) => sum + r.amount);
  int get recipientCount => _recipients.length;

  // -- result / progress state --
  BatchPaymentResponse? _batchResponse;
  BatchPaymentResponse? get batchResponse => _batchResponse;

  bool _isPolling = false;
  Timer? _pollTimer;

  // -- validation error for add-recipient form --
  String? _formError;
  String? get formError => _formError;

  // -- CSV parse error --
  String? _csvError;
  String? get csvError => _csvError;

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  Future<void> initialize() async {
    setBusy(true);
    try {
      _chains = await _chainsService.getChains();
      _balances = await _userService.getUserTokenBalances();

      // Default asset to first available token symbol
      if (_chains.isNotEmpty) {
        _selectedAsset = _chains.first.nativeCurrency.symbol;
      }
    } catch (e) {
      debugPrint('BatchPaymentViewModel.initialize error: $e');
    } finally {
      setBusy(false);
    }
  }

  @override
  void dispose() {
    tagController.dispose();
    amountController.dispose();
    memoController.dispose();
    _pollTimer?.cancel();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Asset selection
  // ---------------------------------------------------------------------------

  void setSelectedAsset(String symbol) {
    _selectedAsset = symbol;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Failure-mode toggle
  // ---------------------------------------------------------------------------

  void setFailureMode(String mode) {
    assert(mode == 'abort' || mode == 'continue');
    _failureMode = mode;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Add recipient manually
  // ---------------------------------------------------------------------------

  bool addRecipient() {
    _formError = null;

    final tag = tagController.text.trim();
    final amountText = amountController.text.trim();
    final memo = memoController.text.trim();

    // -- validation --
    if (tag.isEmpty) {
      _formError = 'Recipient @tag is required.';
      notifyListeners();
      return false;
    }
    if (amountText.isEmpty) {
      _formError = 'Amount is required.';
      notifyListeners();
      return false;
    }
    final amount = double.tryParse(amountText);
    if (amount == null || amount <= 0) {
      _formError = 'Enter a valid amount greater than 0.';
      notifyListeners();
      return false;
    }
    if (_selectedAsset.isEmpty) {
      _formError = 'Please select an asset first.';
      notifyListeners();
      return false;
    }
    if (_recipients.length >= maxRecipients) {
      _formError = 'Maximum of $maxRecipients recipients reached.';
      notifyListeners();
      return false;
    }

    _recipients.add(BatchPaymentEntry(
      recipientTag: tag.startsWith('@') ? tag : '@$tag',
      amount: amount,
      asset: _selectedAsset,
      memo: memo.isEmpty ? null : memo,
    ));

    // Clear form
    tagController.clear();
    amountController.clear();
    memoController.clear();
    notifyListeners();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Remove recipient
  // ---------------------------------------------------------------------------

  void removeRecipient(int index) {
    if (index >= 0 && index < _recipients.length) {
      _recipients.removeAt(index);
      notifyListeners();
    }
  }

  // ---------------------------------------------------------------------------
  // CSV upload & parse
  // ---------------------------------------------------------------------------

  /// Launches the file picker, reads the CSV, and appends valid rows.
  Future<void> importFromCsv() async {
    _csvError = null;
    notifyListeners();

    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['csv'],
        withData: true,
      );

      if (result == null || result.files.isEmpty) return;

      final file = result.files.first;
      String content;

      if (file.bytes != null) {
        content = String.fromCharCodes(file.bytes!);
      } else if (file.path != null) {
        content = await File(file.path!).readAsString();
      } else {
        _csvError = 'Could not read the selected file.';
        notifyListeners();
        return;
      }

      final parsed = _parseCsv(content);
      if (parsed.isEmpty) {
        _csvError =
            'No valid rows found. CSV must have @tag and amount columns.';
        notifyListeners();
        return;
      }

      int added = 0;
      int skipped = 0;

      for (final entry in parsed) {
        if (_recipients.length >= maxRecipients) {
          skipped += parsed.length - parsed.indexOf(entry);
          break;
        }
        _recipients.add(entry);
        added++;
      }

      final message = skipped > 0
          ? 'Added $added recipients. $skipped skipped (limit reached).'
          : 'Added $added recipients from CSV.';
      _snackbarService.showSnackbar(
        message: message,
        duration: const Duration(seconds: 3),
      );
    } catch (e) {
      _csvError = 'Failed to parse CSV: ${e.toString()}';
    }

    notifyListeners();
  }

  /// Parses CSV content into [BatchPaymentEntry] objects.
  /// Expected columns (flexible header detection): tag / @tag, amount, asset (optional), memo (optional).
  List<BatchPaymentEntry> _parseCsv(String content) {
    final lines = content
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .split('\n')
        .where((l) => l.trim().isNotEmpty)
        .toList();

    if (lines.isEmpty) return [];

    // Detect header row
    final firstLine = lines.first.toLowerCase();
    final hasHeader =
        firstLine.contains('tag') || firstLine.contains('amount');

    int tagIdx = 0;
    int amountIdx = 1;
    int assetIdx = -1;
    int memoIdx = -1;

    if (hasHeader) {
      final headers =
          lines.first.split(',').map((h) => h.trim().toLowerCase()).toList();
      tagIdx = _indexOfAny(headers, ['tag', '@tag', 'recipient', 'recipient_tag']);
      amountIdx = _indexOfAny(headers, ['amount', 'value']);
      assetIdx = _indexOfAny(headers, ['asset', 'token', 'currency', 'symbol']);
      memoIdx = _indexOfAny(headers, ['memo', 'note', 'description']);
      lines.removeAt(0);
    }

    final entries = <BatchPaymentEntry>[];

    for (final line in lines) {
      final cols = line.split(',').map((c) => c.trim()).toList();
      if (cols.length <= tagIdx || cols.length <= amountIdx) continue;

      final rawTag = cols[tagIdx];
      final tag = rawTag.startsWith('@') ? rawTag : '@$rawTag';
      final amount = double.tryParse(cols[amountIdx]);
      if (tag.length < 2 || amount == null || amount <= 0) continue;

      final asset = (assetIdx >= 0 && assetIdx < cols.length && cols[assetIdx].isNotEmpty)
          ? cols[assetIdx]
          : _selectedAsset;
      final memo = (memoIdx >= 0 && memoIdx < cols.length && cols[memoIdx].isNotEmpty)
          ? cols[memoIdx]
          : null;

      entries.add(BatchPaymentEntry(
        recipientTag: tag,
        amount: amount,
        asset: asset,
        memo: memo,
      ));
    }

    return entries;
  }

  int _indexOfAny(List<String> list, List<String> candidates) {
    for (final candidate in candidates) {
      final idx = list.indexOf(candidate);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  // ---------------------------------------------------------------------------
  // Navigation between steps
  // ---------------------------------------------------------------------------

  bool proceedToReview() {
    if (_recipients.isEmpty) {
      _snackbarService.showSnackbar(
        message: 'Add at least one recipient before continuing.',
        duration: const Duration(seconds: 3),
      );
      return false;
    }
    _step = BatchStep.review;
    notifyListeners();
    return true;
  }

  void backToAddRecipients() {
    _step = BatchStep.addRecipients;
    _batchResponse = null;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Submit batch
  // ---------------------------------------------------------------------------

  Future<void> submitBatch({
    required VoidCallback onSuccess,
    required void Function(String message) onError,
  }) async {
    if (_recipients.isEmpty) {
      onError('No recipients to process.');
      return;
    }

    setBusy(true);
    _step = BatchStep.progress;
    notifyListeners();

    try {
      final response = await _batchService.createBatchPayment(
        payments: _recipients,
        failureMode: _failureMode,
      );

      // Annotate results with the original recipient info for display
      _annotateBatchResults(response);
      _batchResponse = response;
      notifyListeners();

      // If the batch is still processing, start polling
      if (response.status == 'processing' || response.status == 'pending') {
        _startPolling(response.batchId);
      } else {
        onSuccess();
      }
    } catch (e) {
      _step = BatchStep.review;
      notifyListeners();
      onError(_friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  /// Copy tag/amount/asset from the original list onto each result item
  /// so the progress screen can display them without a separate lookup.
  void _annotateBatchResults(BatchPaymentResponse response) {
    for (final result in response.results) {
      if (result.index >= 0 && result.index < _recipients.length) {
        final entry = _recipients[result.index];
        result.recipientTag = entry.recipientTag;
        result.amount = entry.amount;
        result.asset = entry.asset;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Polling for batch status
  // ---------------------------------------------------------------------------

  void _startPolling(int batchId) {
    _isPolling = true;
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      if (!_isPolling) return;
      try {
        final updated = await _batchService.getBatchPaymentStatus(batchId);
        _annotateBatchResults(updated);
        _batchResponse = updated;
        notifyListeners();

        if (updated.status == 'completed' || updated.status == 'failed') {
          _stopPolling();
        }
      } catch (e) {
        debugPrint('Polling error: $e');
      }
    });
  }

  void _stopPolling() {
    _isPolling = false;
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Reset / start new batch
  // ---------------------------------------------------------------------------

  void resetBatch() {
    _stopPolling();
    _recipients.clear();
    _batchResponse = null;
    _formError = null;
    _csvError = null;
    _step = BatchStep.addRecipients;
    tagController.clear();
    amountController.clear();
    memoController.clear();
    notifyListeners();
  }

  void navigateBack() {
    _stopPolling();
    _navigationService.back();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  String _friendlyError(Object e) {
    final msg = e.toString();
    if (msg.contains('Exception:')) {
      return msg.replaceFirst('Exception: ', '');
    }
    return msg;
  }
}
