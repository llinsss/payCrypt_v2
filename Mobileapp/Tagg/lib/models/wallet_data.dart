/// Wallet data model - represents user's wallet with available and locked balances
class WalletData {
  final int id;
  final int userId;
  final double availableBalance; // Available balance (can be withdrawn)
  final double lockedBalance; // Locked balance (pending transactions, etc.)
  final DateTime createdAt;
  final DateTime updatedAt;

  WalletData({
    required this.id,
    required this.userId,
    required this.availableBalance,
    required this.lockedBalance,
    required this.createdAt,
    required this.updatedAt,
  });

  factory WalletData.fromJson(Map<String, dynamic> json) {
    return WalletData(
      id: json['id'] ?? 0,
      userId: json['user_id'] ?? 0,
      availableBalance: _parseDouble(json['available_balance']) ?? 0.0,
      lockedBalance: _parseDouble(json['locked_balance']) ?? 0.0,
      createdAt: _parseDateTime(json['created_at']),
      updatedAt: _parseDateTime(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'user_id': userId,
        'available_balance': availableBalance,
        'locked_balance': lockedBalance,
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt.toIso8601String(),
      };

  /// Get total balance (available + locked)
  double get totalBalance => availableBalance + lockedBalance;

  /// Get NGN value of available balance
  double get availableBalanceNgn => availableBalance * 1550;

  /// Get NGN value of locked balance
  double get lockedBalanceNgn => lockedBalance * 1550;

  /// Get total NGN balance
  double get totalBalanceNgn => totalBalance * 1550;

  static double _parseDouble(dynamic value) {
    if (value == null) return 0.0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0.0;
    return 0.0;
  }

  static DateTime _parseDateTime(dynamic value) {
    if (value == null) return DateTime.now();
    if (value is String) {
      try {
        return DateTime.parse(value);
      } catch (e) {
        return DateTime.now();
      }
    }
    return DateTime.now();
  }
}
