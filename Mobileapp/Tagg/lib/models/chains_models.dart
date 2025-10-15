import 'dart:convert';

/// Native currency model for chain
class NativeCurrency {
  final String name;
  final String symbol;

  NativeCurrency({
    required this.name,
    required this.symbol,
  });

  factory NativeCurrency.fromJson(Map<String, dynamic> json) {
    return NativeCurrency(
      name: json['name'] ?? '',
      symbol: json['symbol'] ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'symbol': symbol,
      };
}

/// Chain model - represents a blockchain network
class Chain {
  final int id;
  final String name;
  final String symbol;
  final String rpcUrl;
  final String blockExplorer;
  final NativeCurrency nativeCurrency;
  final DateTime createdAt;
  final DateTime updatedAt;

  Chain({
    required this.id,
    required this.name,
    required this.symbol,
    required this.rpcUrl,
    required this.blockExplorer,
    required this.nativeCurrency,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Chain.fromJson(Map<String, dynamic> json) {
    // Parse native_currency from JSON string
    NativeCurrency nativeCurrency;
    try {
      final nativeCurrencyStr = json['native_currency'] as String?;
      if (nativeCurrencyStr != null && nativeCurrencyStr.isNotEmpty) {
        final nativeCurrencyJson = jsonDecode(nativeCurrencyStr);
        nativeCurrency = NativeCurrency.fromJson(nativeCurrencyJson);
      } else {
        // Fallback to chain symbol if native_currency is not provided
        nativeCurrency = NativeCurrency(
          name: json['name'] ?? '',
          symbol: json['symbol'] ?? '',
        );
      }
    } catch (e) {
      print('Error parsing native_currency: $e');
      // Fallback to chain symbol
      nativeCurrency = NativeCurrency(
        name: json['name'] ?? '',
        symbol: json['symbol'] ?? '',
      );
    }

    return Chain(
      id: json['id'] ?? 0,
      name: json['name'] ?? '',
      symbol: json['symbol'] ?? '',
      rpcUrl: json['rpc_url'] ?? '',
      blockExplorer: json['block_explorer'] ?? '',
      nativeCurrency: nativeCurrency,
      createdAt: _parseDateTime(json['created_at']),
      updatedAt: _parseDateTime(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'symbol': symbol,
        'rpc_url': rpcUrl,
        'block_explorer': blockExplorer,
        'native_currency': jsonEncode(nativeCurrency.toJson()),
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt.toIso8601String(),
      };

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

  @override
  String toString() {
    return 'Chain(id: $id, name: $name, symbol: $symbol, nativeCurrency: ${nativeCurrency.symbol})';
  }
}
