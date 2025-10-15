/// Dashboard summary data from /users/dashboard-summary endpoint
class DashboardSummary {
  final double totalBalance; // Total balance in USD
  final double totalDeposit;
  final double totalWithdrawal;
  final double portfolioGrowth;

  DashboardSummary({
    required this.totalBalance,
    required this.totalDeposit,
    required this.totalWithdrawal,
    required this.portfolioGrowth,
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> json) {
    return DashboardSummary(
      totalBalance: _parseDouble(json['total_balance']) ?? 0.0,
      totalDeposit: _parseDouble(json['total_deposit']) ?? 0.0,
      totalWithdrawal: _parseDouble(json['total_withdrawal']) ?? 0.0,
      portfolioGrowth: _parseDouble(json['portfolio_growth']) ?? 0.0,
    );
  }

  Map<String, dynamic> toJson() => {
        'total_balance': totalBalance,
        'total_deposit': totalDeposit,
        'total_withdrawal': totalWithdrawal,
        'portfolio_growth': portfolioGrowth,
      };

  static double _parseDouble(dynamic value) {
    if (value == null) return 0.0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0.0;
    return 0.0;
  }
}
