import 'package:Tagg/ui/bottom_sheets/notice/notice_sheet.dart';
import 'package:Tagg/ui/dialogs/info_alert/info_alert_dialog.dart';
import 'package:Tagg/ui/views/home/home_view.dart';
import 'package:Tagg/ui/views/startup/startup_view.dart';
import 'package:stacked/stacked_annotations.dart';
import 'package:stacked_services/stacked_services.dart';
import 'package:Tagg/ui/views/signin/signin_view.dart';
import 'package:Tagg/ui/views/signup/signup_view.dart';
import 'package:Tagg/ui/views/dashboard/dashboard_view.dart';
import 'package:Tagg/ui/views/balance/balance_view.dart';
import 'package:Tagg/ui/views/swap/swap_view.dart';
import 'package:Tagg/ui/views/deposit/deposit_view.dart';
import 'package:Tagg/ui/views/bottomnav/bottomnav_view.dart';
import 'package:Tagg/ui/views/settings/settings_view.dart';
import 'package:Tagg/ui/bottom_sheets/menu_sheet/menu_sheet_sheet.dart';
import 'package:Tagg/ui/views/withdrawal/withdrawal_view.dart';
import 'package:Tagg/ui/views/bill/bill_view.dart';
import 'package:Tagg/ui/dialogs/token/token_dialog.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/services/auth_service.dart';
import 'package:Tagg/services/user_service.dart';
import 'package:Tagg/services/wallet_service.dart';
import 'package:Tagg/ui/views/multi_currency/multi_currency_view.dart';
import 'package:Tagg/ui/views/profile_details/profile_details_view.dart';
import 'package:Tagg/ui/views/kyc_verification/kyc_verification_view.dart';
import 'package:Tagg/ui/views/change_password/change_password_view.dart';
import 'package:Tagg/ui/views/contact_support/contact_support_view.dart';
import 'package:Tagg/ui/views/notifications/notifications_view.dart';
import 'package:Tagg/services/transaction_service.dart';
import 'package:Tagg/services/chains_service.dart';
// @stacked-import

@StackedApp(
  routes: [
    MaterialRoute(page: HomeView),
    MaterialRoute(page: StartupView),
    MaterialRoute(page: HomeView),
    MaterialRoute(page: SigninView),
    MaterialRoute(page: SignupView),
    MaterialRoute(page: DashboardView),
    MaterialRoute(page: BalanceView),
    MaterialRoute(page: SwapView),
    MaterialRoute(page: DepositView),
    MaterialRoute(page: BottomnavView),
    MaterialRoute(page: SettingsView),
    MaterialRoute(page: SwapView),
    MaterialRoute(page: WithdrawalView),
    MaterialRoute(page: BillView),
    MaterialRoute(page: MultiCurrencyView),
    MaterialRoute(page: ProfileDetailsView),
    MaterialRoute(page: KycVerificationView),
    MaterialRoute(page: ChangePasswordView),
    MaterialRoute(page: ContactSupportView),
    MaterialRoute(page: NotificationsView),
// @stacked-route
  ],
  dependencies: [
    LazySingleton(classType: BottomSheetService),
    LazySingleton(classType: DialogService),
    LazySingleton(classType: NavigationService),
    LazySingleton(classType: SnackbarService),
    LazySingleton(classType: ApiService),
    LazySingleton(classType: AuthService),
    LazySingleton(classType: UserService),
    LazySingleton(classType: WalletService),
    LazySingleton(classType: TransactionService),
    LazySingleton(classType: ChainsService),
// @stacked-service
  ],
  bottomsheets: [
    StackedBottomsheet(classType: NoticeSheet),
    StackedBottomsheet(classType: MenuSheetSheet),
// @stacked-bottom-sheet
  ],
  dialogs: [
    StackedDialog(classType: InfoAlertDialog),
    StackedDialog(classType: TokenDialog),
// @stacked-dialog
  ],
)
class App {}
