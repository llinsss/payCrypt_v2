import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:Tagg/app/app.bottomsheets.dart';
import 'package:Tagg/app/app.dialogs.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/services/api_service.dart';
import 'package:Tagg/services/push_notification_service.dart';
import 'package:stacked_services/stacked_services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  await setupLocator();
  setupDialogUi();
  setupBottomSheetUi();

  final pushService = locator<PushNotificationService>();
  final apiService = locator<ApiService>();
  await apiService.initializeToken();
  if (apiService.isAuthenticated) {
    await pushService.initialize(apiService: apiService);
  }

  runApp(const MainApp());
}

class MainApp extends StatelessWidget {
  const MainApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      initialRoute: Routes.startupView,
      onGenerateRoute: StackedRouter().onGenerateRoute,
      navigatorKey: StackedService.navigatorKey,
      navigatorObservers: [StackedService.routeObserver],
    );
  }
}
