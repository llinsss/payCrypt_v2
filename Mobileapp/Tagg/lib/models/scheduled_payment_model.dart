class ScheduledPayment {
  final int id;
  final int userId;
  final String senderTag;
  final String recipientTag;
  final String amount;
  final String asset;
  final String? assetIssuer;
  final String? memo;
  final String scheduledAt;
  final String? nextRunAt;
  final String status; // pending, completed, failed, paused, cancelled
  final String frequency; // once, daily, weekly, monthly
  final int? maxExecutions;
  final int executionCount;
  final String createdAt;
  final String updatedAt;

  ScheduledPayment({
    required this.id,
    required this.userId,
    required this.senderTag,
    required this.recipientTag,
    required this.amount,
    required this.asset,
    this.assetIssuer,
    this.memo,
    required this.scheduledAt,
    this.nextRunAt,
    required this.status,
    this.frequency = 'once',
    this.maxExecutions,
    this.executionCount = 0,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ScheduledPayment.fromJson(Map<String, dynamic> json) {
    return ScheduledPayment(
      id: json['id'],
      userId: json['user_id'],
      senderTag: json['sender_tag'] ?? '',
      recipientTag: json['recipient_tag'] ?? '',
      amount: json['amount'] ?? '0',
      asset: json['asset'] ?? 'XLM',
      assetIssuer: json['asset_issuer'],
      memo: json['memo'],
      scheduledAt: json['scheduled_at'] ?? '',
      nextRunAt: json['next_run_at'],
      status: json['status'] ?? 'pending',
      frequency: json['frequency'] ?? 'once',
      maxExecutions: json['max_executions'],
      executionCount: json['execution_count'] ?? 0,
      createdAt: json['created_at'] ?? '',
      updatedAt: json['updated_at'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'sender_tag': senderTag,
      'recipient_tag': recipientTag,
      'amount': amount,
      'asset': asset,
      'asset_issuer': assetIssuer,
      'memo': memo,
      'scheduled_at': scheduledAt,
      'next_run_at': nextRunAt,
      'status': status,
      'frequency': frequency,
      'max_executions': maxExecutions,
      'execution_count': executionCount,
      'created_at': createdAt,
      'updated_at': updatedAt,
    };
  }

  String get formattedAmount => '$amount $asset';

  String get formattedFrequency {
    switch (frequency) {
      case 'once':
        return 'One-time';
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'monthly':
        return 'Monthly';
      default:
        return frequency;
    }
  }

  String get formattedScheduledAt {
    try {
      final date = DateTime.parse(scheduledAt);
      return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
    } catch (e) {
      return scheduledAt;
    }
  }

  String get formattedNextRun {
    if (nextRunAt == null) return '—';
    try {
      final date = DateTime.parse(nextRunAt!);
      return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
    } catch (e) {
      return nextRunAt!;
    }
  }

  bool get isRecurring => frequency != 'once';
  bool get isActive => status == 'pending' || status == 'paused';
  bool get isCancellable => status == 'pending';
}
