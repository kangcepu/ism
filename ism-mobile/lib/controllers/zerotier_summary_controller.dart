import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/app_config.dart';
import '../models/zerotier_network.dart';
import '../services/zerotier_service.dart';

/// Lightweight aggregate of all ZeroTier networks for the dashboard traffic
/// strip. The ZeroTier Central API only exposes member/online counts, not
/// bandwidth, so this tracks connection status rather than bps.
class ZeroTierSummaryController extends ChangeNotifier {
  ZeroTierSummaryController(this.service);
  final ZeroTierService service;

  List<ZeroTierNetwork> networks = const [];
  bool isLoading = true;
  String? error;
  Timer? _timer;
  bool isRefreshing = false;
  bool _disposed = false;

  int get networkCount => networks.length;
  bool get anyReachable => networks.any((network) => network.summary.reachable);
  int get onlineCount => networks.fold(
    0,
    (sum, network) => sum + (network.summary.onlineCount ?? 0),
  );
  int get memberCount => networks.fold(
    0,
    (sum, network) => sum + (network.summary.memberCount ?? 0),
  );
  int get authorizedCount => networks.fold(
    0,
    (sum, network) => sum + (network.summary.authorizedCount ?? 0),
  );

  void start() {
    _timer?.cancel();
    refresh();
    _timer = Timer.periodic(
      AppConfig.pollingInterval * 2,
      (_) => refresh(silent: true),
    );
  }

  void pause() => _timer?.cancel();

  void resume() {
    if (_disposed) return;
    start();
  }

  Future<void> refresh({bool silent = false}) async {
    if (_disposed || isRefreshing) return;
    isRefreshing = true;
    if (!silent) notifyListeners();
    try {
      final updatedNetworks = await service.fetchNetworksIfChanged();
      if (updatedNetworks != null) networks = updatedNetworks;
      error = null;
    } on ApiException catch (exception) {
      error = exception.message;
    } finally {
      isRefreshing = false;
      isLoading = false;
      if (!_disposed) notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}
