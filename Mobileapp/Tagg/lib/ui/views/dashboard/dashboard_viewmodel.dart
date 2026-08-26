import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/dashboard_summary.dart';
import 'package:Tagg/models/scheduled_payment_model.dart';
import 'package:Tagg/models/transaction_model.dart';
import 'package:Tagg/models/user_token_balance.dart';
import 'package:Tagg/models/wallet_data.dart';
import 'package:Tagg/models/chains_models.dart';
import 'package:Tagg/services/language_service.dart';
import 'package:Tagg/services/scheduled_payment_service.dart';
import 'package:Tagg/services/transaction_service.dart';
import 'package:Tagg/services/user_service.dart';
import 'package:Tagg/services/wallet_service.dart';
import 'package:Tagg/services/connectivity_service.dart';
import 'package:Tagg/services/chains_service.dart';
import 'package:Tagg/services/exchange_rate_service.dart';
import 'package:Tagg/services/websocket_service.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/widgets.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

class DashboardViewModel extends BaseViewModel {
  final ScrollController transactionScrollController = ScrollController();

  /// Guard so the first-visit coach marks are only triggered once per mount.
  bool coachMarksChecked = false;

  final _dialogService = locator<DialogService>();
  final _snackbarService = locator<SnackbarService>();
  final _userService = locator<UserService>();
  final _walletService = locator<WalletService>();
  final _transactionService = locator<TransactionService>();
  final _chainsService = locator<ChainsService>();
  final _exchangeRateService = locator<ExchangeRateService>();
  final _connectivityService = locator<ConnectivityService>();
  final _websocketService = locator<WebSocketService>();
  final _navigationService = locator<NavigationService>();
  final _scheduledPaymentService = locator<ScheduledPaymentService>();
  final _languageService = locator<LanguageService>();
  StreamSubscription? _balanceUpdateSubscription;

  // Dashboard Data - matching web version structure
  DashboardSummary? _dashboardSummary;
  WalletData? _walletData;
  List<UserTokenBalance> _tokenBalances = [];
  List<Chain> _chains = [];
  List<ScheduledPayment> _upcomingPayments = [];

  // Computed balances
  double _totalBalance = 0.00; // Total balance in USD (from dashboard summary)
  double _nairaBalance = 0.00; // Total balance in NGN (converted)
  double _availableBalance = 0.00; // Available balance from wallet
  double _lockedBalance = 0.00; // Locked balance from wallet
  double _assetBalance = 0.00; // Total asset value from token balances
  double _ngnRate = 1600; // Live NGN/USD exchange rate

  // UI State
  int _selectedTabIndex = 0;
  int selectedFilterIndex = 0;
  bool _isOffline = false;

  // Getters
  DashboardSummary? get dashboardSummary => _dashboardSummary;
  WalletData? get walletData => _walletData;
  List<UserTokenBalance> get tokenBalances => _tokenBalances;
  List<Chain> get chains => _chains;
  List<ScheduledPayment> get upcomingPayments => _upcomingPayments;
  bool get hasUpcomingPayments => _upcomingPayments.isNotEmpty;
  double get totalBalance => _totalBalance;
  double get nairaBalance => _nairaBalance;
  double get availableBalance => _availableBalance;
  double get lockedBalance => _lockedBalance;
  double get assetBalance => _assetBalance;
  double get totalDeposits => _dashboardSummary?.totalDeposit ?? 0.0;
  double get totalWithdrawals => _dashboardSummary?.totalWithdrawal ?? 0.0;
  double get portfolioGrowth => _dashboardSummary?.portfolioGrowth ?? 0.0;
  double get ngnRate => _ngnRate;
  int get selectedTabIndex => _selectedTabIndex;
  bool get isOffline => _isOffline;
  bool get hasData => _dashboardSummary != null;

  void initialize() {
    _connectivityService.connectivityStream.listen((result) {
      _isOffline = result == ConnectivityResult.none;
      if (!_isOffline) {
        // Retry when connectivity restores
        _loadDashboardData();
        _websocketService.connect();
      }
      notifyListeners();
    });
    _loadDashboardData();
    _setupWebSocketListener();
  }

