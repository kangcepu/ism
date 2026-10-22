import 'dart:io';

import 'package:is_mobile/core/api_client.dart';
import 'package:is_mobile/services/auth_service.dart';
import 'package:is_mobile/services/monitoring_service.dart';

Future<void> main() async {
  final username = Platform.environment['MONITORING_USERNAME'];
  final password = Platform.environment['MONITORING_PASSWORD'];
  if (username == null || password == null) {
    stderr.writeln('MONITORING_USERNAME dan MONITORING_PASSWORD wajib diisi.');
    exitCode = 2;
    return;
  }

  final client = ApiClient();
  final auth = AuthService(client);
  final monitoring = MonitoringService(client);
  final stopwatch = Stopwatch()..start();

  try {
    final login = await auth.login(username, password);
    final loginMs = stopwatch.elapsedMilliseconds;
    stopwatch.reset();

    final snapshot = await monitoring.fetchSnapshot();
    final listMs = stopwatch.elapsedMilliseconds;
    if (snapshot == null || snapshot.devices.isEmpty) {
      throw StateError('Snapshot monitoring kosong.');
    }
    if (snapshot.devices.any(
      (device) => device.name.isEmpty || device.id < 1,
    )) {
      throw StateError('Mapping perangkat tidak valid.');
    }
    final vlanIds = snapshot.summary.vlanTraffic
        .map((metric) => metric.id)
        .toSet();
    if (!vlanIds.containsAll(const {1, 40, 50, 70})) {
      throw StateError('Ringkasan traffic VLAN tidak lengkap: $vlanIds');
    }

    final detailTarget = snapshot.devices.cast().firstWhere(
      (device) => device.host == '200.200.200.25',
      orElse: () => snapshot.devices.first,
    );

    stopwatch.reset();
    final detail = await monitoring.fetchDeviceDetail(detailTarget.id);
    final detailMs = stopwatch.elapsedMilliseconds;
    if (detail.device.id != detailTarget.id) {
      throw StateError('Detail perangkat tidak konsisten.');
    }
    await auth.logout();
    stdout.writeln({
      'success': true,
      'user': login.user.username,
      'devices': snapshot.devices.length,
      'detailDevice': detail.device.name,
      'ports': detail.ports.length,
      'sensors': detail.sensors.length,
      'chassisTemperature': detail.device.chassisTemperature,
      'vlanTraffic': snapshot.summary.vlanTraffic
          .map(
            (metric) => {
              'id': metric.id,
              'inBps': metric.inBps,
              'outBps': metric.outBps,
              'interfaces': metric.interfaceCount,
              'estimated': metric.estimated,
            },
          )
          .toList(),
      'timingMs': {'login': loginMs, 'list': listMs, 'detailBundle': detailMs},
    });
  } finally {
    client.close();
  }
}
