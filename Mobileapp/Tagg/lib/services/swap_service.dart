import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';

class SwapQuote {
  final String quoteId;
  final String fromToken;
  final String toToken;
  final String amountIn;
  final String amountOut;
  final String minAmountOut;
  final String expiresAt;
  final String provider;

  SwapQuote({
    required this.quoteId,
    required this.fromToken,
    required this.toToken,
    required this.amountIn,
    required this.amountOut,
    required this.minAmountOut,
    required this.expiresAt,
    required this.provider,
  });

  factory SwapQuote.fromJson(Map<String, dynamic> json) {
    return SwapQuote(
      quoteId: json['quoteId']?.toString() ?? '',
      fromToken: json['fromToken']?.toString() ?? '',
      toToken: json['toToken']?.toString() ?? '',
      amountIn: json['amountIn']?.toString() ?? '0',
      amountOut: json['amountOut']?.toString() ?? '0',
      minAmountOut: json['minAmountOut']?.toString() ?? '0',
      expiresAt: json['expiresAt']?.toString() ?? '',
      provider: json['provider']?.toString() ?? '',
    );
  }
}

class SwapExecutionResult {
  final String status;
  final String txHash;
  final int? transactionId;
  final String provider;

  SwapExecutionResult({
    required this.status,
    required this.txHash,
    this.transactionId,
    required this.provider,
  });

  factory SwapExecutionResult.fromJson(Map<String, dynamic> json) {
    final transaction = json['transaction'];
    return SwapExecutionResult(
      status: json['status']?.toString() ?? 'completed',
      txHash: json['txHash']?.toString() ?? '',
      provider: json['provider']?.toString() ?? '',
      transactionId: transaction is Map<String, dynamic>
          ? int.tryParse(transaction['id']?.toString() ?? '')
          : null,
    );
  }
}

class SwapService {
  SwapService({ApiService? apiService})
      : _apiService = apiService ?? locator<ApiService>();

  final ApiService _apiService;

  Future<SwapQuote> getQuote({
    required String fromToken,
    required String toToken,
    required String amount,
    required String chainId,
    int? slippageBps,
    double? slippagePercent,
  }) async {
    final body = <String, dynamic>{
      'fromToken': fromToken,
      'toToken': toToken,
      'amount': amount,
      'chainId': chainId,
      if (slippageBps != null) 'slippageBps': slippageBps,
      if (slippagePercent != null) 'slippagePercent': slippagePercent,
    };

    final response = await _apiService.post(ApiConstants.swap, body);
    final data = _extractData(response);
    return SwapQuote.fromJson(data);
  }

  Future<SwapExecutionResult> confirmSwap(String quoteId) async {
    final response = await _apiService.post(ApiConstants.swap, {
      'action': 'confirm',
      'quoteId': quoteId,
    });

    final data = _extractData(response);
    return SwapExecutionResult.fromJson(data);
  }

  Future<SwapExecutionResult> executeSwap({
    required String fromToken,
    required String toToken,
    required String amount,
    required String chainId,
    int? slippageBps,
    double? slippagePercent,
  }) async {
    final quote = await getQuote(
      fromToken: fromToken,
      toToken: toToken,
      amount: amount,
      chainId: chainId,
      slippageBps: slippageBps,
      slippagePercent: slippagePercent,
    );
    return confirmSwap(quote.quoteId);
  }

  Map<String, dynamic> _extractData(dynamic response) {
    if (response is Map<String, dynamic>) {
      final data = response['data'];
      if (data is Map<String, dynamic>) return data;
      return response;
    }
    throw Exception('Unexpected swap response');
  }
}
