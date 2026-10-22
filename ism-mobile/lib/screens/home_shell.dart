import 'package:flutter/material.dart';

import '../controllers/monitoring_controller.dart';
import '../controllers/session_controller.dart';
import '../controllers/zerotier_summary_controller.dart';
import '../core/app_config.dart';
import '../models/app_update.dart';
import '../services/app_update_service.dart';
import '../services/ai_assistant_service.dart';
import '../services/app_update_installer.dart';
import '../services/adds_service.dart';
import '../services/assets_service.dart';
import '../services/floor_maps_service.dart';
import '../services/ga_service.dart';
import '../services/monitoring_service.dart';
import '../services/zerotier_service.dart';
import 'account_screen.dart';
import 'ai_assistant_screen.dart';
import 'adds_screen.dart';
import 'assets_screen.dart';
import 'dashboard_screen.dart';
import 'data_module_screen.dart';
import 'floor_maps_screen.dart';
import 'ga_operations_screen.dart';
import 'ga_outdoor_report_screen.dart';
import 'ga_dashboard_screen.dart';
import 'devices_screen.dart';
import 'modules_screen.dart';
import 'zerotier_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({
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
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  bool _hasCheckedForUpdate = false;
  int _selectedIndex = 0;
  late final MonitoringController monitoring = MonitoringController(
    widget.monitoringService,
  );
  late final ZeroTierSummaryController zeroTierSummary =
      ZeroTierSummaryController(widget.zeroTierService);
  late final AddsService addsService = AddsService(widget.session.client);

  bool get _isGaUser => widget.session.user?.isGaUser == true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (!_isGaUser) {
      monitoring.start();
      zeroTierSummary.start();
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkForUpdate());
  }

  Future<void> _checkForUpdate() async {
    if (_hasCheckedForUpdate) return;
    _hasCheckedForUpdate = true;
    try {
      final update = await widget.appUpdateService.check();
      if (!mounted || update == null) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: !update.forceUpdate,
        builder: (context) => _UpdateDialog(update: update),
      );
    } catch (_) {
      // Update availability must not block monitoring when the release API is unavailable.
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_selectedIndex == 0 && !_isGaUser) {
        monitoring.resume();
        zeroTierSummary.resume();
      }
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      monitoring.pause();
      zeroTierSummary.pause();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    monitoring.dispose();
    zeroTierSummary.dispose();
    super.dispose();
  }

  void _openDataModule(String title, String endpoint) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DataModuleScreen(
          title: title,
          endpoint: endpoint,
          client: widget.session.client,
        ),
      ),
    );
  }

  void _selectDestination(int index) {
    if (index == _selectedIndex) return;
    setState(() => _selectedIndex = index);
    if (index == 0 && !_isGaUser) {
      monitoring.resume();
      zeroTierSummary.resume();
    } else {
      monitoring.pause();
      zeroTierSummary.pause();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: IndexedStack(
      index: _selectedIndex,
      children: [
        if (_isGaUser)
          GaDashboardScreen(
            service: GaService(widget.session.client),
            onOpenWork: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => GaOperationsScreen(
                  service: GaService(widget.session.client),
                ),
              ),
            ),
            onCreateOutdoor: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => GaOutdoorReportScreen(
                  service: GaService(widget.session.client),
                ),
              ),
            ),
          )
        else
          DashboardScreen(
            controller: monitoring,
            zeroTier: zeroTierSummary,
            service: widget.monitoringService,
            isAdmin: widget.session.user?.isAdmin == true,
            onZeroTierTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ZeroTierScreen(
                  service: widget.zeroTierService,
                  isAdmin: widget.session.user?.isAdmin == true,
                ),
              ),
            ),
          ),
        ModulesScreen(
          onAssetsTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => AssetsScreen(
                service: widget.assetsService,
                isAdmin: widget.session.user?.isAdmin == true,
              ),
            ),
          ),
          onDevicesTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => DevicesScreen(
                controller: monitoring,
                service: widget.monitoringService,
                isAdmin: widget.session.user?.isAdmin == true,
              ),
            ),
          ),
          onFloorMapsTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => FloorMapsScreen(service: widget.floorMapsService),
            ),
          ),
          onZeroTierTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => ZeroTierScreen(
                service: widget.zeroTierService,
                isAdmin: widget.session.user?.isAdmin == true,
              ),
            ),
          ),
          onAddsTap: widget.session.user?.isAdmin == true
              ? () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => AddsScreen(service: addsService),
                  ),
                )
              : null,
          onAiAssistantTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) =>
                  AiAssistantScreen(service: widget.aiAssistantService),
            ),
          ),
          onInventoryTap: () => _openDataModule('Inventory', 'inventory/items'),
          onCctvTap: () => _openDataModule('CCTV', 'cctv/cameras'),
          onMonitoringTap: () =>
              _openDataModule('Monitoring Switch', 'monitors'),
          onFloorMapTap: () =>
              _openDataModule('Denah dan Map', 'mobile/floor-maps'),
          onGaTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) =>
                  GaOperationsScreen(service: GaService(widget.session.client)),
            ),
          ),
        ),
        AccountScreen(session: widget.session),
      ],
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: _selectedIndex,
      onDestinationSelected: _selectDestination,
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.space_dashboard_outlined),
          selectedIcon: Icon(Icons.space_dashboard_rounded),
          label: 'Beranda',
        ),
        NavigationDestination(
          icon: Icon(Icons.grid_view_outlined),
          selectedIcon: Icon(Icons.grid_view_rounded),
          label: 'Modul',
        ),
        NavigationDestination(
          icon: Icon(Icons.person_outline_rounded),
          selectedIcon: Icon(Icons.person_rounded),
          label: 'Akun',
        ),
      ],
    ),
  );
}

