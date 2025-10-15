# Balance Structure - Tagg Flutter App

## Overview
This document explains how balances are structured and fetched in the Tagg app, matching the web version implementation.

## API Endpoints

### 1. Dashboard Summary
**Endpoint:** `GET /users/dashboard-summary`

**Returns:**
```json
{
  "total_balance": 100.50,      // Total balance in USD
  "total_deposit": 500.00,      // Total deposits
  "total_withdrawal": 50.00,    // Total withdrawals
  "portfolio_growth": 5.5       // Portfolio growth percentage
}
```

**Model:** `DashboardSummary`

### 2. User Token Balances
**Endpoint:** `GET /balances`

**Returns:** Array of user token balances
```json
[
  {
    "id": 1,
    "user_id": 123,
    "token_id": 5,
    "amount": "100.5",           // Token amount
    "usd_value": "100.50",       // USD equivalent
    "address": "0x...",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z",
    "user_email": "user@example.com",
    "user_tag": "@user",
    "token_name": "USD Coin",
    "token_symbol": "USDC",
    "token_logo_url": "https://...",
    "token_price": "1.00"
  }
]
```

**Model:** `UserTokenBalance`

### 3. Wallet Balance
**Endpoint:** `GET /wallets/balance`

**Returns:**
```json
{
  "id": 1,
  "user_id": 123,
  "available_balance": 95.50,   // Available for withdrawal
  "locked_balance": 5.00,       // Locked in pending transactions
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Model:** `WalletData`

### 4. USD Equivalent
**Endpoint:** `POST /usd-equivalent`

**Request:**
```json
{
  "token": "STRK",
  "amount": 100
}
```

**Returns:** USD value as string or number

## Models

### DashboardSummary
```dart
class DashboardSummary {
  final double totalBalance;      // Total balance in USD
  final double totalDeposit;      // Total deposits
  final double totalWithdrawal;   // Total withdrawals
  final double portfolioGrowth;   // Portfolio growth %
}
```

### UserTokenBalance
```dart
class UserTokenBalance {
  final int id;
  final int userId;
  final int tokenId;
  final double amount;            // Token amount
  final double usdValue;          // USD equivalent
  final String tokenName;         // e.g., "USD Coin"
  final String tokenSymbol;       // e.g., "USDC"
  final String tokenLogoUrl;
  final double tokenPrice;        // Price per token
  
  // Computed property
  double get ngnValue => usdValue * 1550;  // NGN conversion
}
```

### WalletData
```dart
class WalletData {
  final int id;
  final int userId;
  final double availableBalance;  // Available for withdrawal
  final double lockedBalance;     // Locked in transactions
  
  // Computed properties
  double get totalBalance => availableBalance + lockedBalance;
  double get availableBalanceNgn => availableBalance * 1550;
  double get totalBalanceNgn => totalBalance * 1550;
}
```

## Dashboard ViewModel

### Balance Properties

```dart
// Main balances
double totalBalance;        // From DashboardSummary.totalBalance (USD)
double nairaBalance;        // totalBalance * 1550 (NGN)
double availableBalance;    // From WalletData.availableBalance
double lockedBalance;       // From WalletData.lockedBalance
double assetBalance;        // Sum of all token USD values

// Transaction totals
double totalDeposits;       // From DashboardSummary.totalDeposit
double totalWithdrawals;    // From DashboardSummary.totalWithdrawal
double portfolioGrowth;     // From DashboardSummary.portfolioGrowth
```

### Data Loading Flow

```dart
void initialize() {
  1. Fetch DashboardSummary from /users/dashboard-summary
  2. Fetch WalletData from /wallets/balance
  3. Fetch UserTokenBalance[] from /balances
  4. Calculate computed balances
}
```

### Helper Methods

```dart
// Get specific token balance
UserTokenBalance? getTokenBalance(String symbol);

// Get token amount by symbol
double getTokenAmount(String symbol);

// Get token USD value by symbol
double getTokenUsdValue(String symbol);

// Get token NGN value by symbol
double getTokenNgnValue(String symbol);

