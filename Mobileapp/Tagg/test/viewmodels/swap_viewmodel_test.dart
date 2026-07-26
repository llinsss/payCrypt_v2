import 'package:flutter_test/flutter_test.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/ui/views/swap/swap_viewmodel.dart';
import 'package:Tagg/services/swap_service.dart';

import '../helpers/test_helpers.dart';

void main() {
  group('SwapViewModel Tests -', () {
    late SwapViewModel viewModel;

    setUp(() {
      registerServices();
      viewModel = SwapViewModel();
    });

    tearDown(() {
      viewModel.dispose();
      locator.reset();
    });

    group('Initial State -', () {
      test('should have correct default values', () {
        expect(viewModel.selectedFromToken, 'STRK');
        expect(viewModel.selectedToToken, 'Select Token');
        expect(viewModel.slippageValue, 0.5);
        expect(viewModel.isQuoting, false);
        expect(viewModel.isSwapping, false);
        expect(viewModel.errorMessage, '');
        expect(viewModel.currentQuote, null);
        expect(viewModel.lastSwapResult, null);
      });
    });

    group('Token Selection -', () {
      test('should update from token', () {
        viewModel.setFromToken('LSK');
        expect(viewModel.selectedFromToken, 'LSK');
      });

      test('should update to token', () {
        viewModel.setToToken('BASE');
        expect(viewModel.selectedToToken, 'BASE');
      });
    });

    group('Slippage -', () {
      test('should update slippage value', () {
        viewModel.setSlippage(1.0);
        expect(viewModel.slippageValue, 1.0);
      });

      test('should update slippage from text input', () {
        viewModel.updateSlippageFromText('2.0');
        expect(viewModel.slippageValue, 2.0);
      });

      test('should not update slippage for invalid text', () {
        viewModel.updateSlippageFromText('invalid');
        expect(viewModel.slippageValue, 0.5); // unchanged
      });

      test('should not update slippage for out-of-range values', () {
        viewModel.updateSlippageFromText('0.001');
        expect(viewModel.slippageValue, 0.5); // unchanged, below 0.01
      });
    });

    group('Amount -', () {
      test('should update amount', () {
        viewModel.setAmount('100');
        expect(viewModel.amount, '100');
      });
    });

    group('fetchQuote -', () {
      test('should fetch quote successfully with valid inputs', () async {
        viewModel.setFromToken('STRK');
        viewModel.setToToken('LSK');
        viewModel.setAmount('100');

        await viewModel.fetchQuote();

        expect(viewModel.isQuoting, false);
        expect(viewModel.errorMessage, '');
        expect(viewModel.currentQuote, isNotNull);
        expect(viewModel.currentQuote!.fromToken, 'STRK');
        expect(viewModel.currentQuote!.toToken, 'LSK');
        expect(double.tryParse(viewModel.expectedOutput), isNotNull);
      });

      test('should set error for empty amount', () async {
        viewModel.setFromToken('STRK');
        viewModel.setToToken('LSK');
        viewModel.setAmount('');

        await viewModel.fetchQuote();

        expect(viewModel.errorMessage, 'Please enter a valid amount');
        expect(viewModel.currentQuote, null);
      });

      test('should set error for negative amount', () async {
        viewModel.setFromToken('STRK');
        viewModel.setToToken('LSK');
        viewModel.setAmount('-50');

        await viewModel.fetchQuote();

        expect(viewModel.errorMessage, 'Please enter a valid amount');
      });

      test('should set error when toToken is not selected', () async {
        viewModel.setFromToken('STRK');
        viewModel.setToToken('Select Token');
        viewModel.setAmount('100');

        await viewModel.fetchQuote();

        expect(viewModel.errorMessage, 'Please select a token to swap to');
      });

      test('should set error when from and to tokens are the same', () async {
        viewModel.setFromToken('STRK');
        viewModel.setToToken('STRK');
        viewModel.setAmount('100');

        await viewModel.fetchQuote();

        expect(viewModel.errorMessage, 'From and to tokens must be different');
      });

      test('should handle API errors gracefully', () async {
        // Configure mock to throw
        final swapService = getAndRegisterSwapService();
        when(swapService.getQuote(
          fromToken: anyNamed('fromToken'),
          toToken: anyNamed('toToken'),
          amount: anyNamed('amount'),
          chainId: anyNamed('chainId'),
          slippage: anyNamed('slippage'),
        )).thenThrow(Exception('Network error'));

        viewModel.setFromToken('STRK');
        viewModel.setToToken('LSK');
        viewModel.setAmount('100');

        await viewModel.fetchQuote();

        expect(viewModel.errorMessage, contains('Failed to get quote'));
        expect(viewModel.expectedOutput, '0.00');
      });
    });

    group('performSwap -', () {
      test('should execute swap successfully', () async {
        viewModel.setFromToken('STRK');
        viewModel.setToToken('LSK');
        viewModel.setAmount('100');

        await viewModel.performSwap();

        expect(viewModel.isSwapping, false);
        expect(viewModel.errorMessage, '');
        expect(viewModel.lastSwapResult, isNotNull);
        expect(viewModel.lastSwapResult!.status, 'completed');
        expect(viewModel.lastSwapResult!.fromToken, 'STRK');
        expect(viewModel.lastSwapResult!.toToken, 'LSK');
      });

      test('should use existing quote when available', () async {
        viewModel.setFromToken('STRK');
        viewModel.setToToken('LSK');
        viewModel.setAmount('100');

        // First fetch a quote
        await viewModel.fetchQuote();
        expect(viewModel.currentQuote, isNotNull);

        // Then perform swap — should use the existing quote
        await viewModel.performSwap();

        expect(viewModel.lastSwapResult, isNotNull);
        expect(viewModel.lastSwapResult!.status, 'completed');
        // Quote should be cleared after use
        expect(viewModel.currentQuote, isNull);
      });

      test('should set error for empty amount', () async {
        viewModel.setFromToken('STRK');
        viewModel.setToToken('LSK');
        viewModel.setAmount('');

        await viewModel.performSwap();

        expect(viewModel.errorMessage, 'Please enter a valid amount');
      });

      test('should set error when toToken is not selected', () async {
        viewModel.setFromToken('STRK');
        viewModel.setToToken('Select Token');
        viewModel.setAmount('100');

        await viewModel.performSwap();

        expect(viewModel.errorMessage, 'Please select a token to swap to');
      });

      test('should set error when from and to tokens are the same', () async {
        viewModel.setFromToken('STRK');
        viewModel.setToToken('STRK');
        viewModel.setAmount('100');

        await viewModel.performSwap();

        expect(viewModel.errorMessage, 'From and to tokens must be different');
      });

      test('should handle API errors during swap', () async {
        final swapService = getAndRegisterSwapService();
        when(swapService.executeSwap(
          fromToken: anyNamed('fromToken'),
          toToken: anyNamed('toToken'),
          amount: anyNamed('amount'),
          chainId: anyNamed('chainId'),
          slippage: anyNamed('slippage'),
          confirm: anyNamed('confirm'),
        )).thenThrow(Exception('Swap failed'));

        viewModel.setFromToken('STRK');
        viewModel.setToToken('LSK');
        viewModel.setAmount('100');

        await viewModel.performSwap();

        expect(viewModel.errorMessage, contains('Swap failed'));
        expect(viewModel.lastSwapResult, isNull);
      });
    });

    group('Error Management -', () {
      test('should clear error message', () {
        viewModel.setFromToken('STRK');
        viewModel.setToToken('STRK');
        viewModel.setAmount('100');
        // Trigger an error
        viewModel.performSwap();
        // Errors are set asynchronously, but clearError should still work
        viewModel.clearError();
        expect(viewModel.errorMessage, '');
      });
    });
  });
}
