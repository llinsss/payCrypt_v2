import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'bill_viewmodel.dart';

class BillView extends StackedView<BillViewModel> {
  const BillView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    BillViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      body: SafeArea(
        child: Column(
          children: [
            _buildTopNavigation(viewModel),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 24),
                    _buildHeader(),
                    const SizedBox(height: 24),
                    _buildServiceCategories(viewModel),
                    const SizedBox(height: 32),
                    _buildProviderSection(viewModel),
                    const SizedBox(height: 24),
                    _buildFormFields(viewModel),
                    const SizedBox(height: 30),
                    _buildActionButton(viewModel),
                    const SizedBox(height: 100),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopNavigation(BillViewModel viewModel) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF090715).withOpacity(0.1),
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(5),
          bottomRight: Radius.circular(5),
        ),
      ),
      child: Column(
        children: [
          // Navigation Bar
          Container(
            height: 64,
            decoration: const BoxDecoration(
              color: Color(0xFF090715),
              border: Border(
                bottom: BorderSide(color: Color(0xFF262140), width: 1),
              ),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Logo Section
                Row(
                  children: [
                    SvgPicture.asset(
                      AppAssets.log,
                      height: 29,
                      width: 29,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      "Tagged",
                      style: GoogleFonts.inter(
                        fontStyle: FontStyle.italic,
                        fontWeight: FontWeight.w700,
                        fontSize: 16.24,
                        height: 20 / 16.24, // line-height to font-size ratio
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),

                // Profile and Settings
                Row(
                  children: [
                    // Notification Button
                    Container(
                      width: 39,
                      height: 39,
                      decoration: BoxDecoration(
                        color: const Color(0xFF130F22),
                        border: Border.all(color: const Color(0xFF262140)),
                        borderRadius: BorderRadius.circular(48),
                      ),
                      child: const Icon(
                        Icons.notifications_outlined,
                        color: Color(0xFFE2E2E2),
                        size: 16,
                      ),
                    ),

                    const SizedBox(width: 14),

                    Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFF130F22),
                          border: Border.all(color: Colors.white),
                          borderRadius: BorderRadius.circular(48),
                        ),
                        child: Image.asset(
                          AppAssets.profile,
                        )),

                    const SizedBox(width: 14),

                    // Menu Button
                    GestureDetector(
                      onTap: () {},
                      child: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFF130F22),
                          border: Border.all(color: const Color(0xFF262140)),
                          borderRadius: BorderRadius.circular(48),
                        ),
                        child: const Icon(
                          Icons.menu,
                          color: Color(0xFFE2E2E2),
                          size: 16,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return const Text(
      'Pay Bills',
      style: TextStyle(
        color: Color(0xFFE2E2E2),
        fontSize: 18,
        fontWeight: FontWeight.w500,
      ),
    );
  }

  Widget _buildServiceCategories(BillViewModel viewModel) {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        _buildServiceCard(
          'Electricity',
          AppAssets.balance,
          viewModel.selectedService == 'Electricity',
          viewModel,
        ),
        _buildServiceCard(
          'Internet',
          AppAssets.balance,
          viewModel.selectedService == 'Internet',
          viewModel,
        ),
        _buildServiceCard(
          'Airtime',
          AppAssets.balance,
          viewModel.selectedService == 'Airtime',
          viewModel,
        ),
        _buildServiceCard(
          'Transport',
          AppAssets.balance,
          viewModel.selectedService == 'Transport',
          viewModel,
        ),
        _buildServiceCard(
          'Rent/Utilities',
          AppAssets.balance,
          viewModel.selectedService == 'Rent/Utilities',
          viewModel,
        ),
      ],
    );
  }

  Widget _buildServiceCard(
    String title,
    String assetPath,
    bool isSelected,
    BillViewModel viewModel,
  ) {
    return GestureDetector(
      onTap: () => viewModel.selectService(title),
      child: Container(
        width: 190,
        height: 80,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF181027), Color(0xFF110F20)],
          ),
          border: Border.all(
            color:
                isSelected ? const Color(0xFF674AA6) : const Color(0xFF262140),
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              padding: const EdgeInsets.all(6), // to give breathing room
              decoration: BoxDecoration(
                color: const Color(0xFF120D1E),
                border: Border.all(color: const Color(0xFF262140)),
                borderRadius: BorderRadius.circular(100),
              ),
              child: SvgPicture.asset(
                assetPath,
                width: 20,
                height: 20,
              ),
            ),
            const SizedBox(width: 12),
            Text(
              title,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProviderSection(BillViewModel viewModel) {
    if (viewModel.selectedService.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Select Provider',
          style: GoogleFonts.instrumentSans(
            color: Color(0xFFE2E2E2),
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 12),
        if (viewModel.shouldShowProviderGrid())
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: viewModel
                .getProvidersForService()
                .map((provider) => _buildProviderCard(provider,
                    viewModel.selectedProvider == provider, viewModel))
                .toList(),
          )
        else
          _buildProviderDropdown(viewModel),
      ],
    );
  }

  Widget _buildProviderCard(
      String provider, bool isSelected, BillViewModel viewModel) {
    return GestureDetector(
      onTap: () => viewModel.selectProvider(provider),
      child: Container(
        width: 190,
        height: 60,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF120F21),
          border: Border.all(
            color:
                isSelected ? const Color(0xFF674AA6) : const Color(0xFF262140),
            width: 2,
          ),
          borderRadius: BorderRadius.circular(48),
        ),
        child: Row(
          children: [
            Center(
              child: Image.asset(
                _getProviderLogo(provider),
                width: 32,
                height: 32,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              provider,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _getProviderLogo(String provider) {
    switch (provider.toLowerCase()) {
      case 'mtn':
        return AppAssets.mtn;
      case 'airtel':
        return AppAssets.airtel;
      case 'glo':
        return AppAssets.glo;
      case '9mobile':
        return AppAssets.mobile;
      case 'spectranet':
        return AppAssets.spec;
      default:
        return AppAssets.mtn; // fallback
    }
  }

  Widget _buildProviderDropdown(BillViewModel viewModel) {
    return Container(
      width: double.infinity,
      height: 60,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF120F21),
        border: Border.all(color: const Color(0xFF262140), width: 2),
        borderRadius: BorderRadius.circular(48),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            viewModel.selectedProvider.isEmpty
                ? 'Choose a provider'
                : viewModel.selectedProvider,
            style: TextStyle(
              color: viewModel.selectedProvider.isEmpty
                  ? const Color(0xFF867EA5)
                  : Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
          const Icon(
            Icons.keyboard_arrow_down,
            color: Colors.white,
            size: 24,
          ),
        ],
      ),
    );
  }

  Widget _buildFormFields(BillViewModel viewModel) {
    if (viewModel.selectedService.isEmpty) return const SizedBox.shrink();

    return Column(
      children: [
        _buildFormField(
          label: viewModel.getFirstFieldLabel(),
          controller: viewModel.firstFieldController,
          hintText: "Enter ${viewModel.getFirstFieldLabel()}",
        ),
        const SizedBox(height: 24),
        _buildFormField(
          label: viewModel.getSecondFieldLabel(),
          controller: viewModel.secondFieldController,
          hintText: "Enter ${viewModel.getSecondFieldLabel()}",
        ),
      ],
    );
  }

  Widget _buildFormField({
    required String label,
    required TextEditingController controller,
    String hintText = '',
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Color(0xFFE2E2E2),
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          height: 60,
          decoration: BoxDecoration(
            color: const Color(0xFF120F21),
            border: Border.all(color: const Color(0xFF262140), width: 2),
            borderRadius: BorderRadius.circular(48),
          ),
          alignment: Alignment.center,
          child: TextField(
            controller: controller,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w500,
            ),
            decoration: InputDecoration(
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 24),
              hintText: hintText,
              hintStyle: const TextStyle(
                color: Color(0xFF867EA5),
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActionButton(BillViewModel viewModel) {
    return Container(
      width: double.infinity,
      height: 60,
      child: ElevatedButton(
        onPressed: () {},
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          foregroundColor: const Color(0xFFE2E2E2),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(48),
          ),
          padding: EdgeInsets.zero,
        ),
        child: Ink(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF674AA6), Color(0xFF2E235C)],
            ),
            borderRadius: BorderRadius.circular(48),
          ),
          child: Container(
            alignment: Alignment.center,
            child: Text(
              'Pay Bill',
              style: GoogleFonts.instrumentSans(
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  BillViewModel viewModelBuilder(
    BuildContext context,
  ) =>
      BillViewModel();
}
