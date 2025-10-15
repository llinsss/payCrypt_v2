class Transaction {
  final int id;
  final int userId;
  final int tokenId;
  final int? chainId;
  final String reference;
  final String type; // "debit" or "credit"
  final String status; // "completed", "pending", "failed"
  final String? txHash;
  final String usdValue;
  final String amount;
  final String timestamp;
  final String fromAddress;
  final String toAddress;
  final String? description;
  final dynamic extra;
  final String createdAt;
  final String updatedAt;
  final String userEmail;
  final String userTag;
  final String tokenName;
  final String tokenSymbol;
  final String tokenLogoUrl;
  final String? chainName;
  final String? chainSymbol;

  Transaction({
    required this.id,
    required this.userId,
    required this.tokenId,
    this.chainId,
    required this.reference,
    required this.type,
    required this.status,
    this.txHash,
    required this.usdValue,
    required this.amount,
    required this.timestamp,
    required this.fromAddress,
    required this.toAddress,
    this.description,
    this.extra,
    required this.createdAt,
    required this.updatedAt,
    required this.userEmail,
    required this.userTag,
    required this.tokenName,
    required this.tokenSymbol,
    required this.tokenLogoUrl,
    this.chainName,
    this.chainSymbol,
  });

  factory Transaction.fromJson(Map<String, dynamic> json) {
    return Transaction(
      id: json['id'],
      userId: json['user_id'],
      tokenId: json['token_id'],
      chainId: json['chain_id'],
      reference: json['reference'] ?? '',
      type: json['type'] ?? '',
      status: json['status'] ?? '',
      txHash: json['tx_hash'],
      usdValue: json['usd_value'] ?? '',
      amount: json['amount'] ?? '',
      timestamp: json['timestamp'] ?? '',
      fromAddress: json['from_address'] ?? '',
      toAddress: json['to_address'] ?? '',
      description: json['description'],
      extra: json['extra'],
      createdAt: json['created_at'] ?? '',
      updatedAt: json['updated_at'] ?? '',
      userEmail: json['user_email'] ?? '',
      userTag: json['user_tag'] ?? '',
      tokenName: json['token_name'] ?? '',
      tokenSymbol: json['token_symbol'] ?? '',
      tokenLogoUrl: json['token_logo_url'] ?? '',
      chainName: json['chain_name'],
      chainSymbol: json['chain_symbol'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'token_id': tokenId,
      'chain_id': chainId,
      'reference': reference,
      'type': type,
      'status': status,
      'tx_hash': txHash,
      'usd_value': usdValue,
      'amount': amount,
      'timestamp': timestamp,
      'from_address': fromAddress,
      'to_address': toAddress,
      'description': description,
      'extra': extra,
      'created_at': createdAt,
      'updated_at': updatedAt,
      'user_email': userEmail,
      'user_tag': userTag,
      'token_name': tokenName,
      'token_symbol': tokenSymbol,
      'token_logo_url': tokenLogoUrl,
      'chain_name': chainName,
      'chain_symbol': chainSymbol,
    };
  }

  // Helper to get TransactionStatus enum
  TransactionStatus get statusEnum {
    switch (status.toLowerCase()) {
      case 'completed':
        return TransactionStatus.completed;
      case 'pending':
        return TransactionStatus.pending;
      case 'failed':
        return TransactionStatus.failed;
      default:
        return TransactionStatus.pending;
    }
  }

  // Helper to get display type
  String get displayType {
    return type == 'debit' ? 'Debit' : 'Credit';
  }

  // Helper to format amount with symbol
  String get formattedAmount {
    return '$amount $tokenSymbol';
  }

  // Helper to format date
  String get formattedDate {
    try {
      final date = DateTime.parse(timestamp);
      return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
    } catch (e) {
      return timestamp.split(' ')[0]; // Fallback to just date part
    }
  }

  // Helper to format USD value with 2 decimal places and dollar sign
  String get formattedUsdValue {
    try {
      final value = double.parse(usdValue);
      return '\$${value.toStringAsFixed(2)}';
    } catch (e) {
      return '\$${usdValue}'; // Fallback if parsing fails
    }
  }
}

enum TransactionStatus { completed, pending, failed }
