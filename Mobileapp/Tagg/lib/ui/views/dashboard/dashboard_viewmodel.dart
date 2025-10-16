import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/dashboard_summary.dart';
import 'package:Tagg/models/transaction_model.dart';
import 'package:Tagg/models/user_token_balance.dart';
import 'package:Tagg/models/wallet_data.dart';
import 'package:Tagg/models/chains_models.dart';
import 'package:Tagg/services/transaction_service.dart';
import 'package:Tagg/services/user_service.dart';
import 'package:Tagg/services/wallet_service.dart';
import 'package:Tagg/services/chains_service.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

class DashboardViewModel extends BaseViewModel {
  final _dialogService = locator<DialogService>();
  final _snackbarService = locator<SnackbarService>();
  final _userService = locator<UserService>();
  final _walletService = locator<WalletService>();
  final _transactionService = locator<TransactionService>();
  final _chainsService = locator<ChainsService>();

  // Dashboard Data - matching web version structure
  DashboardSummary? _dashboardSummary;
  WalletData? _walletData;
  List<UserTokenBalance> _tokenBalances = [];
  List<Chain> _chains = [];

  // Computed balances
  double _totalBalance = 0.00; // Total balance in USD (from dashboard summary)
  double _nairaBalance = 0.00; // Total balance in NGN (converted)
  double _availableBalance = 0.00; // Available balance from wallet
  double _lockedBalance = 0.00; // Locked balance from wallet
  double _assetBalance = 0.00; // Total asset value from token balances

  // UI State
  int _selectedTabIndex = 0;
  int selectedFilterIndex = 0;

  // Getters
  DashboardSummary? get dashboardSummary => _dashboardSummary;
  WalletData? get walletData => _walletData;
  List<UserTokenBalance> get tokenBalances => _tokenBalances;
  List<Chain> get chains => _chains;

  double get totalBalance => _totalBalance;
  double get nairaBalance => _nairaBalance;
  double get availableBalance => _availableBalance;
  double get lockedBalance => _lockedBalance;
  double get assetBalance => _assetBalance;
  double get totalDeposits => _dashboardSummary?.totalDeposit ?? 0.0;
  double get totalWithdrawals => _dashboardSummary?.totalWithdrawal ?? 0.0;
  double get portfolioGrowth => _dashboardSummary?.portfolioGrowth ?? 0.0;

  int get selectedTabIndex => _selectedTabIndex;

  bool get hasData => _dashboardSummary != null;

  void initialize() {
    _loadDashboardData();
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

      print('📜 Loading transactions...');
      _transactions = await _transactionService.getRecentTransactions();
      print('✅ Transactions loaded: ${_transactions.length} transactions');

      // Calculate balances
      _calculateBalances();

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

  void _calculateBalances() {
    // Total balance - sum of all token USD values
    _totalBalance =
        _tokenBalances.fold(0.0, (sum, token) => sum + token.usdValue);

    // Naira balance - sum of all token USD values * NGN rate
    // Using 1485 as the conversion rate (you can adjust this)
    _nairaBalance = _totalBalance * 1485;

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
  List<Transaction> get transactions => _transactions;

  List<Transaction> get filteredTransactions {
    switch (selectedFilterIndex) {
      case 1: // Credit
        return _transactions.where((t) => t.type == 'credit').toList();
      case 2: // Debit
        return _transactions.where((t) => t.type == 'debit').toList();
      default: // All
        return _transactions;
    }
  }

  /// Open transaction details in explorer
  void openTransactionDetails(Transaction transaction) {
    if (transaction.txHash != null && transaction.txHash!.isNotEmpty) {
      final url =
          'https://sepolia.voyager.online/tx/${transaction.txHash}'; // Example for Starknet, adjust based on chain
      _launchURL(url);
    } else {
      _dialogService.showDialog(
        title: 'Transaction Details',
        description: '''
Type: ${transaction.displayType}
Amount: ${transaction.formattedAmount}
Status: ${transaction.status}
Reference: ${transaction.reference}
From: ${transaction.fromAddress}
To: ${transaction.toAddress}
        ''',
      );
    }
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
}
