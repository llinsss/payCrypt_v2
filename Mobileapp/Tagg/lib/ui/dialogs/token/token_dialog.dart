import 'package:dotted_line/dotted_line.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:stacked/stacked.dart';
import 'package:stacked_services/stacked_services.dart';

import 'token_dialog_model.dart';
import '../../common/app_assets.dart';

class TokenDialog extends StackedView<TokenDialogModel> {
  final DialogRequest request;
  final Function(DialogResponse) completer;

  const TokenDialog({
    Key? key,
    required this.request,
    required this.completer,
  }) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    TokenDialogModel viewModel,
    Widget? child,
  ) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      backgroundColor: const Color(0xFF130F22),
      insetPadding: const EdgeInsets.symmetric(
          horizontal: 16, vertical: 44), // reduce default margins
      child: Center(
        child: SizedBox(
          width: 450,
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(context),
                const SizedBox(height: 18),
                DottedLine(
                    dashLength: 10,
                    dashGapLength: 6,
                    lineThickness: 0.3,
                    dashColor: Color(0xFF674AA6)),
                const SizedBox(height: 18),
                Flexible(
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildSectionTitle('Fiat'),
                        const SizedBox(height: 18),
                        _buildTokenItem(
                          icon: _buildFiatIcon(AppAssets.ngn, const Color(0xFF120D1E)),
                          name: 'NGN',
                          shortName: 'Naira',
                        ),
                        SizedBox(height: 15),
                        _buildTokenItem(
                          icon: _buildFiatIcon(AppAssets.usd, const Color(0xFF120D1E)),
                          name: 'USD',
                          shortName: 'Dollar',
                        ),
                        const SizedBox(height: 24),
                        DottedLine(
                            dashLength: 10,
                            dashGapLength: 6,
                            lineThickness: 0.3,
                            dashColor: Color(0xFF674AA6)),
                        const SizedBox(height: 24),
                        _buildSectionTitle('Crypto'),
                        const SizedBox(height: 13),
                        _buildTokenItem(
                          icon:
                              _buildCryptoIcon(AppAssets.strk, const Color(0xFF120D1E)),
                          name: 'STRK',
                          shortName: 'Starknet',
                        ),
                        SizedBox(height: 15),
                        _buildTokenItem(
                          icon:
                              _buildCryptoIcon(AppAssets.lsk, const Color(0xFF120D1E)),
                          name: 'LSK',
                          shortName: 'Lisk',
                        ),
                        SizedBox(height: 15),
                        _buildTokenItem(
                          icon:
                              _buildCryptoIcon(AppAssets.base, const Color(0xFF120D1E)),
                          name: 'BASE',
                          shortName: 'Base',
                        ),
                        SizedBox(height: 15),
                        _buildTokenItem(
                          icon:
                              _buildCryptoIcon(AppAssets.flow, const Color(0xFF120D1E)),
                          name: 'FLOW',
                          shortName: 'Flow',
                        ),
                        SizedBox(height: 15),
                        _buildTokenItem(
                          icon:
                              _buildCryptoIcon(AppAssets.u2u, const Color(0xFF120D1E)),
                          name: 'U2U',
                          shortName: 'U2U Network',
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        const Text(
          'Select a token',
          style: TextStyle(
            fontFamily: 'Instrument Sans',
            fontSize: 24,
            fontWeight: FontWeight.w500,
            color: Color(0xFFE2E2E2),
          ),
        ),
        GestureDetector(
          onTap: () => completer(DialogResponse(confirmed: false)),
          child: const Icon(Icons.close, color: Color(0xFFE2E2E2), size: 24),
        ),
      ],
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontFamily: 'Instrument Sans',
        fontSize: 16,
        fontWeight: FontWeight.w500,
        color: Color(0xFFE2E2E2),
      ),
    );
  }

  Widget _buildTokenItem({
    required Widget icon,
    required String name,
    required String shortName,
  }) {
    return GestureDetector(
      onTap: () => completer(DialogResponse(
        confirmed: true,
        data: {'token': name, 'shortName': shortName},
      )),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            icon,
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontFamily: 'Instrument Sans',
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFFE2E2E2),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  shortName,
                  style: const TextStyle(
                    fontFamily: 'Instrument Sans',
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF867EA5),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCryptoIcon(String assetPath, Color backgroundColor) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: backgroundColor,
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Center(
        child: SvgPicture.asset(assetPath, width: 20, height: 20),
      ),
    );
  }

  Widget _buildFiatIcon(String assetPath, Color backgroundColor) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: backgroundColor,
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Center(
          child: Image.asset(
        assetPath,
        fit: BoxFit.fill,
      )),
    );
  }

  @override
  TokenDialogModel viewModelBuilder(BuildContext context) => TokenDialogModel();
}
