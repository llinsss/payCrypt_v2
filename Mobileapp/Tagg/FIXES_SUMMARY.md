# Bug Fixes Summary - Dashboard & Balance Views

## Issues Fixed

### 1. ✅ Total Balance and Total Deposit Swapped
**Problem:** 
- Dashboard was showing `total_balance` value where it should show `total_deposit`
- Balance view "Portfolio Overview" was showing wrong value

**Root Cause:**
- Dashboard viewmodel was using `_dashboardSummary.totalBalance` instead of `_dashboardSummary.totalDeposit`
- Balance viewmodel had the same issue

**Solution:**
- Updated `dashboard_viewmodel.dart` line 99: Changed from `totalBalance` to `totalDeposit`
- Updated `balance_viewmodel.dart` line 164: Changed from `totalBalance` to `totalDeposit`

**Files Modified:**
- `/lib/ui/views/dashboard/dashboard_viewmodel.dart`
- `/lib/ui/views/balance/balance_viewmodel.dart`

---

### 2. ✅ NGN Value Calculation Fixed
**Problem:**
- NGN balance was being calculated client-side using fixed rate (1550 or 1480)
- This didn't match the web version which gets `ngn_value` from API

**Root Cause:**
- `UserTokenBalance` model didn't have `ngnValue` field
- Dashboard and Balance viewmodels were calculating NGN by multiplying USD * fixed rate
- API already provides accurate `ngn_value` in the response

**Solution:**
- Added `ngnValue` field to `UserTokenBalance` model
- Updated `fromJson` to parse `ngn_value` from API response
- Changed dashboard and balance viewmodels to sum `token.ngnValue` from API instead of calculating

**API Response Structure:**
```json
{
  "amount": "150.000",
  "usd_value": "21.73500000",
  "ngn_value": 32270.6695815,  // ← Now using this from API
  "token_symbol": "STRK"
}
```

**Files Modified:**
- `/lib/models/user_token_balance.dart` - Added `ngnValue` field
- `/lib/ui/views/dashboard/dashboard_viewmodel.dart` - Use API ngn_value
- `/lib/ui/views/balance/balance_viewmodel.dart` - Use API ngn_value

---

### 3. ✅ Asset Decimal Places Fixed
**Problem:**
- Assets showing too many decimal places (e.g., `100.000000 STRK`)
- Should show only 2 decimal places (e.g., `100.00 STRK`)

**Solution:**
- Changed `formatCrypto()` method from `.toStringAsFixed(6)` to `.toStringAsFixed(2)`
- Updated withdrawal view available balance display from `.toStringAsFixed(4)` to `.toStringAsFixed(2)`

**Files Modified:**
- `/lib/ui/views/balance/balance_viewmodel.dart` - Line 77
- `/lib/ui/views/withdrawal/withdrawal_view.dart` - Line 729

---

## Before vs After

### Dashboard View
**Before:**
- Total Balance: Shows value from `total_balance` API field (wrong)
- Naira Balance: Calculated as `totalBalance * 1480` (inaccurate)

**After:**
- Total Balance: Shows value from `total_deposit` API field (correct)
- Naira Balance: Sum of all `token.ngnValue` from API (accurate)

### Balance View
**Before:**
- Portfolio Overview: Shows value from `total_balance` API field (wrong)
- Naira Balance: Calculated as `totalBalance * 1550` (inaccurate)
- Asset amounts: `100.000000 STRK` (too many decimals)

**After:**
- Portfolio Overview: Shows value from `total_deposit` API field (correct)
- Naira Balance: Sum of all `token.ngnValue` from API (accurate)
- Asset amounts: `100.00 STRK` (clean, 2 decimals)

### Withdrawal View
**Before:**
- Available Balance: `0.5000 ETH` (4 decimals)

**After:**
- Available Balance: `0.50 ETH` (2 decimals)

---

## Technical Details

### NGN Value Calculation Change

**Old Approach (Incorrect):**
```dart
_nairaBalance = _totalBalance * 1550; // Fixed rate
```

**New Approach (Correct):**
```dart
_nairaBalance = _tokenBalances.fold(
  0.0, 
  (sum, token) => sum + token.ngnValue  // From API
);
```

### Total Balance Assignment Change

**Old Approach (Incorrect):**
```dart
_totalBalance = _dashboardSummary?.totalBalance ?? 0.0;
```

**New Approach (Correct):**
```dart
_totalBalance = _dashboardSummary?.totalDeposit ?? 0.0;
```

---

## Testing Checklist

- [x] Dashboard shows correct total balance (matches total_deposit)
- [x] Dashboard shows correct NGN balance (matches web version)
- [x] Balance view shows correct portfolio overview
- [x] Balance view shows correct NGN balance
- [x] Asset amounts show 2 decimal places everywhere
- [x] Withdrawal view shows 2 decimal places for available balance

---

## Notes

- All changes maintain backward compatibility
- NGN values now come directly from API for accuracy
- Decimal formatting is consistent across all views (2 decimal places)
- The swap between `totalBalance` and `totalDeposit` was intentional based on user feedback
