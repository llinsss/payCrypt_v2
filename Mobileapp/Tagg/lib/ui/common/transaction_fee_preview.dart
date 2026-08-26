import 'package:flutter/material.dart';

/// TransactionFeePreview displays gas fee estimation before transaction submission
///
/// Shows:
/// - Base transaction amount
/// - Gas fee in USD/NGN
/// - Total transaction cost
/// - Warning if insufficient gas
class TransactionFeePreview extends StatelessWidget {
  final double amount;
  final String token;
  final String? gasFeeUSD;
  final String? gasFeeNative;
  final String chain;
  final bool hasInsufficientGas;
  final String? shortfall;
  final String? shortfallInUSD;
  final VoidCallback? onRetryEstimate;

  const TransactionFeePreview({
    Key? key,
    required this.amount,
    required this.token,
    this.gasFeeUSD,
    this.gasFeeNative,
    required this.chain,
    this.hasInsufficientGas = false,
    this.shortfall,
    this.shortfallInUSD,
    this.onRetryEstimate,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final totalCost = amount + (double.tryParse(gasFeeUSD ?? "0") ?? 0);

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF130F22),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: hasInsufficientGas ? const Color(0xFFEF4444) : const Color(0xFF262140),
          width: 1,
        ),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Transaction Summary',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFFE2E2E2),
                ),
              ),
              Text(
                'on $chain',
                style: const TextStyle(
                  fontSize: 12,
                  color: Color(0xFF867EA5),
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _FeeRow(
            label: 'Amount',
            value: '$amount $token',
            valueColor: const Color(0xFFE2E2E2),
          ),
          const SizedBox(height: 8),
          _FeeRow(
            label: 'Gas Fee',
            value: gasFeeUSD != null ? '\$$gasFeeUSD' : 'Calculating...',
            subValue: gasFeeNative != null ? '${gasFeeNative!} ${_getNativeToken(chain)}' : null,
            valueColor: const Color(0xFFF59E0B),
          ),
          const Divider(
            color: Color(0xFF262140),
            height: 16,
            thickness: 1,
          ),
          _FeeRow(
            label: 'Total Cost',
            value: '\$$totalCost',
            valueColor: const Color(0xFF22C55E),
            isBold: true,
          ),
          if (hasInsufficientGas) ...[
            const SizedBox(height: 12),
            _InsufficientGasWarning(
              shortfall: shortfall,
              shortfallInUSD: shortfallInUSD,
              token: _getNativeToken(chain),
              onRetry: onRetryEstimate,
            ),
          ],
        ],
      ),
    );
  }

  String _getNativeToken(String chain) {
    switch (chain.toLowerCase()) {
      case 'ethereum':
        return 'ETH';
      case 'base':
        return 'ETH';
      case 'lisk':
        return 'LSK';
      case 'u2u':
        return 'U2U';
      default:
        return 'ETH';
    }
  }
}

/// Simple row for displaying fee items
class _FeeRow extends StatelessWidget {
  final String label;
  final String value;
  final String? subValue;
  final Color? valueColor;
  final bool isBold;

  const _FeeRow({
    required this.label,
    required this.value,
    this.subValue,
    this.valueColor,
    this.isBold = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            color: Color(0xFF867EA5),
            fontWeight: FontWeight.w500,
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: isBold ? FontWeight.w700 : FontWeight.w600,
                color: valueColor ?? const Color(0xFFE2E2E2),
              ),
            ),
            if (subValue != null)
              Text(
                subValue!,
                style: const TextStyle(
                  fontSize: 11,
                  color: Color(0xFF867EA5),
                  fontWeight: FontWeight.w400,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// Warning banner for insufficient gas
class _InsufficientGasWarning extends StatelessWidget {
  final String? shortfall;
  final String? shortfallInUSD;
  final String token;
  final VoidCallback? onRetry;

  const _InsufficientGasWarning({
    this.shortfall,
    this.shortfallInUSD,
    required this.token,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFEF4444).withOpacity(0.1),
        border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.3)),
        borderRadius: BorderRadius.circular(8),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.warning_rounded,
                color: Color(0xFFEF4444),
                size: 16,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Insufficient gas balance',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFFEF4444),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'You need an additional ${shortfall ?? '...'} $token (≈\$$shortfallInUSD)',
            style: const TextStyle(
              fontSize: 11,
              color: Color(0xFFDCFCE7),
              height: 1.4,
            ),
          ),
          if (onRetry != null) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 32,
              child: TextButton(
                onPressed: onRetry,
                style: TextButton.styleFrom(
                  backgroundColor: const Color(0xFFEF4444).withOpacity(0.2),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                child: const Text(
                  'Retry Estimate',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFFEF4444),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Modal showing gas estimation error
class GasEstimationError extends StatelessWidget {
  final String message;
  final String code;
  final VoidCallback onRetry;
  final VoidCallback onDismiss;

  const GasEstimationError({
    Key? key,
    required this.message,
    required this.code,
    required this.onRetry,
    required this.onDismiss,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF130F22),
      title: const Text(
        'Gas Estimation Error',
        style: TextStyle(
          color: Color(0xFFE2E2E2),
          fontWeight: FontWeight.w600,
        ),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            message,
            style: const TextStyle(
              color: Color(0xFFE2E2E2),
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Error: $code',
            style: const TextStyle(
              color: Color(0xFF867EA5),
              fontSize: 10,
              fontFamily: 'Courier',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: onDismiss,
          child: const Text('Dismiss'),
        ),
        TextButton(
          onPressed: onRetry,
          child: const Text('Retry'),
        ),
      ],
    );
  }
}
