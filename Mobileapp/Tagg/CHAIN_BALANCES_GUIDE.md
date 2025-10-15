# Chain-Specific Balances Guide

## Problem Statement
The app needs to display balances for multiple blockchain networks:
- **Starknet** (STRK tokens)
- **Lisk** (LSK tokens)
- **Base** (ETH, USDC on Base)
- **Stellar** (XLM tokens)

## Current API Structure

Based on the web version, the `/balances` endpoint returns `UserTokenBalance[]` which includes:
- Token information (name, symbol, logo)
- Token amount and USD value
- But **NO explicit chain information**

## Solution Options

### Option 1: Add Chain Info to UserTokenBalance Model (Recommended)

If the API actually returns chain information in the balance response, update the model:

```dart
class UserTokenBalance {
  final int id;
  final int userId;
  final int tokenId;
  final double amount;
  final double usdValue;
  final String? address;
  
  // Add these fields if API provides them
  final int? chainId;           // Chain ID
  final String? chainName;      // e.g., "Starknet", "Lisk", "Base", "Stellar"
  final String? chainSymbol;    // e.g., "STRK", "LSK", "ETH", "XLM"
  
  final String tokenName;
  final String tokenSymbol;
  final String tokenLogoUrl;
  final double tokenPrice;
  
  // ... rest of the model
}
```

Then in the ViewModel:

```dart
// Group balances by chain
Map<String, List<UserTokenBalance>> get balancesByChain {
  final Map<String, List<UserTokenBalance>> grouped = {};
  
  for (var balance in _tokenBalances) {
    final chain = balance.chainName ?? 'Unknown';
    if (!grouped.containsKey(chain)) {
      grouped[chain] = [];
    }
    grouped[chain]!.add(balance);
  }
  
  return grouped;
}

// Get balance for specific chain
List<UserTokenBalance> getChainBalances(String chainName) {
  return _tokenBalances
      .where((b) => b.chainName?.toLowerCase() == chainName.toLowerCase())
      .toList();
}

// Get total USD value for a chain
double getChainTotalUsd(String chainName) {
  return getChainBalances(chainName)
      .fold(0.0, (sum, b) => sum + b.usdValue);
}
```

### Option 2: Use Token Symbol to Infer Chain

If the API doesn't provide chain info, infer it from token symbols:

```dart
class DashboardViewModel extends BaseViewModel {
  // Map token symbols to chains
  static const Map<String, String> _tokenToChain = {
    'STRK': 'Starknet',
    'LSK': 'Lisk',
    'XLM': 'Stellar',
    // Base uses ETH and standard tokens
  };
  
  String _inferChain(UserTokenBalance token) {
    // Check if token symbol maps to a specific chain
    if (_tokenToChain.containsKey(token.tokenSymbol)) {
      return _tokenToChain[token.tokenSymbol]!;
    }
    
    // Check if address indicates a chain (e.g., Base addresses)
    if (token.address?.startsWith('0x') == true) {
      // Could be Base (EVM-compatible)
      return 'Base';
    }
    
    return 'Unknown';
  }
  
  Map<String, List<UserTokenBalance>> get balancesByChain {
    final Map<String, List<UserTokenBalance>> grouped = {};
    
    for (var balance in _tokenBalances) {
      final chain = _inferChain(balance);
      if (!grouped.containsKey(chain)) {
        grouped[chain] = [];
      }
      grouped[chain]!.add(balance);
    }
    
    return grouped;
  }
}
```

### Option 3: Fetch Chain Data Separately

Use the `/chains` endpoint to get chain information and correlate with tokens:

```dart
// In ChainService
Future<List<Chain>> getAllChains() async {
  final response = await _apiService.get(ApiConstants.chains);
  return (response as List).map((json) => Chain.fromJson(json)).toList();
}

// In DashboardViewModel
List<Chain> _chains = [];

Future<void> _loadDashboardData() async {
  setBusy(true);
  
  try {
    // Load chains first
    _chains = await _chainService.getAllChains();
    
    // Load dashboard summary
    _dashboardSummary = await _userService.getDashboardSummary();
    
    // Load wallet data
    _walletData = await _walletService.getWalletBalance();
    
    // Load token balances
    _tokenBalances = await _userService.getUserTokenBalances();
    
    // Correlate tokens with chains
    _correlateTokensWithChains();
    
    _calculateBalances();
    notifyListeners();
  } catch (e) {
    _showError('Failed to load dashboard data: $e');
  } finally {
    setBusy(false);
  }
}

void _correlateTokensWithChains() {
  // Match tokens to chains based on token_id and chain data
  // This depends on your API structure
}
```

