import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/app_config.dart';
import '../models/monitor_device.dart';
import '../services/monitoring_service.dart';

class MonitoringController extends ChangeNotifier {
  MonitoringController(this.service);
  final MonitoringService service;

  List<MonitorDevice> devices = const [];
  MonitoringSummary summary = const MonitoringSummary();
  DateTime? lastSync;
  bool isInitialLoading = true;
  bool isRefreshing = false;
  String? error;
  Timer? _timer;
  bool _disposed = false;

  void start() {
    _timer?.cancel();
    refresh();
    _timer = Timer.periodic(
      AppConfig.pollingInterval,
      (_) => refresh(silent: true),
    );
  }

  void pause() => _timer?.cancel();

  void resume() {
    if (_disposed) return;
    start();
  }

  Future<void> refresh({bool silent = false}) async {
    if (isRefreshing || _disposed) return;
    isRefreshing = true;
    if (!silent) notifyListeners();
    try {
      final snapshot = await service.fetchSnapshot();
      if (snapshot != null) {
        devices = snapshot.devices;
        summary = snapshot.summary;
      }
      lastSync = DateTime.now();
      error = null;
    } on ApiException catch (exception) {
      error = exception.message;
    } finally {
      isRefreshing = false;
      isInitialLoading = false;
      if (!_disposed) notifyListeners();
    }
  }

  List<MonitorDevice> filtered({String query = '', String status = 'all'}) {
    final normalizedQuery = query.trim().toLowerCase();
    return devices.where((device) {
      final matchesQuery =
          normalizedQuery.isEmpty ||
          '${device.name} ${device.host} ${device.location ?? ''}'
              .toLowerCase()
              .contains(normalizedQuery);
      final matchesStatus =
          status == 'all' ||
          device.status == status ||
          (status == 'attention' && device.needsAttention);
      return matchesQuery && matchesStatus;
    }).toList();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}
