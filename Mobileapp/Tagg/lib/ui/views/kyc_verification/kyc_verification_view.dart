import 'dart:io';

import 'package:Tagg/ui/common/app_assets.dart';
import 'package:Tagg/ui/views/kyc_verification/kyc_verification_viewmodel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

class KycVerificationView extends StackedView<KycVerificationViewModel> {
  const KycVerificationView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    KycVerificationViewModel viewModel,
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
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildHeader(context, viewModel),
                      const SizedBox(height: 24),
                      _buildProgressIndicator(viewModel),
                      const SizedBox(height: 24),
                      _buildStepContent(context, viewModel),
                      const SizedBox(height: 52),
                      _buildActionButton(context, viewModel),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopNavigation(KycVerificationViewModel viewModel) {
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
                        height: 20 / 16.24,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
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
                      child: Image.asset(AppAssets.profile),
                    ),
                    const SizedBox(width: 14),
                    Container(
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
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(
      BuildContext context, KycVerificationViewModel viewModel) {
    return Row(
      children: [
        GestureDetector(
          onTap: () => Navigator.pop(context),
          child: const Icon(
            Icons.arrow_back,
            color: Color(0xFFE2E2E2),
            size: 24,
          ),
        ),
      ],
    );
  }

  Widget _buildProgressIndicator(KycVerificationViewModel viewModel) {
    return Row(
      children: List.generate(
        viewModel.steps.length,
        (index) => Expanded(
          child: Padding(
            padding: EdgeInsets.only(
                right: index < viewModel.steps.length - 1 ? 20 : 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  viewModel.steps[index],
                  style: const TextStyle(
                    color: Color(0xFFE2E2E2),
                    fontSize: 14,
                    fontWeight: FontWeight.w400,
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  height: 6,
                  decoration: BoxDecoration(
                    color: index <= viewModel.currentStep
                        ? const Color(0xFF00D084)
                        : const Color(0xFF262140),
                    borderRadius: BorderRadius.circular(100),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStepContent(
      BuildContext context, KycVerificationViewModel model) {
    switch (model.currentStep) {
      case 0:
        return _buildPersonalDetailsStep(model);
      case 1:
        return _buildDocumentsStep(context, model);
      case 2:
        return _buildReviewStep(model);
      default:
        return _buildPersonalDetailsStep(model);
    }
  }

  Widget _buildPersonalDetailsStep(KycVerificationViewModel model) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'KYC Verification',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Verify your identity',
          style: TextStyle(
            color: Color(0xFF867EA5),
            fontSize: 14,
            fontWeight: FontWeight.w400,
          ),
        ),
        const SizedBox(height: 24),
        _buildField('Full Name', model.fullNameController),
        const SizedBox(height: 24),
        _buildField('Phone Number', model.phoneController),
        const SizedBox(height: 24),
        _buildField('Address', model.addressController),
        const SizedBox(height: 24),
        _buildField(
          'Date of Birth',
          model.dobController,
          isSensitive: true,
          isVisible: model.isDobVisible,
          onToggle: model.toggleDobVisibility,
        ),
        const SizedBox(height: 24),
        _buildField(
          'BVN',
          model.bvnController,
          isSensitive: true,
          isVisible: model.isBvnVisible,
          onToggle: model.toggleBvnVisibility,
        ),
      ],
    );
  }

  Widget _buildDocumentsStep(
      BuildContext context, KycVerificationViewModel model) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'KYC Verification',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Verify your identity',
          style: TextStyle(
            color: Color(0xFF867EA5),
            fontSize: 14,
            fontWeight: FontWeight.w400,
          ),
        ),
        const SizedBox(height: 24),
        _buildDocumentUpload(
          'Upload ID Document',
          "NIN, Driver's Licence or Passport",
          model.idDocument,
          () => _pickDocument(context, model, true),
        ),
        const SizedBox(height: 24),
        _buildDocumentUpload(
          'Upload Proof of Address',
          'Utility bill from the last 3 months',
          model.proofOfAddress,
          () => _pickDocument(context, model, false),
        ),
        const SizedBox(height: 24),
        _buildRequirementsCard(),
      ],
    );
  }

  Widget _buildReviewStep(KycVerificationViewModel model) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Review Documents',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Verify your identity',
          style: TextStyle(
            color: Color(0xFF867EA5),
            fontSize: 14,
            fontWeight: FontWeight.w400,
          ),
        ),
        const SizedBox(height: 24),
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFF262140)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            children: [
              _buildReviewRow('Full Name', model.formData['Full Name']!),
              _buildReviewRow('Phone Number', model.formData['Phone Number']!),
              _buildReviewRow('Address', model.formData['Address']!),
              _buildReviewRow(
                  'Date of Birth', model.formData['Date of Birth']!),
              _buildReviewRow('BVN', model.formData['BVN']!),
              _buildReviewRow('ID Document', 'Uploaded', isLink: true),
              _buildReviewRow('Proof of Address', 'Uploaded',
                  isLink: true, isLast: true),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildField(
    String label,
    TextEditingController controller, {
    bool isSensitive = false,
    bool isVisible = true,
    VoidCallback? onToggle,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Color(0xFFE2E2E2),
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          height: 60,
          padding: const EdgeInsets.symmetric(horizontal: 24),
          decoration: BoxDecoration(
            color: const Color(0xFF120F21),
            border: Border.all(color: const Color(0xFF262140), width: 2),
            borderRadius: BorderRadius.circular(48),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  obscureText: isSensitive && !isVisible,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                  ),
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    hintText: 'Enter here',
                    hintStyle: TextStyle(color: Color(0xFF867EA5)),
                  ),
                ),
              ),
              if (isSensitive)
                GestureDetector(
                  onTap: onToggle,
                  child: Icon(
                    isVisible ? Icons.visibility : Icons.visibility_off,
                    color: const Color(0xFFB2B2B2),
                    size: 18,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildDocumentUpload(
    String title,
    String subtitle,
    File? file,
    VoidCallback onTap,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            color: Color(0xFFE2E2E2),
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 12),
        GestureDetector(
          onTap: onTap,
          child: Container(
            width: double.infinity,
            height: 184,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF181027), Color(0xFF110F20)],
              ),
              border: Border.all(
                color: const Color(0xFF262140),
                width: 2,
                style: BorderStyle.solid,
              ),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: const Color(0xFF120D1E),
                    border: Border.all(color: const Color(0xFF262140)),
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: const Icon(
                    Icons.upload_file,
                    color: Color(0xFFE2E2E2),
                    size: 32,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  file == null ? 'Click to $title' : 'Document Uploaded',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFFE2E2E2),
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  subtitle,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFF867EA5),
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRequirementsCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF130F22),
        border: Border.all(color: const Color(0xFF302A4E)),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 30,
            offset: const Offset(4, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF999840),
              borderRadius: BorderRadius.circular(48),
            ),
            child: const Text(
              'Requirements',
              style: TextStyle(
                color: Color(0xFFE2E2E2),
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(height: 24),
          _buildRequirementItem('JPEG, PNG, or PDF formats'),
          const SizedBox(height: 10),
          _buildRequirementItem('Clear and readable documents'),
          const SizedBox(height: 10),
          _buildRequirementItem('Government-issued ID'),
          const SizedBox(height: 10),
          _buildRequirementItem('Max 5MB per file'),
        ],
      ),
    );
  }

  Widget _buildRequirementItem(String text) {
    return Text(
      text,
      style: const TextStyle(
        color: Color(0xFFE2E2E2),
        fontSize: 14,
        fontWeight: FontWeight.w500,
      ),
    );
  }

  Widget _buildReviewRow(String label, String value,
      {bool isLink = false, bool isLast = false}) {
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(
                bottom: BorderSide(color: Color(0xFF262140)),
              ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF867EA5),
              fontSize: 16,
              fontWeight: FontWeight.w400,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: isLink ? const Color(0xFF8024DE) : const Color(0xFFE2E2E2),
              fontSize: 16,
              fontWeight: FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton(
      BuildContext context, KycVerificationViewModel viewModel) {
    return GestureDetector(
      onTap: () => viewModel.isBusy ? null : viewModel.handleButtonPress(),
      child: Container(
        width: double.infinity,
        height: 60,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFF674AA6), // top color
              Color(0xFF2E235C), // bottom color
            ],
          ),
          borderRadius: BorderRadius.circular(48),
        ),
        child: Center(
          child: viewModel.isBusy
              ? const SizedBox(
                  height: 24,
                  width: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : Center(
                  child: Text(
                    viewModel.buttonText,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
        ),
      ),
    );
  }

  void _pickDocument(
      BuildContext context, KycVerificationViewModel model, bool isId) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content:
            Text(isId ? 'ID Document selected' : 'Proof of Address selected'),
        backgroundColor: const Color(0xFF00D084),
      ),
    );
  }

  @override
  KycVerificationViewModel viewModelBuilder(
    BuildContext context,
  ) =>
      KycVerificationViewModel();
}