## Displaying Chain Balances in UI

### Example 1: Grouped by Chain

```dart
// In DashboardView
Widget _buildChainBalances(DashboardViewModel model) {
  final chainBalances = model.balancesByChain;
  
  return Column(
    children: [
      Text('Balances by Chain', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
      SizedBox(height: 16),
      
      // Starknet
      _buildChainSection('Starknet', chainBalances['Starknet'] ?? [], model),
      
      // Lisk
      _buildChainSection('Lisk', chainBalances['Lisk'] ?? [], model),
      
      // Base
      _buildChainSection('Base', chainBalances['Base'] ?? [], model),
      
      // Stellar
      _buildChainSection('Stellar', chainBalances['Stellar'] ?? [], model),
    ],
  );
}

Widget _buildChainSection(String chainName, List<UserTokenBalance> balances, DashboardViewModel model) {
  if (balances.isEmpty) return SizedBox.shrink();
  
  final totalUsd = balances.fold(0.0, (sum, b) => sum + b.usdValue);
  
  return Card(
    margin: EdgeInsets.symmetric(vertical: 8),
    child: ExpansionTile(
      title: Text(chainName),
      subtitle: Text(model.formatCurrency(totalUsd)),
      children: balances.map((balance) => 
        ListTile(
          leading: Image.network(balance.tokenLogoUrl, width: 32, height: 32),
          title: Text(balance.tokenName),
          subtitle: Text(model.formatCrypto(balance.amount, balance.tokenSymbol)),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(model.formatCurrency(balance.usdValue)),
              Text(model.formatCurrencyToNGN(balance.ngnValue), 
                   style: TextStyle(fontSize: 12, color: Colors.grey)),
            ],
          ),
        )
      ).toList(),
    ),
  );
}
```

### Example 2: Chain Summary Cards

```dart
Widget _buildChainSummaryCards(DashboardViewModel model) {
  return GridView.count(
    crossAxisCount: 2,
    shrinkWrap: true,
    physics: NeverScrollableScrollPhysics(),
    children: [
      _buildChainCard('Starknet', model.getChainTotalUsd('Starknet'), Icons.currency_bitcoin),
      _buildChainCard('Lisk', model.getChainTotalUsd('Lisk'), Icons.account_balance_wallet),
      _buildChainCard('Base', model.getChainTotalUsd('Base'), Icons.layers),
      _buildChainCard('Stellar', model.getChainTotalUsd('Stellar'), Icons.star),
    ],
  );
}

Widget _buildChainCard(String chainName, double totalUsd, IconData icon) {
  return Card(
    child: Padding(
      padding: EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 32),
          SizedBox(height: 8),
          Text(chainName, style: TextStyle(fontWeight: FontWeight.bold)),
          SizedBox(height: 4),
          Text('\$${totalUsd.toStringAsFixed(2)}'),
        ],
      ),
    ),
  );
}
```

## Recommended Approach

1. **First, check the actual API response** from `/balances` to see if it includes chain information
2. **If yes:** Use Option 1 (add chain fields to UserTokenBalance)
3. **If no:** Use Option 2 (infer from token symbols) as a quick solution
4. **Long-term:** Request backend to add chain information to the balance response

## Testing Chain Balances

```dart
// Test data
void main() {
  test('Group balances by chain', () {
    final balances = [
      UserTokenBalance(tokenSymbol: 'STRK', usdValue: 100, ...),
      UserTokenBalance(tokenSymbol: 'LSK', usdValue: 50, ...),
      UserTokenBalance(tokenSymbol: 'STRK', usdValue: 25, ...),
    ];
    
    final viewModel = DashboardViewModel();
    viewModel._tokenBalances = balances;
    
    final grouped = viewModel.balancesByChain;
    
    expect(grouped['Starknet']?.length, 2);
    expect(grouped['Lisk']?.length, 1);
    expect(viewModel.getChainTotalUsd('Starknet'), 125);
  });
}
```

## Important Notes

- The current implementation focuses on getting the basic balance structure right first
- Chain-specific logic can be added once we confirm the API structure
- The web version likely handles this - check their implementation for reference
- Consider caching chain data to avoid repeated API calls