class _UpdateDialog extends StatefulWidget {
  const _UpdateDialog({required this.update});
  final AppUpdate update;

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog>
    with WidgetsBindingObserver {
  final _installer = const AppUpdateInstaller();
  bool _isBusy = false;
  bool _waitingForPermission = false;
  bool _installerOpened = false;
  int _receivedBytes = 0;
  int? _totalBytes;
  String? _status;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _waitingForPermission) {
      _continueAfterPermissionScreen();
    }
  }

  Uri get _downloadUrl => Uri.parse(
    '${AppConfig.apiRootUrl}/uploads/mobile-releases/${Uri.encodeComponent(widget.update.fileName)}',
  );

  Future<void> _continueAfterPermissionScreen() async {
    final allowed = await _installer.canRequestPackageInstalls();
    if (!mounted) return;
    _waitingForPermission = false;
    if (allowed) {
      await _downloadAndInstall();
    } else {
      setState(() {
        _status =
            'Izin instalasi belum diaktifkan. Tekan tombol update untuk membuka izin lagi.';
      });
    }
  }

  Future<void> _startUpdate() async {
    final allowed = await _installer.canRequestPackageInstalls();
    if (!mounted) return;
    if (!allowed) {
      setState(() {
        _waitingForPermission = true;
        _status =
            'Aktifkan “Izinkan dari sumber ini” untuk IS Dept, lalu kembali ke aplikasi.';
      });
      try {
        await _installer.requestInstallPermission();
      } catch (_) {
        if (mounted) {
          setState(() {
            _waitingForPermission = false;
            _status = 'Halaman izin instalasi tidak dapat dibuka.';
          });
        }
      }
      return;
    }
    await _downloadAndInstall();
  }

  Future<void> _downloadAndInstall() async {
    if (_isBusy) return;
    setState(() {
      _isBusy = true;
      _installerOpened = false;
      _receivedBytes = 0;
      _totalBytes = null;
      _status = 'Menyiapkan unduhan update...';
    });

    try {
      await _installer.downloadAndOpenInstaller(
        url: _downloadUrl,
        update: widget.update,
        onProgress: (receivedBytes, totalBytes) {
          if (!mounted) return;
          setState(() {
            _receivedBytes = receivedBytes;
            _totalBytes = totalBytes;
            _status = 'Mengunduh update...';
          });
        },
      );
      if (mounted) {
        setState(() {
          _isBusy = false;
          _installerOpened = true;
          _status =
              'Installer Android telah dibuka. Konfirmasikan pemasangan update.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _isBusy = false;
          _status = 'Unduhan atau installer gagal dibuka. Coba lagi.';
        });
      }
    }
  }

  String get _progressLabel {
    if (_totalBytes == null || _totalBytes == 0) {
      return '${(_receivedBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    final percent = ((_receivedBytes / _totalBytes!) * 100).clamp(0, 100);
    return '${percent.toStringAsFixed(0)}%';
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !widget.update.forceUpdate,
    child: AlertDialog(
      title: const Text('Update tersedia'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'IS Dept versi ${widget.update.versionName} tersedia.${widget.update.releaseNotes?.trim().isNotEmpty == true ? '\n\n${widget.update.releaseNotes}' : ''}\n\nUpdate diunduh dari dalam aplikasi, lalu installer Android akan terbuka.',
          ),
          if (_isBusy) ...[
            const SizedBox(height: 18),
            LinearProgressIndicator(
              value: _totalBytes == null || _totalBytes == 0
                  ? null
                  : _receivedBytes / _totalBytes!,
            ),
            const SizedBox(height: 8),
            Text(_progressLabel, style: Theme.of(context).textTheme.bodySmall),
          ],
          if (_status != null) ...[
            const SizedBox(height: 14),
            Text(_status!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
      actions: [
        if (!widget.update.forceUpdate && !_isBusy)
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Nanti'),
          ),
        FilledButton.icon(
          onPressed: _isBusy ? null : _startUpdate,
          icon: Icon(
            _installerOpened
                ? Icons.install_mobile_rounded
                : Icons.download_rounded,
          ),
          label: Text(_installerOpened ? 'Pasang ulang' : 'Update sekarang'),
        ),
      ],
    ),
  );
}
