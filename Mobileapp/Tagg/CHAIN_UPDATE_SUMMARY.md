# Chain API Update Summary

## Overview
Updated the Tagg Flutter app to dynamically fetch and use blockchain chains from the API endpoint `/chains` instead of using hardcoded chain data.

## API Response Structure
The new chain endpoint returns:
```json
[
  {
    "id": 1,
    "name": "Starknet",
    "symbol": "STRK",
    "rpc_url": "https://starknet-mainnet.g.alchemy.com/public",
    "block_explorer": "https://starkscan.co",
    "native_currency": "{\"name\":\"Starknet Token\",\"symbol\":\"STRK\"}",
    "created_at": "2025-10-13T20:02:10.000Z",
    "updated_at": "2025-10-13T20:02:10.000Z"
  },
  ...
]
```

## Changes Made

### 1. Created Chain Models (`/lib/models/chains_models.dart`)
- **NativeCurrency**: Model for chain's native currency with name and symbol
- **Chain**: Complete chain model with:
  - id, name, symbol
  - rpcUrl, blockExplorer
  - nativeCurrency (parsed from JSON string)
  - createdAt, updatedAt timestamps

### 2. Implemented ChainsService (`/lib/services/chains_service.dart`)
- Fetches chains from `/chains` endpoint
- Implements caching (1 hour expiration) to reduce API calls
- Provides helper methods:
  - `getChains()` - Get all chains
  - `getChainById(id)` - Get specific chain
  - `getChainByName(name)` - Find chain by name
  - `getChainBySymbol(symbol)` - Find chain by symbol
  - `getChainNames()` - Get list of chain names
  - `getChainSymbols()` - Get list of chain symbols
  - `clearCache()` - Clear cached chains

### 3. Updated ViewModels

#### BalanceViewModel (`/lib/ui/views/balance/balance_viewmodel.dart`)
- Added `_chainsService` dependency
- Added `_chains` list and getter
- Updated `availableChains` to dynamically return chain names from API
- Modified `getFilteredAssets()` to filter by chain symbol and native currency
- Loads chains during initialization

#### DashboardViewModel (`/lib/ui/views/dashboard/dashboard_viewmodel.dart`)
- Added `_chainsService` dependency
- Added `_chains` list and getter
- Loads chains first in `_loadDashboardData()`
- Chains available for dashboard view to display

#### WithdrawalViewModel (`/lib/ui/views/withdrawal/withdrawal_viewmodel.dart`)
- Added `_chainsService` dependency
- Added `_chains` list and getter
- Converted hardcoded `tokens` list to dynamic getter based on chains
- Maps chain symbols to colors for UI
- Added `loadChains()` method called during initialization

#### DepositViewModel (`/lib/ui/views/deposit/deposit_viewmodel.dart`)
- Added `_chainsService` dependency
- Added `_chains` list and getter
- Converted `availableTokens` to dynamic getter from chains
- Added `_loadChains()` method called during initialization

### 4. Updated Views

#### DashboardView (`/lib/ui/views/dashboard/dashboard_view.dart`)
- Modified `_buildAssetBalanceSection()` to use `viewModel.chains`
- Dynamically generates asset cards from API chains
- Maps chain symbols to asset icons
- Uses chain's native currency symbol for balance display

#### WithdrawalView (`/lib/ui/views/withdrawal/withdrawal_view.dart`)
- Updated `_buildSelectAsset()` to dynamically generate asset buttons from chains
- Removed hardcoded Ethereum, Lisk, Base, Starknet buttons
- Now displays all chains from API in a 2-column grid
- Maps chain symbols to asset icons (STRK, LSK, BASE, FLOW)
- Uses chain's native currency symbol for token matching

#### DepositView (`/lib/ui/views/deposit/deposit_view.dart`)
- Updated token selector bottom sheet to use `viewModel.chains`
- Displays chain name as title and native currency symbol as subtitle
- Removed hardcoded token list (ETH, STRK, LSK)
- Now shows all available chains from API
- Added `selectedChainName` getter in viewmodel to display chain name instead of symbol

### 5. Service Registration
- ChainsService already registered in `/lib/app/app.dart` as LazySingleton
- Build runner executed to regenerate locator files

## Benefits

1. **Dynamic Chain Support**: App automatically supports new chains added to the backend without code changes
2. **Accurate Chain Data**: Chain information (RPC URLs, block explorers, native currencies) comes from single source of truth
3. **Reduced Maintenance**: No need to update hardcoded chain lists in multiple places
4. **Performance**: Caching reduces API calls while keeping data fresh
5. **Consistency**: All views use the same chain data from API

## Testing Checklist

- [ ] Dashboard displays all chains from API
- [ ] Balance view shows correct chains in filter dropdown
- [ ] Withdrawal page displays correct token options
- [ ] Deposit page shows correct token options
- [ ] Chain filtering works correctly in balance view
- [ ] Asset cards display correct chain names and symbols
- [ ] App handles API errors gracefully (uses cached data)
- [ ] New chains added to backend appear in app after cache expiration

## API Endpoints Used

- `GET /chains` - Fetch all available chains
- `GET /chains/:id` - Fetch specific chain by ID

## Files Modified

1. `/lib/models/chains_models.dart` - Created
2. `/lib/services/chains_service.dart` - Updated
3. `/lib/ui/views/balance/balance_viewmodel.dart` - Updated
4. `/lib/ui/views/dashboard/dashboard_viewmodel.dart` - Updated
5. `/lib/ui/views/withdrawal/withdrawal_viewmodel.dart` - Updated
6. `/lib/ui/views/deposit/deposit_viewmodel.dart` - Updated
7. `/lib/ui/views/dashboard/dashboard_view.dart` - Updated
8. `/lib/ui/views/withdrawal/withdrawal_view.dart` - Updated (Select Asset section)
9. `/lib/ui/views/deposit/deposit_view.dart` - Updated (Token selector bottom sheet)
10. `/lib/ui/common/app_assets.dart` - Updated (Added BASE and FLOW to token maps)

## Notes

- The app uses chain's `nativeCurrency.symbol` for token matching
- Asset icons are mapped by chain symbol (STRK, LSK, BASE, FLOW)
- Cache expires after 1 hour but can be manually cleared
- Stale cache is used as fallback if API request fails
