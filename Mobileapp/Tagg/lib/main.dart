import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:Tagg/app/app.bottomsheets.dart';
import 'package:Tagg/app/app.dialogs.dart';
import 'package:Tagg/app/app.locator.dart';
import 'package:Tagg/app/app.router.dart';
import 'package:Tagg/ui/common/app_theme.dart';
import 'package:Tagg/services/language_service.dart';
import 'package:Tagg/services/theme_service.dart';
import 'package:Tagg/services/websocket_service.dart';
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
  final webSocketService = locator<WebSocketService>();
  await apiService.initializeToken();
  if (apiService.isAuthenticated) {
    await pushService.initialize(apiService: apiService);
    await webSocketService.connect();
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
  late LanguageService _languageService;
  Locale _locale = const Locale('en');

  @override
  void initState() {
    super.initState();
    _themeService = locator<ThemeService>();
    _languageService = locator<LanguageService>();
    _loadLocale();
    WidgetsBinding.instance.addObserver(this);
  }

  Future<void> _loadLocale() async {
    final locale = await _languageService.getSavedLocale();
    setState(() {
      _locale = locale;
    });
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
      title: 'Tagged',
      initialRoute: Routes.startupView,
      onGenerateRoute: StackedRouter().onGenerateRoute,
      navigatorKey: StackedService.navigatorKey,
      navigatorObservers: [StackedService.routeObserver],
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: brightness == Brightness.dark ? ThemeMode.dark : ThemeMode.light,
      locale: _locale,
      supportedLocales: LanguageService.supportedLocales
          .map((code) => Locale(code))
          .toList(),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
    );
  }
}
