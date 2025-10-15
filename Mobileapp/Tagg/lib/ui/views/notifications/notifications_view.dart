import 'package:Tagg/ui/common/app_assets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:stacked/stacked.dart';

import 'notifications_viewmodel.dart';

class NotificationsView extends StackedView<NotificationsViewModel> {
  const NotificationsView({Key? key}) : super(key: key);

  @override
  Widget builder(
    BuildContext context,
    NotificationsViewModel viewModel,
    Widget? child,
  ) {
    return Scaffold(
        backgroundColor: const Color(0xFF090715),
        body: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildTopNavigation(viewModel),
              const SizedBox(height: 24),
              _buildHeader(viewModel),
              const SizedBox(height: 24),
              _buildNotificationsList(viewModel),
            ],
          ),
        ));
  }

  Widget _buildTopNavigation(NotificationsViewModel viewModel) {
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

  Widget _buildHeader(NotificationsViewModel viewModel) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: viewModel.navigateBack,
            child: GestureDetector(
              onTap: () => viewModel.navigateBack(),
              child: const Icon(
                Icons.arrow_back,
                color: Color(0xFFE2E2E2),
                size: 24,
              ),
            ),
          ),
          const SizedBox(height: 28),
          Text(
            'Notifications',
            style: GoogleFonts.instrumentSans(
              fontWeight: FontWeight.w500,
              fontSize: 18,
              height: 1.22,
              color: Colors.white,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'Manage push notification from Tagged',
            style: GoogleFonts.instrumentSans(
              fontWeight: FontWeight.w400,
              fontSize: 14,
              height: 1.21,
              color: Color(0xFF867EA5),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationsList(NotificationsViewModel viewModel) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          _buildNotificationItem(
            title: 'Transaction Notifications',
            description: 'Get notified about deposits and withdrawals',
            isEnabled: viewModel.transactionNotifications,
            onToggle: viewModel.toggleTransactionNotifications,
          ),
          Divider(color: Color(0xFF2E235C), thickness: 0.4),
          _buildNotificationItem(
            title: 'Security Alerts',
            description: 'Important security-related notifications',
            isEnabled: viewModel.securityAlerts,
            onToggle: viewModel.toggleSecurityAlerts,
          ),
          Divider(color: Color(0xFF2E235C), thickness: 0.4),
          _buildNotificationItem(
            title: 'Price Alerts',
            description: 'Crypto price movement notifications',
            isEnabled: viewModel.priceAlerts,
            onToggle: viewModel.togglePriceAlerts,
          ),
          Divider(color: Color(0xFF2E235C), thickness: 0.4),
          _buildNotificationItem(
            title: 'Marketing Updates',
            description: 'Product updates and promotional offers',
            isEnabled: viewModel.marketingUpdates,
            onToggle: viewModel.toggleMarketingUpdates,
          ),
          Divider(color: Color(0xFF2E235C), thickness: 0.4),
          _buildNotificationItem(
            title: 'Weekly Reports',
            description: 'Weekly portfolio performance summary',
            isEnabled: viewModel.weeklyReports,
            onToggle: viewModel.toggleWeeklyReports,
          ),
          Divider(color: Color(0xFF2E235C), thickness: 0.4),
        ],
      ),
    );
  }

  Widget _buildNotificationItem({
    required String title,
    required String description,
    required bool isEnabled,
    required VoidCallback onToggle,
  }) {
    return Container(
      constraints: BoxConstraints(minHeight: 61),
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: GoogleFonts.instrumentSans(
                    fontWeight: FontWeight.w400,
                    fontSize: 14,
                    height: 1.21,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: GoogleFonts.manrope(
                    fontWeight: FontWeight.w400,
                    fontSize: 14,
                    height: 1.14,
                    color: Color(0xFF867EA5),
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          GestureDetector(
            onTap: onToggle,
            child: _buildToggle(isEnabled),
          ),
        ],
      ),
    );
  }

  Widget _buildToggle(bool isEnabled) {
    return Container(
      width: 40,
      height: 22,
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF181027), Color(0xFF110F20)],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(1000),
      ),
      child: Align(
        alignment: isEnabled ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          width: 18,
          height: 18,
          decoration: BoxDecoration(
            color:
                isEnabled ? const Color(0xFF00D084) : const Color(0xFFE2E2E2),
            shape: BoxShape.circle,
          ),
        ),
      ),
    );
  }

  @override
  NotificationsViewModel viewModelBuilder(
    BuildContext context,
  ) =>
      NotificationsViewModel();
}
