import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/user_token_balance.dart';
import 'package:Tagg/models/dashboard_summary.dart';
import 'package:Tagg/models/wallet_data.dart';
import 'package:Tagg/models/chains_models.dart';
import 'package:Tagg/services/user_service.dart';
import 'package:Tagg/services/wallet_service.dart';
import 'package:Tagg/services/chains_service.dart';
import 'package:intl/intl.dart';
import 'package:stacked/stacked.dart';

class BalanceViewModel extends BaseViewModel {
  final _userService = locator<UserService>();
  final _walletService = locator<WalletService>();
  final _chainsService = locator<ChainsService>();

  String _selectedChain = 'All Chains';

  // Dashboard data
  DashboardSummary? _dashboardSummary;
  WalletData? _walletData;
  List<UserTokenBalance> _tokenBalances = [];
  List<Chain> _chains = [];

  // Computed balances
  double _totalBalance = 0.00;
  double _nairaBalance = 0.00;
  double _availableBalance = 0.00;
  double _lockedBalance = 0.00;

  // UI State
  int selectedFilterIndex = 0;

  // Getters
  double get nairaBalance => _nairaBalance;
  double get totalBalance => _totalBalance;
  double get availableBalance => _availableBalance;
  double get lockedBalance => _lockedBalance;
  double get totalDeposits => _dashboardSummary?.totalDeposit ?? 0.0;
  double get totalWithdrawals => _dashboardSummary?.totalWithdrawal ?? 0.0;
  double get portfolioGrowth => _dashboardSummary?.portfolioGrowth ?? 0.0;

  String get selectedChain => _selectedChain;
  List<UserTokenBalance> get tokenBalances => _tokenBalances;
  List<UserTokenBalance> get filteredTokenBalances => getFilteredAssets();
  List<Chain> get chains => _chains;

  // Available chains from API
  List<String> get availableChains {
    final chainNames = <String>{'All Chains'};
    chainNames.addAll(_chains.map((chain) => chain.name));
    return chainNames.toList();
  }

  void selectChain(String chain) {
    _selectedChain = chain;
    notifyListeners();
  }

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

    String formatDollarCurrency(double amount, {String currency = 'USD'}) {
    if (currency == 'NGN') {
      return formatCurrencyToNGN(amount);
    }
    final formatter = NumberFormat.currency(
      symbol: '\$',
      decimalDigits: 2,
    );
    return formatter.format(amount);
  }

  String formatCurrencyToNGN(double amount) {
    final formatter = NumberFormat.currency(
      symbol: '₦',
      decimalDigits: 2,
    );
    return formatter.format(amount);
  }

  String formatCrypto(double amount, String symbol) {
    return '${amount.toStringAsFixed(2)} $symbol';
  }

  List<UserTokenBalance> getFilteredAssets() {
    if (_selectedChain == 'All Chains') {
      return _tokenBalances;
    }

    // Find the selected chain
    final selectedChainObj = _chains.firstWhere(
      (chain) => chain.name == _selectedChain,
      orElse: () => _chains.first,
    );

    // Filter tokens by matching chain symbol or native currency symbol
    return _tokenBalances.where((token) {
      final tokenSymbol = token.tokenSymbol.toUpperCase();
      final chainSymbol = selectedChainObj.symbol.toUpperCase();
      final nativeCurrencySymbol =
          selectedChainObj.nativeCurrency.symbol.toUpperCase();

      return tokenSymbol == chainSymbol ||
          tokenSymbol == nativeCurrencySymbol;
    }).toList();
  }

  double get totalPortfolioValue {
    return _tokenBalances.fold(0.0, (sum, token) => sum + token.usdValue);
  }

  // Calculate asset allocation percentage for a given token
  double getAssetAllocationPercentage(UserTokenBalance token) {
    if (totalPortfolioValue == 0) return 0;
    return (token.usdValue / totalPortfolioValue) * 100;
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

  Future<void> initialize() async {
    await loadData();
  }

  Future<void> loadData() async {
    setBusy(true);

    try {
      print('📊 Loading balance data...');

      // Load chains first
      _chains = await _chainsService.getChains();
      print('✅ Chains loaded: ${_chains.length} chains');

      // Load dashboard summary
      _dashboardSummary = await _userService.getDashboardSummary();
      print('✅ Dashboard summary loaded');

      // Load wallet data
      _walletData = await _walletService.getWalletBalance();
      print('✅ Wallet data loaded');

      // Load token balances
      _tokenBalances = await _userService.getUserTokenBalances();
      print('✅ Token balances loaded: ${_tokenBalances.length} tokens');

      // Calculate summary data
      _calculateSummaryData();

      notifyListeners();
    } catch (e, stackTrace) {
      print('❌ Error loading balance data: $e');
      print('Stack trace: $stackTrace');

      // Handle authentication errors
      if (e.toString().contains('Unauthorized') ||
          e.toString().contains('401')) {
        print('Authentication required - please login again');
        rethrow;
      }
    } finally {
      setBusy(false);
    }
  }

  void _calculateSummaryData() {
    // Total balance - sum of all token USD values
    _totalBalance =
        _tokenBalances.fold(0.0, (sum, token) => sum + token.usdValue);

    // Naira balance - sum of all token USD values * NGN rate
    // Using 1485 as the conversion rate (you can adjust this)
    _nairaBalance = _totalBalance * 1485;

    // Available and locked balances from wallet data
    _availableBalance = _walletData?.availableBalance ?? 0.0;
    _lockedBalance = _walletData?.lockedBalance ?? 0.0;
  }

  Future<void> refreshData() async {
    await loadData();
  }

  Future<void> deposit() async {
    // Handle deposit action - navigate to deposit screen
    print('Initiating deposit...');
  }

  Future<void> withdraw() async {
    // Handle withdraw action - navigate to withdrawal screen
    print('Initiating withdrawal...');
  }
}