  void _setupWebSocketListener() {
    _balanceUpdateSubscription = _websocketService.onBalanceUpdate.listen((data) {
      print('🔔 WebSocket balance update received');
      _loadDashboardData();
    });
  }

  @override
  void dispose() {
    _balanceUpdateSubscription?.cancel();
    super.dispose();
  }

  Future<void> _loadDashboardData() async {
    setBusy(true);
    try {
      // Load chains first
      print('🔗 Loading chains...');
      _chains = await _chainsService.getChains();
      print('✅ Chains loaded: ${_chains.length} chains');

      // Load dashboard summary - contains total_balance, total_deposit, total_withdrawal, portfolio_growth
      print('📊 Loading dashboard summary...');
      _dashboardSummary = await _userService.getDashboardSummary();
      print('✅ Dashboard summary loaded: ${_dashboardSummary?.totalBalance}');

      // Load wallet data - contains available_balance and locked_balance
      print('💰 Loading wallet data...');
      _walletData = await _walletService.getWalletBalance();
      print('✅ Wallet data loaded: available=${_walletData?.availableBalance}');

      // Load user token balances - individual token holdings with USD values
      print('🪙 Loading token balances...');
      _tokenBalances = await _userService.getUserTokenBalances();
      print('✅ Token balances loaded: ${_tokenBalances.length} tokens');

      print('📜 Loading transactions (page 1)...');
      final offset = _currentPage * _pageSize;
      _transactions = await _transactionService.getUserTransactions(
        limit: _pageSize,
        offset: offset,
      );
      print('✅ Transactions loaded: ${_transactions.length} transactions');

      // Load upcoming scheduled payments
      try {
        _upcomingPayments = await _scheduledPaymentService.getUpcomingPayments();
        print('✅ Upcoming payments loaded: ${_upcomingPayments.length}');
      } catch (e) {
        print('⚠️ Could not load upcoming payments: $e');
        _upcomingPayments = [];
      }

      // Calculate balances with live exchange rate
      await _calculateBalances();
      notifyListeners();
    } catch (e, stackTrace) {
      print('❌ Error loading dashboard data: $e');
      print('Stack trace: $stackTrace');

      // Handle authentication errors specifically
      if (e.toString().contains('Unauthorized') ||
          e.toString().contains('401')) {
        _showError('Authentication required - please login again');
        // You could navigate to login screen here
        // _navigationService.replaceWithSigninView();
      } else {
        _showError('Failed to load dashboard data: $e');
      }
    } finally {
      setBusy(false);
    }
  }

  Future<void> _calculateBalances() async {
    // Total balance - sum of all token USD values
    _totalBalance =
        _tokenBalances.fold(0.0, (sum, token) => sum + token.usdValue);

    // Fetch live NGN rate and convert
    _ngnRate = await _exchangeRateService.getNgnRate();
    _nairaBalance = _totalBalance * _ngnRate;

    // Available and locked balances from wallet data
    _availableBalance = _walletData?.availableBalance ?? 0.0;
    _lockedBalance = _walletData?.lockedBalance ?? 0.0;

    // Asset balance - sum of all token USD values
    _assetBalance =
        _tokenBalances.fold(0.0, (sum, token) => sum + token.usdValue);
  }

  /// Get token balance by symbol
  UserTokenBalance? getTokenBalance(String symbol) {
    try {
      return _tokenBalances.firstWhere(
          (token) => token.tokenSymbol.toUpperCase() == symbol.toUpperCase());
    } catch (e) {
      return null;
    }
  }

  /// Get total balance for a specific token symbol
  double getTokenAmount(String symbol) {
    final token = getTokenBalance(symbol);
    return token?.amount ?? 0.0;
  }

  /// Get USD value for a specific token symbol
  double getTokenUsdValue(String symbol) {
    final token = getTokenBalance(symbol);
    return token?.usdValue ?? 0.0;
  }

  /// Get NGN value for a specific token symbol
  double getTokenNgnValue(String symbol) {
    final token = getTokenBalance(symbol);
    return token?.ngnValue ?? 0.0;
  }

