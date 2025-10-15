// lib/core/constants/api_constants.dart
class ApiConstants {
  static const String baseUrl = 'https://paycryptv2-production.up.railway.app';
  static const String apiUrl = '$baseUrl/api';

  // Auth endpoints
  static const String register = '/auth/register';
  static const String login = '/auth/login';

  // Balance endpoints
  static const String balances = '/balances';
  static String balanceById(int id) => '/balances/$id';

  // Bank Account endpoints
  static const String bankAccounts = '/bank-accounts';
  static String bankAccountById(int id) => '/bank-accounts/$id';

  // KYC endpoints
  static const String kycs = '/kycs';
  static String kycById(int id) => '/kycs/$id';

  // User endpoints
  static const String userProfile = '/users/profile';
  static const String dashboardSummary = '/users/dashboard-summary';

  // Wallet endpoints
  static const String wallets = '/wallets';
  static const String walletBalance = '/wallets/balance';
  static const String sendToTag = '/wallets/send-to-tag';

  // Chain endpoints
  static const String chains = '/chains';
  static String chainById(int id) => '/chains/$id';

  // Token endpoints
  static const String tokens = '/tokens';
  static String tokenById(int id) => '/tokens/$id';

  // Transaction endpoints
  static const String transactions = '/transactions';
  static String transactionById(int id) => '/transactions/$id';

  // Health check
  static const String health = '/health';
}
