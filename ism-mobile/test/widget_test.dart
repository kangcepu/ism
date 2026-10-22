import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:is_mobile/controllers/monitoring_controller.dart';
import 'package:is_mobile/controllers/session_controller.dart';
import 'package:is_mobile/controllers/zerotier_summary_controller.dart';
import 'package:is_mobile/core/api_client.dart';
import 'package:is_mobile/core/app_theme.dart';
import 'package:is_mobile/core/formatters.dart';
import 'package:is_mobile/models/monitor_device.dart';
import 'package:is_mobile/models/zerotier_network.dart';
import 'package:is_mobile/screens/dashboard_screen.dart';
import 'package:is_mobile/screens/login_screen.dart';
import 'package:is_mobile/services/auth_service.dart';
import 'package:is_mobile/services/monitoring_service.dart';
import 'package:is_mobile/services/session_store.dart';
import 'package:is_mobile/services/zerotier_service.dart';

ApiClient fakeApiClient() =>
    ApiClient(client: MockClient((_) async => http.Response('{}', 200)));

class FakeMonitoringService extends MonitoringService {
  FakeMonitoringService() : super(fakeApiClient());

  @override
  Future<MonitoringSnapshot?> fetchSnapshot() async => MonitoringSnapshot(
    devices: List.generate(
      18,
      (index) => MonitorDevice.fromJson({
        'id': index + 1,
        'name': index == 0
            ? '05. SW IT ROOM'
            : '${(index + 1).toString().padLeft(2, '0')}. Switch Test',
        'device_type': 'cisco_switch',
        'host': '200.200.200.${index + 1}',
        'location': 'Test Location',
        'status': 'online',
        'latency_ms': 4,
        'is_stale': false,
        'services': {
          'open_ports': [22, 443],
        },
        'snmp': {'enabled': true},
        'traffic': {'in_bps': 388480000, 'out_bps': 389180000},
        'temperature': {
          'scope': 'chassis',
          'chassis_c': index == 0 ? 76 : 30 + index,
          'alert_active': index == 0,
        },
      }),
    ),
    summary: const MonitoringSummary(
      total: 18,
      online: 18,
      temperatureAlerts: 1,
      trafficInBps: 388480000,
      trafficOutBps: 389180000,
      vlanTraffic: [
        VlanTrafficMetric(
          id: 1,
          label: 'VLAN 1',
          name: 'PC',
          inBps: 12000000,
          outBps: 8000000,
          interfaceCount: 12,
          available: true,
        ),
        VlanTrafficMetric(
          id: 40,
          label: 'VLAN 40',
          name: 'Management Switch',
          inBps: 1200000,
          outBps: 900000,
          interfaceCount: 4,
          available: true,
        ),
        VlanTrafficMetric(
          id: 50,
          label: 'VLAN 50',
          name: 'Guest WiFi',
          inBps: 22000000,
          outBps: 31000000,
          interfaceCount: 3,
          available: true,
          estimated: true,
        ),
        VlanTrafficMetric(
          id: 70,
          label: 'VLAN 70',
          name: 'CCTV',
          inBps: 18000000,
          outBps: 2000000,
          interfaceCount: 18,
          available: true,
        ),
      ],
    ),
  );
}

class FakeZeroTierService extends ZeroTierService {
  FakeZeroTierService() : super(fakeApiClient());

  @override
  Future<List<ZeroTierNetwork>> fetchNetworks() async => const [];
}

SessionController buildSession() {
  final client = fakeApiClient();
  return SessionController(
    client: client,
    authService: AuthService(client),
    store: const SessionStore(),
  )..status = SessionStatus.unauthenticated;
}

void main() {
  test('format monitoring metrics consistently', () {
    expect(formatBits(1500000000), '1.50 Gbps');
    expect(formatBits(12500000), '12.50 Mbps');
    expect(formatTemperature(76), '76.0°C');
    expect(formatLatency(4.4), '4 ms');
  });

  test('monitor device maps chassis temperature separately', () {
    final device = MonitorDevice.fromJson({
      'id': 1,
      'name': 'Switch Test',
      'host': '192.0.2.1',
      'device_type': 'cisco_switch',
      'status': 'online',
      'is_stale': false,
      'snmp': {'enabled': true},
      'services': {'open_ports': []},
      'traffic': {},
      'temperature': {'scope': 'chassis', 'chassis_c': 31},
    });
    expect(device.chassisTemperature, 31);
    expect(device.name, 'Switch Test');
    expect(device.needsAttention, isFalse);

    final hotDevice = MonitorDevice.fromJson({
      'id': 2,
      'name': 'Hot Switch',
      'host': '192.0.2.2',
      'device_type': 'cisco_switch',
      'status': 'online',
      'is_stale': false,
      'snmp': {'enabled': true},
      'services': {'open_ports': <int>[]},
      'traffic': <String, dynamic>{},
      'temperature': {'scope': 'chassis', 'chassis_c': 76},
    });
    expect(hotDevice.needsAttention, isTrue);
  });

  testWidgets('login page follows IS Dept identity on compact device', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 760);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: LoginScreen(session: buildSession()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('IS Dept'), findsOneWidget);
    expect(find.text('Masuk ke IS Dept'), findsOneWidget);
    expect(find.byType(TextFormField), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'dashboard renders realtime summary and chassis alert without overflow',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final service = FakeMonitoringService();
      final controller = MonitoringController(service);
      final zeroTier = ZeroTierSummaryController(FakeZeroTierService());
      await controller.refresh();
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: DashboardScreen(
            controller: controller,
            zeroTier: zeroTier,
            service: service,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 700));

      expect(find.text('Pusat Operasional'), findsOneWidget);
      expect(find.text('05. SW IT ROOM'), findsOneWidget);
      expect(find.text('76.0°C'), findsOneWidget);
      expect(find.text('REALTIME'), findsOneWidget);
      expect(find.byType(FadeTransition), findsWidgets);
      expect(find.byType(SlideTransition), findsWidgets);
      expect(find.text('18 switch'), findsOneWidget);
      expect(find.text('Traffic VLAN & ZeroTier'), findsOneWidget);
      expect(find.text('VLAN50'), findsOneWidget);
      expect(find.byType(Scrollable), findsNothing);
      expect(tester.takeException(), isNull);
      controller.dispose();
      zeroTier.dispose();
    },
  );

  testWidgets('dense dashboard fits 18 switches on compact screen', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final service = FakeMonitoringService();
    final controller = MonitoringController(service);
    final zeroTier = ZeroTierSummaryController(FakeZeroTierService());
    await controller.refresh();
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: DashboardScreen(
          controller: controller,
          zeroTier: zeroTier,
          service: service,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 700));

    expect(find.text('Pusat Operasional'), findsOneWidget);
    expect(find.text('18 switch'), findsOneWidget);
    expect(find.byType(Scrollable), findsNothing);
    expect(tester.takeException(), isNull);
    controller.dispose();
    zeroTier.dispose();
  });
}
