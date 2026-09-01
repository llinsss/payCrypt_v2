// deposit_viewmodel.dart
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/models/user_model.dart';
import 'package:Tagg/models/chains_models.dart';
import 'package:Tagg/services/user_service.dart';
import 'package:Tagg/services/chains_service.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:stacked/stacked.dart';

class TokenLogos {
  static const Map<String, String> logos = {
    "STRK": "lib/assets/svgs/icons/strk.svg",
    "LSK": "lib/assets/svgs/icons/lsk.svg",
    "BASE": "lib/assets/svgs/icons/base.svg",
    "FLOW": "lib/assets/svgs/icons/flw.svg",
    "U2U": "lib/assets/svgs/icons/u2u.svg",
  };
}

class DepositViewModel extends BaseViewModel {
  final _userService = locator<UserService>();
  final _chainsService = locator<ChainsService>();

  // --- Private state ---
  String _selectedToken = "Select Token";
  int _selectedNavIndex = 1;
  String _tag = "@loading..."; // Default while loading
  User? _currentUser;

  String _qrData = "";
  bool _isGeneratingQr = false;

  // Chains from API
  List<Chain> _chains = [];
  List<Chain> get chains => _chains;

  // --- Getters ---
  String get selectedToken => _selectedToken;
  int get selectedNavIndex => _selectedNavIndex;
  String get tag => _tag;
  String get qrData => _qrData;
  bool get isGeneratingQr => _isGeneratingQr;
  User? get currentUser => _currentUser;

  // Get selected chain name for display
  String get selectedChainName {
    if (_selectedToken == "Select Token") return "Select Token";
    
    try {
      final chain = _chains.firstWhere(
        (c) => c.nativeCurrency.symbol == _selectedToken,
      );
      return chain.name;
    } catch (e) {
      return _selectedToken; // Fallback to symbol
    }
  }

  // Get selected chain symbol for logo mapping
  String get selectedChainSymbol {
    if (_selectedToken == "Select Token") return "Select Token";
    
    try {
      final chain = _chains.firstWhere(
        (c) => c.nativeCurrency.symbol == _selectedToken,
      );
      return chain.symbol;
    } catch (e) {
      return _selectedToken; // Fallback to symbol
    }
  }

  // Dynamic token list from chains
  List<String> get availableTokens {
    final tokens = ['Select Token'];
    tokens.addAll(_chains.map((chain) => chain.nativeCurrency.symbol));
    return tokens;
  }

  // --- Actions / Setters used by the view ---

  /// Initialize the view model - load user profile and chains
  Future<void> initialize() async {
    await _loadChains();
    await _loadUserProfile();
  }

  /// Load chains from API
  Future<void> _loadChains() async {
    try {
      _chains = await _chainsService.getChains();
      print('✅ Chains loaded: ${_chains.length} chains');
      notifyListeners();
    } catch (e) {
      print('❌ Error loading chains: $e');
    }
  }

  /// Load user profile from backend
  Future<void> _loadUserProfile() async {
    try {
      _currentUser = await _userService.getProfile();
      print('🔍 User profile loaded: ${_currentUser?.toString()}');

      if (_currentUser != null) {
        String userTag = _currentUser!.tag;
        print('📝 Raw tag from API: "$userTag"');

        // Check if tag is empty or null
        if (userTag.isEmpty) {
          print('⚠️ User tag is empty, using fallback');
          _tag = "@user${_currentUser!.id}"; // Use user ID as fallback
        } else {
          // Ensure tag starts with @ if it doesn't already
          if (!userTag.startsWith('@')) {
            userTag = '@$userTag';
          }
          _tag = userTag;
        }

        print('✅ Final tag set to: "$_tag"');
        notifyListeners();
      } else {
        print('❌ User profile is null');
        _tag = "@guest";
        notifyListeners();
      }
    } catch (e) {
      // Handle error - keep default tag or show error
      print('❌ Error loading user profile: $e');
      _tag = "@user"; // Fallback tag
      notifyListeners();
    }
  }

  /// Select a token (called when user taps the token selector).
  /// After selecting, you might want to call [generateQRCodeData].
  void selectToken(String token) {
    if (_selectedToken == token) return;
    _selectedToken = token;
    notifyListeners();
  }

  /// Change bottom navigation index
  void setNavIndex(int index) {
    if (_selectedNavIndex == index) return;
    _selectedNavIndex = index;
    notifyListeners();
  }

  /// Copy the tag to clipboard (used by "Copy Tag" button).
  Future<void> copyTagToClipboard() async {
    await Clipboard.setData(ClipboardData(text: _tag));
    // You can trigger a snackbar/notification from the View or use a DialogService
    // from stacked to show feedback to the user.
  }

  /// Share the tag and payment link via native OS share sheet.
  Future<void> shareTag() async {
    try {
      final paymentLink = 'taggedpay.xyz/pay/$_tag';
      final shareText = 'Send me crypto! My tag is $_tag\n$paymentLink';
      await Share.share(shareText);
    } catch (e) {
      print('❌ Error sharing tag: $e');
    }
  }

  /// Refresh action (e.g., re-fetch balances or refresh QR). Uses stacked's setBusy.
  Future<void> refresh() async {
    setBusy(true);
    try {
      // Reload user profile to get latest tag
      await _loadUserProfile();
      // TODO: call your API / balance fetch logic here.
      await Future.delayed(const Duration(milliseconds: 300));
    } finally {
      setBusy(false);
    }
  }

  /// Generate a QR payload for the selected token + tag.
  /// This is a simple deterministic payload; replace with your actual deposit URI format.
  Future<void> generateQRCodeData() async {
    // if no token selected, clear QR and return
    if (_selectedToken == "Select Token" || _selectedToken.isEmpty) {
      _qrData = "";
      notifyListeners();
      return;
    }

    _isGeneratingQr = true;
    notifyListeners();

    try {
      // Compose a simple deposit URI. Replace with your real on-chain format.
      // Example: "starknet:USDC:@ejembiii" or some JSON payload.
      _qrData = "starknet:$_selectedToken:$_tag";

      // simulate small work / network call if needed
      await Future.delayed(const Duration(milliseconds: 200));
    } finally {
      _isGeneratingQr = false;
      notifyListeners();
    }
  }

  /// Clears generated QR data (useful if user deselects token)
  void clearQrData() {
    _qrData = "";
    notifyListeners();
  }
}
