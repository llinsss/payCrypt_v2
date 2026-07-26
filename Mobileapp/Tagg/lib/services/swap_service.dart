import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';

/// Model representing a swap quote response from the API
class SwapQuote {
  final String quoteId;
  final String fromToken;
  final String toToken;
  final int fromTokenId;
  final int toTokenId;
  final int chainId;
  final String amount;
  final double slippage;
  final double rate;
  final String expectedOutput;
  final String minimumOutput;
  final double feePercent;
  final String feeAmount;
  final String estimatedGas;
  final String priceImpact;
  final String expiresAt;
  final String createdAt;

  SwapQuote({
    required this.quoteId,
    required this.fromToken,
    required this.toToken,
    required this.fromTokenId,
    required this.toTokenId,
    required this.chainId,
    required this.amount,
    required this.slippage,
    required this.rate,
    required this.expectedOutput,
    required this.minimumOutput,
    required this.feePercent,
    required this.feeAmount,
    required this.estimatedGas,
    required this.priceImpact,
    required this.expiresAt,
    required this.createdAt,
  });

  factory SwapQuote.fromJson(Map<String, dynamic> json) {
    return SwapQuote(
      quoteId: json['quoteId'] ?? '',
      fromToken: json['fromToken'] ?? '',
      toToken: json['toToken'] ?? '',
      fromTokenId: json['fromTokenId'] ?? 0,
      toTokenId: json['toTokenId'] ?? 0,
      chainId: json['chainId'] ?? 0,
      amount: json['amount'] ?? '0',
      slippage: (json['slippage'] ?? 0.5).toDouble(),
      rate: (json['rate'] ?? 0.0).toDouble(),
      expectedOutput: json['expectedOutput'] ?? '0',
      minimumOutput: json['minimumOutput'] ?? '0',
      feePercent: (json['feePercent'] ?? 0.0).toDouble(),
      feeAmount: json['feeAmount'] ?? '0',
      estimatedGas: json['estimatedGas'] ?? '0',
      priceImpact: json['priceImpact'] ?? '0',
      expiresAt: json['expiresAt'] ?? '',
      createdAt: json['createdAt'] ?? '',
    );
  }
}

/// Model representing a completed swap result
class SwapResult {
  final String swapId;
  final String reference;
  final int userId;
  final String fromToken;
  final String toToken;
  final int fromTokenId;
  final int toTokenId;
  final int chainId;
  final String inputAmount;
  final String outputAmount;
  final double rate;
  final double feePercent;
  final String feeAmount;
  final String status;
  final String? txHash;
  final String completedAt;

  SwapResult({
    required this.swapId,
    required this.reference,
    required this.userId,
    required this.fromToken,
    required this.toToken,
    required this.fromTokenId,
    required this.toTokenId,
    required this.chainId,
    required this.inputAmount,
    required this.outputAmount,
    required this.rate,
    required this.feePercent,
    required this.feeAmount,
    required this.status,
    this.txHash,
    required this.completedAt,
  });

  factory SwapResult.fromJson(Map<String, dynamic> json) {
    return SwapResult(
      swapId: json['swapId'] ?? '',
      reference: json['reference'] ?? '',
      userId: json['userId'] ?? 0,
      fromToken: json['fromToken'] ?? '',
      toToken: json['toToken'] ?? '',
      fromTokenId: json['fromTokenId'] ?? 0,
      toTokenId: json['toTokenId'] ?? 0,
      chainId: json['chainId'] ?? 0,
      inputAmount: json['inputAmount'] ?? '0',
      outputAmount: json['outputAmount'] ?? '0',
      rate: (json['rate'] ?? 0.0).toDouble(),
      feePercent: (json['feePercent'] ?? 0.0).toDouble(),
      feeAmount: json['feeAmount'] ?? '0',
      status: json['status'] ?? '',
      txHash: json['txHash'],
      completedAt: json['completedAt'] ?? '',
    );
  }
}

/// Service for interacting with the swap API endpoints.
class SwapService {
  final ApiService _apiService = locator<ApiService>();

