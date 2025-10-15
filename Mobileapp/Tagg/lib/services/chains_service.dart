import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/chains_models.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/ui/common/api_constants.dart';

class ChainsService {
  final ApiService _apiService = locator<ApiService>();

  // Cache for chains to avoid repeated API calls
  List<Chain>? _cachedChains;
  DateTime? _lastFetchTime;
  static const Duration _cacheExpiration = Duration(hours: 1);

  /// Get all available chains from the API
  Future<List<Chain>> getChains({bool forceRefresh = false}) async {
    // Return cached chains if available and not expired
    if (!forceRefresh &&
        _cachedChains != null &&
        _lastFetchTime != null &&
        DateTime.now().difference(_lastFetchTime!) < _cacheExpiration) {
      print('✅ Returning cached chains: ${_cachedChains!.length} chains');
      return _cachedChains!;
    }

    try {
      print('📡 Fetching chains from API...');
      final response = await _apiService.get(ApiConstants.chains);

      if (response is List) {
        _cachedChains = response.map((json) => Chain.fromJson(json)).toList();
        _lastFetchTime = DateTime.now();
        print(
            '✅ Chains loaded successfully: ${_cachedChains!.length} chains');
        return _cachedChains!;
      } else {
        print('⚠️ Unexpected response format for chains');
        return [];
      }
    } catch (e) {
      print('❌ Error fetching chains: $e');
      // Return cached chains if available, even if expired
      if (_cachedChains != null) {
        print('⚠️ Returning stale cached chains due to error');
        return _cachedChains!;
      }
      return [];
    }
  }

  /// Get a specific chain by ID
  Future<Chain?> getChainById(int id) async {
    try {
      final response = await _apiService.get(ApiConstants.chainById(id));
      return Chain.fromJson(response);
    } catch (e) {
      print('❌ Error fetching chain $id: $e');
      return null;
    }
  }

  /// Get chain by name
  Future<Chain?> getChainByName(String name) async {
    final chains = await getChains();
    try {
      return chains.firstWhere(
        (chain) => chain.name.toLowerCase() == name.toLowerCase(),
      );
    } catch (e) {
      return null;
    }
  }

  /// Get chain by symbol
  Future<Chain?> getChainBySymbol(String symbol) async {
    final chains = await getChains();
    try {
      return chains.firstWhere(
        (chain) => chain.symbol.toLowerCase() == symbol.toLowerCase(),
      );
    } catch (e) {
      return null;
    }
  }

  /// Clear cached chains
  void clearCache() {
    _cachedChains = null;
    _lastFetchTime = null;
    print('🗑️ Chains cache cleared');
  }

  /// Get chain names for UI display
  Future<List<String>> getChainNames() async {
    final chains = await getChains();
    return chains.map((chain) => chain.name).toList();
  }

  /// Get chain symbols for filtering
  Future<List<String>> getChainSymbols() async {
    final chains = await getChains();
    return chains.map((chain) => chain.symbol).toList();
  }
}