// Format currency
String formatCurrency(double amount, {String currency = 'USD'});
String formatCurrencyToNGN(double amount);
String formatCrypto(double amount, String symbol);
```

## Balance Types Explained

### 1. Total Balance (USD)
- **Source:** `DashboardSummary.totalBalance`
- **What it is:** Total value of all user assets in USD
- **Display:** `$100.50`

### 2. Naira Balance (NGN)
- **Source:** Computed from `totalBalance * 1550`
- **What it is:** Total balance converted to Nigerian Naira
- **Display:** `₦155,775.00`

### 3. Available Balance
- **Source:** `WalletData.availableBalance`
- **What it is:** Balance available for immediate withdrawal
- **Display:** `$95.50`

### 4. Locked Balance
- **Source:** `WalletData.lockedBalance`
- **What it is:** Balance locked in pending transactions
- **Display:** `$5.00`

### 5. Asset Balance
- **Source:** Sum of all `UserTokenBalance.usdValue`
- **What it is:** Total value of all crypto token holdings
- **Display:** `$100.50`

## Chain-Specific Balances

For chain-specific balances (Starknet, Lisk, Base, Stellar), you need to:

1. Filter `UserTokenBalance[]` by chain information (if available in token data)
2. Or use the `/wallets` endpoint to get chain-specific wallet addresses
3. Group tokens by their chain

**Note:** The current API structure doesn't explicitly separate balances by chain in the `/balances` endpoint. You may need to:
- Add chain information to the `UserTokenBalance` model if the API provides it
- Or fetch chain-specific data from the `/chains` endpoint and correlate with tokens

## Currency Conversion

### USD to NGN
```dart
double ngnValue = usdValue * 1550;  // Using approximate rate
```

### Getting Real-Time Conversion
Use the `/usd-equivalent` endpoint:
```dart
final usdValue = await userService.getUsdEquivalent(
  token: 'STRK',
  amount: 100.0
);
```

## Migration Notes

### Old Approach (Incorrect)
- Used `/balances` endpoint expecting chain-specific data
- Created complex `WalletBalance` and `BalanceSummary` models
- Tried to aggregate balances by chain without proper API support

### New Approach (Correct)
- Use `/users/dashboard-summary` for overall totals
- Use `/balances` for individual token holdings
- Use `/wallets/balance` for available/locked balance split
- Simple, matches web version exactly

## Example Usage in Dashboard

```dart
class DashboardView extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<DashboardViewModel>.reactive(
      viewModelBuilder: () => DashboardViewModel(),
      onViewModelReady: (model) => model.initialize(),
      builder: (context, model, child) {
        return Column(
          children: [
            // Total Balance
            Text('Total Balance: ${model.formatCurrency(model.totalBalance)}'),
            
            // Naira Balance
            Text('Naira Balance: ${model.formatCurrencyToNGN(model.nairaBalance)}'),
            
            // Available Balance
            Text('Available: ${model.formatCurrency(model.availableBalance)}'),
            
            // Token Balances
            ...model.tokenBalances.map((token) => 
              ListTile(
                title: Text(token.tokenName),
                subtitle: Text(model.formatCrypto(token.amount, token.tokenSymbol)),
                trailing: Text(model.formatCurrency(token.usdValue)),
              )
            ),
          ],
        );
      },
    );
  }
}
```

## Testing

After making these changes, you should:

1. **Regenerate mocks:** `flutter pub run build_runner build --delete-conflicting-outputs`
2. **Test API responses:** Verify the actual API returns data in the expected format
3. **Update UI:** Ensure dashboard view displays all balance types correctly
4. **Test conversions:** Verify USD to NGN conversion is accurate

## Files Modified

- ✅ `/lib/models/dashboard_summary.dart` (new)
- ✅ `/lib/models/user_token_balance.dart` (new)
- ✅ `/lib/models/wallet_data.dart` (new)
- ✅ `/lib/services/user_service.dart` (updated)
- ✅ `/lib/services/wallet_service.dart` (updated)
- ✅ `/lib/ui/views/dashboard/dashboard_viewmodel.dart` (rewritten)
- ✅ `/lib/ui/common/api_constants.dart` (added usdEquivalent endpoint)

## Next Steps

1. ✅ Models created
2. ✅ Services updated
3. ✅ ViewModel rewritten
4. 🔄 Regenerate test mocks (in progress)
5. ⏳ Test with real API data
6. ⏳ Update dashboard UI if needed
