/// Chain-specific wallet address validation (issue #447).
///
/// Mirrors the backend `utils/validateAddress.js` rules so the mobile app can
/// surface a clear, inline error *before* a withdrawal or transfer is
/// submitted. Sending to a wrong-chain or malformed address permanently loses
/// funds, so this guards the address input field directly.
class AddressValidator {
  AddressValidator._();

  static final RegExp _evm = RegExp(r'^0x[0-9a-fA-F]{40}$');
  static final RegExp _starknet = RegExp(r'^0x[0-9a-fA-F]{1,64}$');
  static final RegExp _stellar = RegExp(r'^G[A-Z2-7]{55}$');
  static final RegExp _flow = RegExp(r'^0x[0-9a-fA-F]{16}$');

  /// Canonical chain keys that share the EVM (0x + 40 hex) address format.
  static const Set<String> evmChains = {'base', 'lisk', 'u2u'};

  static const Map<String, String> _display = {
    'base': 'Base',
    'lisk': 'Lisk',
    'u2u': 'U2U',
    'starknet': 'Starknet',
    'stellar': 'Stellar',
    'flow': 'Flow',
  };

  static const Map<String, String> _expected = {
    'base': '0x...',
    'lisk': '0x...',
    'u2u': '0x...',
    'starknet': '0x...',
    'stellar': 'G...',
    'flow': '0x...',
  };

  /// Resolve a chain symbol/name (e.g. `BASE`, `STRK`, `Stellar`, `XLM`) to a
  /// canonical key. Returns null when the chain is not recognised.
  static String? resolveChain(String? chain) {
    if (chain == null) return null;
    switch (chain.trim().toUpperCase()) {
      case 'BASE':
        return 'base';
      case 'LSK':
      case 'LISK':
        return 'lisk';
      case 'U2U':
        return 'u2u';
      case 'STRK':
      case 'STARKNET':
        return 'starknet';
      case 'FLOW':
        return 'flow';
      case 'XLM':
      case 'STELLAR':
        return 'stellar';
      default:
        return null;
    }
  }

  /// Returns `null` when [address] is a valid address for [chain], otherwise a
  /// human-readable error message suitable for inline display under the field.
  static String? validate(String? address, String? chain) {
    final addr = (address ?? '').trim();
    if (addr.isEmpty) return 'Wallet address is required';

    final key = resolveChain(chain);
    if (key == null) {
      return 'Select a token/chain before entering an address';
    }

    bool ok;
    if (evmChains.contains(key)) {
      ok = _evm.hasMatch(addr);
    } else if (key == 'starknet') {
      ok = _starknet.hasMatch(addr);
    } else if (key == 'stellar') {
      ok = _stellar.hasMatch(addr);
    } else if (key == 'flow') {
      ok = _flow.hasMatch(addr);
    } else {
      ok = false;
    }

    if (!ok) {
      return 'Invalid address for ${_display[key]} chain. '
          'Expected ${_expected[key]} format.';
    }
    return null;
  }
}
