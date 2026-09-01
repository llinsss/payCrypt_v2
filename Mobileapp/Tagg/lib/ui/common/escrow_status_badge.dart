import 'package:flutter/material.dart';

/// EscrowStatusBadge displays the status of an escrow-protected transaction
///
/// Shows "Escrowed" with lock icon and remaining lock time
class EscrowStatusBadge extends StatelessWidget {
  final String status;
  final DateTime createdAt;
  final int lockPeriodDays;
  final TextStyle? textStyle;
  final Color? backgroundColor;
  final Color? textColor;

  const EscrowStatusBadge({
    Key? key,
    required this.status,
    required this.createdAt,
    required this.lockPeriodDays,
    this.textStyle,
    this.backgroundColor,
    this.textColor,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final isEscrowed = status == 'escrow_pending' || status == 'escrowed';

    if (!isEscrowed) {
      return const SizedBox.shrink();
    }

    final lockExpiry = createdAt.add(Duration(days: lockPeriodDays));
    final isExpired = DateTime.now().isAfter(lockExpiry);
    final remaining = lockExpiry.difference(DateTime.now());

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: backgroundColor ?? const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.lock,
            size: 14,
            color: textColor ?? const Color(0xFFD97706),
          ),
          const SizedBox(width: 6),
          Text(
            isExpired
                ? 'Escrowed (expires today)'
                : 'Escrowed (${remaining.inDays + 1}d remaining)',
            style: textStyle ??
                TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: textColor ?? const Color(0xFFD97706),
                ),
          ),
        ],
      ),
    );
  }
}

/// EscrowStatusIndicator shows escrow state for a transaction
class EscrowStatusIndicator extends StatelessWidget {
  final String status;
  final DateTime? createdAt;
  final int lockPeriodDays;
  final String? senderTag;
  final String? recipientTag;

  const EscrowStatusIndicator({
    Key? key,
    required this.status,
    this.createdAt,
    this.lockPeriodDays = 3,
    this.senderTag,
    this.recipientTag,
  }) : super(key: key);

  String _getStatusLabel() {
    switch (status) {
      case 'escrow_pending':
        return 'Payment Escrowed';
      case 'escrow_released':
        return 'Escrow Released';
      case 'escrow_cancelled':
        return 'Escrow Cancelled';
      default:
        return 'Escrowed';
    }
  }

  Color _getStatusColor() {
    switch (status) {
      case 'escrow_pending':
        return const Color(0xFFD97706);
      case 'escrow_released':
        return const Color(0xFF10B981);
      case 'escrow_cancelled':
        return const Color(0xFFEF4444);
      default:
        return const Color(0xFF6B7280);
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusColor = _getStatusColor();
    final statusLabel = _getStatusLabel();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: statusColor.withOpacity(0.1),
        border: Border.all(color: statusColor.withOpacity(0.3)),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            _getStatusIcon(),
            size: 12,
            color: statusColor,
          ),
          const SizedBox(width: 4),
          Text(
            statusLabel,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: statusColor,
            ),
          ),
        ],
      ),
    );
  }

  IconData _getStatusIcon() {
    switch (status) {
      case 'escrow_pending':
        return Icons.schedule;
      case 'escrow_released':
        return Icons.check_circle;
      case 'escrow_cancelled':
        return Icons.cancel;
      default:
        return Icons.info;
    }
  }
}
