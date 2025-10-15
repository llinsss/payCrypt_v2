import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

import 'menu_sheet_sheet_model.dart';

class MenuSheetSheet extends StackedView<MenuSheetSheetModel> {
  final Function(SheetResponse response)? completer;
  final SheetRequest request;

  const MenuSheetSheet({
    Key? key,
    required this.completer,
    required this.request,
  }) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    MenuSheetSheetModel viewModel,
    Widget? child,
  ) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(left: 16, right: 16, top: 16, bottom: 121),
      decoration: BoxDecoration(
        color: const Color(0xFF090715).withOpacity(0.9),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
        border: Border.all(color: const Color(0xFF262140), width: 1),
      ),
      child: Wrap(
        runSpacing: 12,
        spacing: 12,
        children: [
          _buildNavButton(
            icon: Icons.folder_open,
            label: "Bill Payments",
            gradient: const LinearGradient(
              colors: [Color(0xFF181027), Color(0xFF110F20)],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
          ),
          _buildNavButton(
            icon: Icons.account_balance_wallet_outlined,
            label: "Convert Fiat",
            color: const Color(0xFF120F21),
          ),
          _buildNavButton(
            icon: Icons.savings_outlined,
            label: "Deposits",
            color: const Color(0xFF090715),
          ),
          _buildNavButton(
            icon: Icons.arrow_downward,
            label: "Withdrawal",
            gradient: const LinearGradient(
              colors: [Color(0xFF181027), Color(0xFF110F20)],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
          ),
          _buildNavButton(
            icon: Icons.swap_horiz,
            label: "Swap",
            gradient: const LinearGradient(
              colors: [Color(0xFF181027), Color(0xFF110F20)],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
          ),
          _buildNavButton(
            icon: Icons.receipt_long_outlined,
            label: "Pay Bills",
            color: const Color(0xFF120F21),
          ),
        ],
      ),
    );
  }

  Widget _buildNavButton({
    required IconData icon,
    required String label,
    LinearGradient? gradient,
    Color? color,
  }) {
    return Container(
      width: 173,
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: gradient,
        color: gradient == null ? color : null,
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(48),
        boxShadow: const [
          BoxShadow(
            color: Colors.black38,
            offset: Offset(4, 4),
            blurRadius: 30,
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: const Color(0xFF120D1E),
              borderRadius: BorderRadius.circular(100),
              border: Border.all(color: const Color(0xFF262140)),
            ),
            child: Center(
              child: Icon(
                icon,
                size: 18,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            label,
            style: const TextStyle(
              fontFamily: 'Instrument Sans',
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Color(0xFFE2E2E2),
            ),
          ),
        ],
      ),
    );
  }

  @override
  MenuSheetSheetModel viewModelBuilder(BuildContext context) =>
      MenuSheetSheetModel();
}
