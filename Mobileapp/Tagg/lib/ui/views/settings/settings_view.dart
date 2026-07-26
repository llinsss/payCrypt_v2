import 'package:Tagg/ui/common/app_assets.dart';
import 'package:Tagg/services/theme_service.dart';
import 'package:flutter/material.dart' hide ThemeMode;
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'settings_viewmodel.dart';

class SettingsView extends StackedView<SettingsViewModel> {
  const SettingsView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    SettingsViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
      backgroundColor: const Color(0xFF090715),
      body: SafeArea(
        child: Column(
          children: [
            // Navigation Bar
            _buildTopNavigation(viewModel),

            // Content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 24),
                    _buildSettingsList(viewModel),

                    const SizedBox(height: 40),

                    // Logout Button
                    _buildLogoutButton(viewModel),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopNavigation(SettingsViewModel viewModel) {
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

  Widget _buildSettingItem({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback? onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [Color(0xFF181027), Color(0xFF110F20)],
          ),
          border: Border.all(color: const Color(0xFF262140)),
          borderRadius: BorderRadius.circular(4),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0xFF120D1E),
                border: Border.all(color: const Color(0xFF262140)),
                borderRadius: BorderRadius.circular(100),
              ),
              child: Icon(
                icon,
                size: 18,
                color: const Color(0xFFE2E2E2),
              ),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w500,
                    fontSize: 16,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontWeight: FontWeight.w400,
                    fontSize: 14,
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

  Widget _buildBiometricToggle({
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [Color(0xFF181027), Color(0xFF110F20)],
        ),
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(4),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w500,
                    fontSize: 16,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontWeight: FontWeight.w400,
                    fontSize: 14,
                    color: Color(0xFF867EA5),
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeColor: const Color(0xFF9D55FF),
          ),
        ],
      ),
    );
  }

  Widget _buildSettingsList(SettingsViewModel viewModel) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Settings',
          style: TextStyle(
            fontWeight: FontWeight.w500,
            fontSize: 18,
            color: Color(0xFFE2E2E2),
          ),
        ),
        const SizedBox(height: 24),
        _buildSettingItem(
            icon: Icons.person_outline,
            title: 'Profile Details',
            subtitle: 'View profile information',
            onTap: () => viewModel.onprofileTap()),
        const SizedBox(height: 12),
        _buildSettingItem(
            icon: Icons.badge_outlined,
            title: 'KYC Verification',
            subtitle: 'Verify your identity',
            onTap: () => viewModel.onKycTap()),
        const SizedBox(height: 12),
        _buildSettingItem(
          icon: Icons.lock_outline,
          title: 'Change Password',
          subtitle: 'Update your login password',
          onTap: () => viewModel.onchangePasswordTap(),
        ),
        const SizedBox(height: 12),
        _buildBiometricToggle(
          title: 'Biometric Unlock',
          subtitle: 'Use Face ID or fingerprint to unlock',
          value: viewModel.isBiometricEnabled,
          onChanged: (value) => viewModel.toggleBiometricUnlock(value),
        ),
        const SizedBox(height: 12),
        _buildSettingItem(
          icon: Icons.headset_mic_outlined,
          title: 'Contact Support',
          subtitle: 'Reach us via email',
          onTap: () {},
        ),
        const SizedBox(height: 12),
        _buildAppearanceSelector(viewModel),
        const SizedBox(height: 12),
        _buildSettingItem(
          icon: Icons.notifications_outlined,
          title: 'Notifications',
          subtitle: 'Manage push notifications',
          onTap: () => viewModel.onNotificationTap(),
        ),
      ],
    );
  }

  Widget _buildAppearanceSelector(SettingsViewModel viewModel) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [Color(0xFF181027), Color(0xFF110F20)],
        ),
        border: Border.all(color: const Color(0xFF262140)),
        borderRadius: BorderRadius.circular(4),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: const Color(0xFF120D1E),
                  border: Border.all(color: const Color(0xFF262140)),
                  borderRadius: BorderRadius.circular(100),
                ),
                child: const Icon(
                  Icons.brightness_4_outlined,
                  size: 18,
                  color: Color(0xFFE2E2E2),
                ),
              ),
              const SizedBox(width: 12),
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Appearance',
                    style: TextStyle(
                      fontWeight: FontWeight.w500,
                      fontSize: 16,
                      color: Colors.white,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Light / Dark / System',
                    style: TextStyle(
                      fontWeight: FontWeight.w400,
                      fontSize: 14,
                      color: Color(0xFF867EA5),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _buildThemeModeButton(
                label: 'Light',
                isSelected: viewModel.currentTheme == ThemeMode.light,
                onTap: () => viewModel.setThemeMode(ThemeMode.light),
              ),
              _buildThemeModeButton(
                label: 'Dark',
                isSelected: viewModel.currentTheme == ThemeMode.dark,
                onTap: () => viewModel.setThemeMode(ThemeMode.dark),
              ),
              _buildThemeModeButton(
                label: 'System',
                isSelected: viewModel.currentTheme == ThemeMode.system,
                onTap: () => viewModel.setThemeMode(ThemeMode.system),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildThemeModeButton({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF674AA6) : const Color(0xFF120D1E),
          border: Border.all(
            color: isSelected ? const Color(0xFF674AA6) : const Color(0xFF262140),
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: isSelected ? Colors.white : const Color(0xFF867EA5),
          ),
        ),
      ),
    );
  }

  Widget _buildLogoutButton(SettingsViewModel viewModel) {
    return GestureDetector(
      onTap: viewModel.logout,
      child: Container(
        width: double.infinity,
        height: 56,
        decoration: BoxDecoration(
          color: const Color(0xFFFC7171),
          borderRadius: BorderRadius.circular(48),
        ),
        child: const Center(
          child: Text(
            'Log Out',
            style: TextStyle(
              fontWeight: FontWeight.w400,
              fontSize: 16,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }

  @override
  SettingsViewModel viewModelBuilder(
    BuildContext context,
  ) =>
      SettingsViewModel();
}
