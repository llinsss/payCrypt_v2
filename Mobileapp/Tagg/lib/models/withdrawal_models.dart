/// Withdrawal request and response models

/// Request model for withdrawing to a tag
class WithdrawToTagRequest {
  final int balanceId;
  final String amount;
  final String receiverTag;

  WithdrawToTagRequest({
    required this.balanceId,
    required this.amount,
    required this.receiverTag,
  });

  Map<String, dynamic> toJson() => {
        'balance_id': balanceId,
        'amount': amount,
        'receiver_tag': receiverTag,
      };
}

/// Response model for withdrawal transactions
class WithdrawalResponse {
  final String data;
  final TransactionInfo? tx;

  WithdrawalResponse({
    required this.data,
    this.tx,
  });

  factory WithdrawalResponse.fromJson(Map<String, dynamic> json) {
    return WithdrawalResponse(
      data: json['data'] ?? '',
      tx: json['tx'] != null ? TransactionInfo.fromJson(json['tx']) : null,
    );
  }

  bool get isSuccess => data.toLowerCase() == 'success';
}

/// Transaction information from withdrawal response
class TransactionInfo {
  final String transactionHash;

  TransactionInfo({
    required this.transactionHash,
  });

  factory TransactionInfo.fromJson(Map<String, dynamic> json) {
    return TransactionInfo(
      transactionHash: json['transaction_hash'] ?? '',
    );
  }
}