  /// Get a swap quote from the backend (step 1 of two-step swap).
  ///
  /// [fromToken] Token symbol to swap from (e.g., "STRK")
  /// [toToken] Token symbol to swap to (e.g., "LSK")
  /// [amount] Amount of fromToken to swap
  /// [chainId] Chain ID to execute the swap on
  /// [slippage] Max slippage tolerance in percent (default 0.5)
  Future<SwapQuote> getQuote({
    required String fromToken,
    required String toToken,
    required double amount,
    required int chainId,
    double slippage = 0.5,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.swapQuote,
        {
          'fromToken': fromToken.toUpperCase(),
          'toToken': toToken.toUpperCase(),
          'amount': amount,
          'chainId': chainId,
          'slippage': slippage,
        },
      );

      if (response != null && response['success'] == true) {
        return SwapQuote.fromJson(response['data']);
      } else {
        throw Exception(response?['error'] ?? 'Failed to get swap quote');
      }
    } catch (e) {
      print('❌ Error getting swap quote: $e');
      rethrow;
    }
  }

  /// Confirm and execute a swap using a previously obtained quote (step 2).
  ///
  /// [quoteId] The ID of the quote to confirm
  /// [fromToken] Token symbol to swap from
  /// [toToken] Token symbol to swap to
  /// [amount] Amount of fromToken to swap
  /// [chainId] Chain ID
  /// [minReceiveAmount] Optional minimum amount willing to receive
  Future<SwapResult> confirmSwap({
    required String quoteId,
    required String fromToken,
    required String toToken,
    required double amount,
    required int chainId,
    double? minReceiveAmount,
  }) async {
    try {
      final body = {
        'quoteId': quoteId,
        'fromToken': fromToken.toUpperCase(),
        'toToken': toToken.toUpperCase(),
        'amount': amount,
        'chainId': chainId,
      };

      if (minReceiveAmount != null) {
        body['minReceiveAmount'] = minReceiveAmount;
      }

      final response = await _apiService.post(
        ApiConstants.swapConfirm,
        body,
      );

      if (response != null && response['success'] == true) {
        return SwapResult.fromJson(response['data']);
      } else {
        throw Exception(response?['error'] ?? 'Failed to confirm swap');
      }
    } catch (e) {
      print('❌ Error confirming swap: $e');
      rethrow;
    }
  }

  /// Execute a swap in a single call (combined quote + confirm).
  ///
  /// [fromToken] Token symbol to swap from
  /// [toToken] Token symbol to swap to
  /// [amount] Amount of fromToken to swap
  /// [chainId] Chain ID to execute the swap on
  /// [slippage] Max slippage tolerance in percent
  /// [confirm] If true, executes the swap immediately; if false, returns a quote
  Future<dynamic> executeSwap({
    required String fromToken,
    required String toToken,
    required double amount,
    required int chainId,
    double slippage = 0.5,
    bool confirm = true,
  }) async {
    try {
      final response = await _apiService.post(
        ApiConstants.swap,
        {
          'fromToken': fromToken.toUpperCase(),
          'toToken': toToken.toUpperCase(),
          'amount': amount,
          'chainId': chainId,
          'slippage': slippage,
          'confirm': confirm,
        },
      );

      if (response != null && response['success'] == true) {
        if (confirm) {
          return SwapResult.fromJson(response['data']);
        } else {
          return SwapQuote.fromJson(response['data']);
        }
      } else {
        throw Exception(response?['error'] ?? 'Failed to execute swap');
      }
    } catch (e) {
      print('❌ Error executing swap: $e');
      rethrow;
    }
  }

  /// Get the status of a swap by its ID.
  Future<Map<String, dynamic>> getSwapStatus(String swapId) async {
    try {
      final response = await _apiService.get('${ApiConstants.swap}/$swapId');
      if (response != null && response['success'] == true) {
        return response['data'];
      }
      throw Exception('Failed to get swap status');
    } catch (e) {
      print('❌ Error getting swap status: $e');
      rethrow;
    }
  }

  /// Get list of supported tokens for swapping.
  Future<List<Map<String, dynamic>>> getSupportedTokens() async {
    try {
      final response = await _apiService.get('${ApiConstants.swap}/tokens');
      if (response != null && response['success'] == true) {
        return List<Map<String, dynamic>>.from(response['data']);
      }
      return [];
    } catch (e) {
      print('❌ Error getting supported tokens: $e');
      return [];
    }
  }

  /// Get list of supported chains for swapping.
  Future<List<Map<String, dynamic>>> getSupportedChains() async {
    try {
      final response = await _apiService.get('${ApiConstants.swap}/chains');
      if (response != null && response['success'] == true) {
        return List<Map<String, dynamic>>.from(response['data']);
      }
      return [];
    } catch (e) {
      print('❌ Error getting supported chains: $e');
      return [];
    }
  }
}