  /// Format currency with proper symbol
  String formatCurrency(double amount, {String currency = 'USD'}) {
    if (currency == 'NGN') {
      return formatCurrencyToNGN(amount);
    }

    final formatter = NumberFormat.currency(
      symbol: '',
      decimalDigits: 2,
    );

    return formatter.format(amount);
  }

  String formatCurrencyToUSD(double amount, {String currency = 'USD'}) {
    final formatter = NumberFormat.currency(
      symbol: '\$',
      decimalDigits: 2,
    );
    return formatter.format(amount);
  }

  /// Format currency to NGN
  String formatCurrencyToNGN(double amount) {
    final formatter = NumberFormat.currency(
      symbol: '',
      decimalDigits: 2,
    );
    return formatter.format(amount);
  }

  /// Format crypto amount with token symbol
  String formatCrypto(double amount, String symbol) {
    return '${amount.toStringAsFixed(6)} $symbol';
  }

  void selectFilter(int index) {
    selectedFilterIndex = index;
    notifyListeners();
    // Add your filtering logic here
  }

  // Navigation Actions
  void selectTab(int index) {
    _selectedTabIndex = index;
    notifyListeners();

    switch (index) {
      case 0:
        // Already on dashboard
        break;
      case 2:
        navigateToSettings();
        break;
    }
  }

  void navigateToSettings() {
    // Navigate to settings screen
    // _navigationService.navigateTo(Routes.settingsView);
  }

