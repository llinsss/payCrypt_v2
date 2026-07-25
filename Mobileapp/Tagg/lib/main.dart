import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:Tagg/app/app.bottomsheets.dart';
import 'package:Tagg/app/app.dialogs.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/ui/common/app_theme.dart';
import 'package:Tagg/services/theme_service.dart';
import 'package:stacked_services/stacked_services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  await setupLocator();
  final themeService = locator<ThemeService>();
  await themeService.initialize();
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

class MainApp extends StatefulWidget {
  const MainApp({super.key});

  @override
  State<MainApp> createState() => _MainAppState();
}

class _MainAppState extends State<MainApp> with WidgetsBindingObserver {
  late ThemeService _themeService;

  @override
  void initState() {
    super.initState();
    _themeService = locator<ThemeService>();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangePlatformBrightness() {
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final systemBrightness = MediaQuery.of(context).platformBrightness;
    final brightness = _themeService.getBrightness(systemBrightness);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      initialRoute: Routes.startupView,
      onGenerateRoute: StackedRouter().onGenerateRoute,
      navigatorKey: StackedService.navigatorKey,
      navigatorObservers: [StackedService.routeObserver],
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: brightness == Brightness.dark ? ThemeMode.dark : ThemeMode.light,
    );
  }
}
