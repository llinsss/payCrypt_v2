/// User token balance model - represents individual token holdings
class UserTokenBalance {
  final int id;
  final int userId;
  final int tokenId;
  final double amount; // Token amount
  final double usdValue; // USD equivalent value
  final double ngnValue; // NGN equivalent value from API
  final String? address;
  final String? autoConvertThreshold;
  final DateTime createdAt;
  final DateTime updatedAt;

  // User info
  final String userEmail;
  final String userTag;

  // Token info
  final String tokenName;
  final String tokenSymbol;
  final String tokenLogoUrl;
  final double tokenPrice;

  UserTokenBalance({
    required this.id,
    required this.userId,
    required this.tokenId,
    required this.amount,
    required this.usdValue,
    required this.ngnValue,
    this.address,
    this.autoConvertThreshold,
    required this.createdAt,
    required this.updatedAt,
    required this.userEmail,
    required this.userTag,
    required this.tokenName,
    required this.tokenSymbol,
    required this.tokenLogoUrl,
    required this.tokenPrice,
  });

  factory UserTokenBalance.fromJson(Map<String, dynamic> json) {
    return UserTokenBalance(
      id: json['id'] ?? 0,
      userId: json['user_id'] ?? 0,
      tokenId: json['token_id'] ?? 0,
      amount: _parseDouble(json['amount']) ?? 0.0,
      usdValue: _parseDouble(json['usd_value']) ?? 0.0,
      ngnValue: _parseDouble(json['ngn_value']) ?? 0.0,
      address: json['address'],
      autoConvertThreshold: json['auto_convert_threshold'],
      createdAt: _parseDateTime(json['created_at']),
      updatedAt: _parseDateTime(json['updated_at']),
      userEmail: json['user_email'] ?? '',
      userTag: json['user_tag'] ?? '',
      tokenName: json['token_name'] ?? '',
      tokenSymbol: json['token_symbol'] ?? '',
      tokenLogoUrl: json['token_logo_url'] ?? '',
      tokenPrice: _parseDouble(json['token_price']) ?? 0.0,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'user_id': userId,
        'token_id': tokenId,
        'amount': amount,
        'usd_value': usdValue,
        'ngn_value': ngnValue,
        'address': address,
        'auto_convert_threshold': autoConvertThreshold,
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt.toIso8601String(),
        'user_email': userEmail,
        'user_tag': userTag,
        'token_name': tokenName,
        'token_symbol': tokenSymbol,
        'token_logo_url': tokenLogoUrl,
        'token_price': tokenPrice,
      };

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
