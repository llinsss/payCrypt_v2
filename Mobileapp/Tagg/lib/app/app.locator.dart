// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// StackedLocatorGenerator
// **************************************************************************

// ignore_for_file: public_member_api_docs, implementation_imports, depend_on_referenced_packages, unused_import
import 'package:stacked_services/src/bottom_sheet/bottom_sheet_service.dart';
import 'package:stacked_services/src/dialog/dialog_service.dart';
import 'package:stacked_services/src/navigation/navigation_service.dart';
import 'package:stacked_services/src/snackbar/snackbar_service.dart';
import 'package:stacked_shared/stacked_shared.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/chains_service.dart';
import '../services/notification_service.dart';
import '../services/push_notification_service.dart';
import '../services/support_ticket_service.dart';
import '../services/transaction_service.dart';
import '../services/connectivity_service.dart';
import '../services/user_service.dart';
import '../services/wallet_service.dart';
import '../services/theme_service.dart';
import '../services/swap_service.dart';
import '../services/exchange_rate_service.dart';
import '../services/batch_payment_service.dart';
import '../services/biometric_service.dart';
import '../services/deep_link_service.dart';
import '../services/scheduled_payment_service.dart';
import '../services/websocket_service.dart';
import '../services/language_service.dart';

final locator = StackedLocator.instance;

Future<void> setupLocator({
  String? environment,
  EnvironmentFilter? environmentFilter,
}) async {
// Register environments
  locator.registerEnvironment(
      environment: environment, environmentFilter: environmentFilter);

// Register dependencies
  locator.registerLazySingleton(() => BottomSheetService());
  locator.registerLazySingleton(() => DialogService());
  locator.registerLazySingleton(() => NavigationService());
  locator.registerLazySingleton(() => SnackbarService());
  locator.registerLazySingleton(() => ApiService());
  locator.registerLazySingleton(() => AuthService());
  locator.registerLazySingleton(() => UserService());
  locator.registerLazySingleton(() => WalletService());
  locator.registerLazySingleton(() => TransactionService());
  locator.registerLazySingleton(() => ChainsService());
  locator.registerLazySingleton(() => ConnectivityService());
  locator.registerLazySingleton(() => ThemeService());
  locator.registerLazySingleton(() => SwapService());
  locator.registerLazySingleton(() => ExchangeRateService());
  locator.registerLazySingleton(() => BatchPaymentService());
  locator.registerLazySingleton(() => BiometricService());
  locator.registerLazySingleton(() => DeepLinkService());
  locator.registerLazySingleton(() => NotificationService());
  locator.registerLazySingleton(() => PushNotificationService());
  locator.registerLazySingleton(() => ScheduledPaymentService());
  locator.registerLazySingleton(() => WebSocketService());
  locator.registerLazySingleton(() => LanguageService());
}