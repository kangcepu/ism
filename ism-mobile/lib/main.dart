import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'controllers/session_controller.dart';
import 'core/api_client.dart';
import 'core/app_config.dart';
import 'core/app_theme.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'services/auth_service.dart';
import 'services/app_update_service.dart';
import 'services/ai_assistant_service.dart';
import 'services/assets_service.dart';
import 'services/floor_maps_service.dart';
import 'services/monitoring_service.dart';
import 'services/session_store.dart';
import 'services/zerotier_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppColors.navy900,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  final client = ApiClient();
  final session = SessionController(
    client: client,
    authService: AuthService(client),
    store: const SessionStore(),
  );
  await session.initialize();
  runApp(
    InventoryApp(
      session: session,
      monitoringService: MonitoringService(client),
      zeroTierService: ZeroTierService(client),
      assetsService: AssetsService(client),
      floorMapsService: FloorMapsService(client),
      appUpdateService: AppUpdateService(client),
      aiAssistantService: AiAssistantService(client),
    ),
  );
}

class InventoryApp extends StatelessWidget {
  const InventoryApp({
    super.key,
    required this.session,
    required this.monitoringService,
    required this.zeroTierService,
    required this.assetsService,
    required this.floorMapsService,
    required this.appUpdateService,
    required this.aiAssistantService,
  });

  final SessionController session;
  final MonitoringService monitoringService;
  final ZeroTierService zeroTierService;
  final AssetsService assetsService;
  final FloorMapsService floorMapsService;
  final AppUpdateService appUpdateService;
  final AiAssistantService aiAssistantService;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '${AppConfig.appName} • ${AppConfig.appSubtitle}',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      home: ListenableBuilder(
        listenable: session,
        builder: (context, _) => AnimatedSwitcher(
          duration: const Duration(milliseconds: 260),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeInCubic,
          child: switch (session.status) {
            SessionStatus.initializing => const SplashScreen(
              key: ValueKey('splash'),
            ),
            SessionStatus.unauthenticated => LoginScreen(
              key: const ValueKey('login'),
              session: session,
            ),
            SessionStatus.authenticated => HomeShell(
              key: const ValueKey('home'),
              session: session,
              monitoringService: monitoringService,
              zeroTierService: zeroTierService,
              assetsService: assetsService,
              floorMapsService: floorMapsService,
              appUpdateService: appUpdateService,
              aiAssistantService: aiAssistantService,
            ),
          },
        ),
      ),
    );
  }
}
