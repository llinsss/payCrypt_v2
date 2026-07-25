/// A single payment entry in a batch
class BatchPaymentEntry {
  final String recipientTag;
  final double amount;
  final String asset;
  final String? memo;

  BatchPaymentEntry({
    required this.recipientTag,
    required this.amount,
    required this.asset,
    this.memo,
  });

  Map<String, dynamic> toJson() => {
        'recipientTag': recipientTag,
        'amount': amount,
        'asset': asset,
        if (memo != null && memo!.isNotEmpty) 'memo': memo,
      };

  BatchPaymentEntry copyWith({
    String? recipientTag,
    double? amount,
    String? asset,
    String? memo,
  }) {
    return BatchPaymentEntry(
      recipientTag: recipientTag ?? this.recipientTag,
      amount: amount ?? this.amount,
      asset: asset ?? this.asset,
      memo: memo ?? this.memo,
    );
  }
}

/// Individual result for one payment in the batch
class BatchPaymentResultItem {
  final int index;
  final String status; // 'success' | 'failed'
  final int? transactionId;
  final String? error;
  // Denormalised for display – set from the corresponding BatchPaymentEntry
  String recipientTag;
  double amount;
  String asset;

  BatchPaymentResultItem({
    required this.index,
    required this.status,
    this.transactionId,
    this.error,
    this.recipientTag = '',
    this.amount = 0.0,
    this.asset = '',
  });

  bool get isSuccess => status == 'success';

  factory BatchPaymentResultItem.fromJson(Map<String, dynamic> json) {
    return BatchPaymentResultItem(
      index: json['index'] ?? 0,
      status: json['status'] ?? 'failed',
      transactionId: json['transactionId'],
      error: json['error'],
    );
  }
}

/// Full response returned by POST /api/transactions/batch
class BatchPaymentResponse {
  final int batchId;
  final String status;
  final int totalPayments;
  final int successfulPayments;
  final int failedPayments;
  final String totalAmount;
  final String totalFees;
  final List<BatchPaymentResultItem> results;
  final DateTime createdAt;
  final DateTime? completedAt;

  BatchPaymentResponse({
    required this.batchId,
    required this.status,
    required this.totalPayments,
    required this.successfulPayments,
    required this.failedPayments,
    required this.totalAmount,
    required this.totalFees,
    required this.results,
    required this.createdAt,
    this.completedAt,
  });

  factory BatchPaymentResponse.fromJson(Map<String, dynamic> json) {
    final rawResults = json['results'];
    final results = rawResults is List
        ? rawResults
            .map((r) => BatchPaymentResultItem.fromJson(r as Map<String, dynamic>))
            .toList()
        : <BatchPaymentResultItem>[];

    return BatchPaymentResponse(
      batchId: json['batchId'] ?? 0,
      status: json['status'] ?? '',
      totalPayments: json['totalPayments'] ?? 0,
      successfulPayments: json['successfulPayments'] ?? 0,
      failedPayments: json['failedPayments'] ?? 0,
      totalAmount: (json['totalAmount'] ?? '0').toString(),
      totalFees: (json['totalFees'] ?? '0').toString(),
      results: results,
      createdAt: _parseDateTime(json['createdAt']),
      completedAt: json['completedAt'] != null
          ? _parseDateTime(json['completedAt'])
          : null,
    );
  }

  static DateTime _parseDateTime(dynamic value) {
    if (value == null) return DateTime.now();
    if (value is String) {
      try {
        return DateTime.parse(value);
      } catch (_) {
        return DateTime.now();
      }
    }
    return DateTime.now();
  }
}