  // Action Methods
  Future<void> withdraw() async {
    if (_isOffline) {
      _showError('You are offline. Please connect to the internet.');
      return;
    }

    setBusy(true);

    try {
      // Navigate to withdrawal screen or show withdrawal dialog
      final result = await _dialogService.showDialog(
        title: 'Withdraw Funds',
        description: 'Enter withdrawal amount',
        // You can add custom dialog here
      );

      if (result?.confirmed == true) {
        // Process withdrawal
        _snackbarService.showSnackbar(
          message: 'Withdrawal processed successfully',
          duration: const Duration(seconds: 2),
        );

        // Refresh data
        await _loadDashboardData();
      }
    } catch (e) {
      _showError('Withdrawal failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  Future<void> deposit() async {
    setBusy(true);

    try {
      // Navigate to deposit screen or show deposit dialog
      final result = await _dialogService.showDialog(
        title: 'Deposit Funds',
        description: 'Enter deposit amount',
        // You can add custom dialog here
      );

      if (result?.confirmed == true) {
        // Process deposit
        _snackbarService.showSnackbar(
          message: 'Deposit processed successfully',
          duration: const Duration(seconds: 2),
        );

        // Refresh data
        await _loadDashboardData();
      }
    } catch (e) {
      _showError('Deposit failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  Future<void> refresh() async {
    _snackbarService.showSnackbar(
      message: 'Refreshing dashboard...',
      duration: const Duration(seconds: 1),
    );
    await _loadDashboardData();
  }

  void openMenu() {
    // Open side menu or navigation drawer
    _snackbarService.showSnackbar(
      message: 'Menu opened',
      duration: const Duration(seconds: 1),
    );
  }

  void openMainMenu() {
    // Open main menu from bottom navigation
    _snackbarService.showSnackbar(
      message: 'Main menu opened',
      duration: const Duration(seconds: 1),
    );
  }

  void _showError(String message) {
    _dialogService.showDialog(
      title: 'Error',
      description: message,
    );
  }

  List<Transaction> _transactions = [];
  int _currentPage = 0;
  static const int _pageSize = 20;
  bool _hasMore = true;
  bool _isLoadingMore = false;

  // Search & filter state (issue #456)
  String _searchQuery = '';
  String? _statusFilter;   // 'completed', 'pending', 'failed', or null (all)
  String? _typeFilter;     // 'credit', 'debit', or null (all)

  String get searchQuery => _searchQuery;
  String? get statusFilter => _statusFilter;
  String? get typeFilter => _typeFilter;

  List<Transaction> get transactions => _transactions;
  bool get hasMore => _hasMore;
  bool get isLoadingMore => _isLoadingMore;

  /// Update search query and filter the in-memory list.
  void onSearchChanged(String query) {
    _searchQuery = query.trim().toLowerCase();
    notifyListeners();
  }

  /// Set status filter ('completed', 'pending', 'failed', or null for all).
  void setStatusFilter(String? status) {
    _statusFilter = status;
    notifyListeners();
  }

  /// Set type filter ('credit', 'debit', or null for all).
  void setTypeFilter(String? type) {
    _typeFilter = type;
    notifyListeners();
  }

  /// Clear all search/filter state.
  void clearSearchFilters() {
    _searchQuery = '';
    _statusFilter = null;
    _typeFilter = null;
    selectedFilterIndex = 0;
    notifyListeners();
  }

  List<Transaction> get filteredTransactions {
    var list = _transactions;

    // Apply type quick-filter (tab buttons)
    switch (selectedFilterIndex) {
      case 1:
        list = list.where((t) => t.type == 'credit').toList();
        break;
      case 2:
        list = list.where((t) => t.type == 'debit').toList();
        break;
    }

    // Apply status filter from filter sheet
    if (_statusFilter != null) {
      list = list.where((t) => t.status == _statusFilter).toList();
    }

    // Apply type filter from filter sheet (overrides tab)
    if (_typeFilter != null) {
      list = list.where((t) => t.type == _typeFilter).toList();
    }

    // Apply search query
    if (_searchQuery.isNotEmpty) {
      list = list.where((t) {
        final q = _searchQuery;
        return t.reference.toLowerCase().contains(q) ||
            t.userTag.toLowerCase().contains(q) ||
            (t.receiverTag?.toLowerCase().contains(q) ?? false) ||
            t.amount.toLowerCase().contains(q) ||
            t.tokenSymbol.toLowerCase().contains(q) ||
            (t.notes?.toLowerCase().contains(q) ?? false) ||
            (t.description?.toLowerCase().contains(q) ?? false);
      }).toList();
    }

    return list;
  }

  /// Share a receipt for a completed transaction.
  Future<void> openTransactionDetails(Transaction transaction) async {
    if (transaction.status.toLowerCase() != 'completed') {
      _dialogService.showDialog(
        title: 'Receipt unavailable',
        description: 'Receipts are only available for completed transactions.',
      );
      return;
    }

    setBusy(true);

    try {
      final receiptBytes = await _transactionService.getTransactionReceipt(transaction.id);
      final file = await _saveReceiptToFile(receiptBytes, transaction.id);
      await Share.shareXFiles([XFile(file.path)], subject: 'Transaction Receipt');

      _snackbarService.showSnackbar(
        message: 'Receipt ready to share',
        duration: const Duration(seconds: 2),
      );
    } catch (e) {
      _showError('Failed to prepare receipt: $e');
    } finally {
      setBusy(false);
    }
  }

  Future<File> _saveReceiptToFile(Uint8List bytes, int transactionId) async {
    final tempDir = await getTemporaryDirectory();
    final file = File('${tempDir.path}/receipt-$transactionId.pdf');
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  void _launchURL(String url) async {
    final Uri uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      _dialogService.showDialog(
          title: 'Error', description: 'Could not open URL');
    }
  }

  /// Load more transactions for infinite scroll
  Future<void> loadMoreTransactions() async {
    if (_isLoadingMore || !_hasMore) return;
    _isLoadingMore = true;
    notifyListeners();

    try {
      final offset = _currentPage * _pageSize;
      final nextTransactions = await _transactionService.getUserTransactions(
        limit: _pageSize,
        offset: offset,
      );

      if (nextTransactions.isEmpty) {
        _hasMore = false;
      } else {
        _transactions.addAll(nextTransactions);
        _currentPage++;
        // Check if there are more transactions
        if (nextTransactions.length < _pageSize) {
          _hasMore = false;
        }
      }

      notifyListeners();
    } catch (e) {
      print('❌ Error loading more transactions: $e');
      _isLoadingMore = false;
      notifyListeners();
    }

    _isLoadingMore = false;
  }

  /// Navigate to scheduled payments view
  void navigateToScheduledPayments() {
    _navigationService.navigateToScheduledPaymentsView();
  }

  /// Reset transaction pagination
  void resetTransactionPagination() {
    _transactions = [];
    _currentPage = 0;
    _hasMore = true;
    _isLoadingMore = false;
  }
}