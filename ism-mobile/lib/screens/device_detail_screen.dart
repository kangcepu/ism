import 'dart:async';

import 'package:flutter/material.dart';

import '../core/app_config.dart';
import '../core/app_theme.dart';
import '../core/formatters.dart';
import '../models/monitor_device.dart';
import '../models/switch_metrics.dart';
import '../services/monitoring_service.dart';
import '../widgets/status_badge.dart';
import 'device_form_screen.dart';
import 'ssh_login_screen.dart';

class DeviceDetailScreen extends StatefulWidget {
  const DeviceDetailScreen({
    super.key,
    required this.device,
    required this.service,
    this.isAdmin = false,
    this.onChanged,
  });
  final MonitorDevice device;
  final MonitoringService service;
  final bool isAdmin;
  final VoidCallback? onChanged;

  @override
  State<DeviceDetailScreen> createState() => _DeviceDetailScreenState();
}

class _DeviceDetailScreenState extends State<DeviceDetailScreen> {
  DeviceDetailBundle? _bundle;
  String? _error;
  bool _loading = true;
  bool _refreshing = false;
  Timer? _timer;
  Set<String> _justDownPorts = const {};

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(
      AppConfig.pollingInterval,
      (_) => _load(silent: true),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (_refreshing) return;
    _refreshing = true;
    if (!silent && mounted) setState(() {});
    try {
      final value = await widget.service.fetchDeviceDetail(widget.device.id);
      if (mounted) {
        setState(() {
          _justDownPorts = _computeJustDownPorts(_bundle?.ports, value.ports);
          _bundle = value;
          _error = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      _refreshing = false;
      _loading = false;
      if (mounted) setState(() {});
    }
  }

  // Ports carry no "previous status" from the API, so a UP->DOWN flip is
  // only visible by diffing against the last successfully loaded snapshot.
  Set<String> _computeJustDownPorts(
    List<PortMetric>? previous,
    List<PortMetric> current,
  ) {
    if (previous == null || previous.isEmpty) return const {};
    final previousStatus = {
      for (final port in previous) port.label: port.status,
    };
    return current
        .where(
          (port) => previousStatus[port.label] == 'up' && port.status != 'up',
        )
        .map((port) => port.label)
        .toSet();
  }

  Future<void> _edit() async {
    final device = _bundle?.device ?? widget.device;
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            DeviceFormScreen(service: widget.service, device: device),
      ),
    );
    if (changed == true) {
      widget.onChanged?.call();
      _load();
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hapus perangkat?'),
        content: Text(
          '${_bundle?.device.name ?? widget.device.name} akan dihapus dari monitoring.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.red,
              minimumSize: const Size(0, 42),
            ),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await widget.service.deleteDevice(widget.device.id);
    widget.onChanged?.call();
    if (mounted) Navigator.pop(context);
  }

  Future<void> _openSsh(MonitorDevice device) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => SshLoginScreen(device: device)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final device = _bundle?.device ?? widget.device;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          titleSpacing: 0,
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                device.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                device.host,
                style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 10,
                  fontWeight: FontWeight.w400,
                ),
              ),
            ],
          ),
          actions: [
            IconButton(
              onPressed: _refreshing ? null : _load,
              tooltip: 'Refresh',
              icon: AnimatedRotation(
                turns: _refreshing ? 1 : 0,
                duration: const Duration(milliseconds: 500),
                child: const Icon(Icons.refresh_rounded),
              ),
            ),
            if (widget.isAdmin)
              IconButton(
                onPressed: () => _openSsh(device),
                tooltip: 'Remote SSH',
                icon: const Icon(Icons.terminal_rounded),
              ),
            if (widget.isAdmin)
              PopupMenuButton<String>(
                onSelected: (value) => value == 'edit' ? _edit() : _delete(),
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'edit',
                    child: Row(
                      children: [
                        Icon(Icons.edit_outlined, size: 19),
                        SizedBox(width: 10),
                        Text('Edit perangkat'),
                      ],
                    ),
                  ),
                  PopupMenuItem(
                    value: 'delete',
                    child: Row(
                      children: [
                        Icon(
                          Icons.delete_outline_rounded,
                          color: AppColors.red,
                          size: 19,
                        ),
                        SizedBox(width: 10),
                        Text('Hapus', style: TextStyle(color: AppColors.red)),
                      ],
                    ),
                  ),
                ],
              ),
          ],
          bottom: const TabBar(
            indicatorColor: AppColors.cyan,
            labelColor: AppColors.textPrimary,
            unselectedLabelColor: AppColors.textMuted,
            labelStyle: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
            tabs: [
              Tab(text: 'Overview'),
              Tab(text: 'Ports'),
              Tab(text: 'Sensors'),
            ],
          ),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null && _bundle == null
            ? _DetailError(message: _error!, onRetry: _load)
            : TabBarView(
                children: [
                  _OverviewTab(bundle: _bundle!, onRefresh: _load),
                  _PortsTab(
                    ports: _bundle!.ports,
                    justDownLabels: _justDownPorts,
                  ),
                  _SensorsTab(sensors: _bundle!.sensors),
                ],
              ),
      ),
    );
  }
}

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({required this.bundle, required this.onRefresh});
  final DeviceDetailBundle bundle;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final device = bundle.device;
    final summary = bundle.summary;
    final temperature =
        (summary['temperature_c'] as num?)?.toDouble() ??
        device.chassisTemperature;
    final temperatureColor = temperature == null
        ? AppColors.textMuted
        : temperature >= AppConfig.chassisAlertThreshold
        ? AppColors.red
        : temperature >= 45
        ? AppColors.amber
        : AppColors.cyan;
    final httpColor = device.httpCheckHealthy == true
        ? AppColors.green
        : device.httpCheckHealthy == false
        ? AppColors.red
        : AppColors.textMuted;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Row(
            children: [
              Hero(
                tag: 'device-${device.id}',
                child: Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: AppColors.blue.withValues(alpha: .13),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.hub_rounded, color: AppColors.cyan),
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    StatusBadge(status: device.status),
                    const SizedBox(height: 7),
                    Text(
                      device.location ?? 'Tanpa lokasi',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              if (bundle.cacheStale) const _CacheBadge(),
            ],
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(19),
            decoration: BoxDecoration(
              color: temperatureColor.withValues(alpha: .09),
              border: Border.all(
                color: temperatureColor.withValues(alpha: .35),
              ),
              borderRadius: BorderRadius.circular(19),
            ),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: temperatureColor.withValues(alpha: .13),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    Icons.device_thermostat_rounded,
                    color: temperatureColor,
                  ),
                ),
                const SizedBox(width: 14),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'CHASSIS TEMPERATURE',
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          letterSpacing: .8,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Sensor chassis tertinggi',
                        style: TextStyle(fontSize: 11),
                      ),
                    ],
                  ),
                ),
                Text(
                  formatTemperature(temperature),
                  style: TextStyle(
                    color: temperatureColor,
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (device.httpCheckEnabled) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: httpColor.withValues(alpha: .09),
                border: Border.all(color: httpColor.withValues(alpha: .35)),
                borderRadius: BorderRadius.circular(19),
              ),
              child: Row(
                children: [
                  Icon(Icons.language_rounded, color: httpColor),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'WORDPRESS / HTTP HEALTH',
                          style: TextStyle(
                            color: AppColors.textMuted,
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            letterSpacing: .8,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          device.httpCheckUrl ?? 'URL belum diatur',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    device.httpStatusCode?.toString() ?? '-',
                    style: TextStyle(
                      color: httpColor,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          Row(
            children: [
              Expanded(
                child: _DetailMetric(
                  label: 'INBOUND',
                  value: formatBits(
                    (summary['traffic_in_bps_total'] as num?)?.toDouble() ??
                        device.trafficInBps,
                  ),
                  color: AppColors.cyan,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _DetailMetric(
                  label: 'OUTBOUND',
                  value: formatBits(
                    (summary['traffic_out_bps_total'] as num?)?.toDouble() ??
                        device.trafficOutBps,
                  ),
                  color: AppColors.purple,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _DetailMetric(
                  label: 'PORT UP',
                  value:
                      '${(summary['physical_up_ports'] as num?)?.toInt() ?? 0}',
                  color: AppColors.green,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _DetailMetric(
                  label: 'LATENCY',
                  value: formatLatency(device.latencyMs),
                  color: AppColors.blue,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Card(
            child: Column(
              children: [
                _InfoLine(
                  label: 'Device type',
                  value: device.deviceType.replaceAll('_', ' '),
                ),
                const Divider(height: 1),
                _InfoLine(
                  label: 'Open services',
                  value: device.openPorts.isEmpty
                      ? '-'
                      : device.openPorts.join(', '),
                ),
                const Divider(height: 1),
                if (device.httpCheckEnabled) ...[
                  _InfoLine(
                    label: 'HTTP health',
                    value: device.httpMessage ?? 'Menunggu probe',
                  ),
                  const Divider(height: 1),
                ],
                _InfoLine(
                  label: 'Last check',
                  value: relativeTime(device.lastCheckAt),
                ),
                const Divider(height: 1),
                _InfoLine(
                  label: 'SNMP',
                  value: device.snmpEnabled ? 'Enabled' : 'Disabled',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PortsTab extends StatefulWidget {
  const _PortsTab({required this.ports, this.justDownLabels = const {}});
  final List<PortMetric> ports;
  final Set<String> justDownLabels;
  @override
  State<_PortsTab> createState() => _PortsTabState();
}

class _PortsTabState extends State<_PortsTab> {
  String query = '';
  bool activeOnly = false;
  bool justDownOnly = false;

  @override
  Widget build(BuildContext context) {
    final totalCount = widget.ports.length;
    final usedCount = widget.ports.where((port) => port.status == 'up').length;
    final justDownCount = widget.justDownLabels.length;
    final ports = widget.ports.where((port) {
      final matches =
          query.isEmpty ||
          '${port.label} ${port.alias ?? ''}'.toLowerCase().contains(
            query.toLowerCase(),
          );
      final matchesActive = !activeOnly || port.status == 'up';
      final matchesJustDown =
          !justDownOnly || widget.justDownLabels.contains(port.label);
      return matches && matchesActive && matchesJustDown;
    }).toList();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
          child: _PortSummaryBar(
            usedCount: usedCount,
            totalCount: totalCount,
            justDownCount: justDownCount,
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  onChanged: (value) => setState(() => query = value),
                  decoration: const InputDecoration(
                    hintText: 'Cari port atau alias/IP...',
                    prefixIcon: Icon(Icons.search_rounded),
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 9),
              FilterChip(
                label: const Text('UP'),
                selected: activeOnly,
                onSelected: (value) => setState(() => activeOnly = value),
                selectedColor: AppColors.green.withValues(alpha: .18),
                showCheckmark: false,
              ),
              if (justDownCount > 0) ...[
                const SizedBox(width: 7),
                FilterChip(
                  label: Text('TURUN ($justDownCount)'),
                  selected: justDownOnly,
                  onSelected: (value) => setState(() => justDownOnly = value),
                  selectedColor: AppColors.red.withValues(alpha: .18),
                  showCheckmark: false,
                ),
              ],
            ],
          ),
        ),
        Expanded(
          child: ports.isEmpty
              ? const _EmptyState(
                  icon: Icons.settings_ethernet_rounded,
                  title: 'Tidak ada port',
                  subtitle:
                      'Port belum tersedia atau tidak cocok dengan filter.',
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 24),
                  itemCount: ports.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (_, index) => _PortRow(
                    port: ports[index],
                    justWentDown: widget.justDownLabels.contains(
                      ports[index].label,
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}

class _PortSummaryBar extends StatelessWidget {
  const _PortSummaryBar({
    required this.usedCount,
    required this.totalCount,
    required this.justDownCount,
  });
  final int usedCount;
  final int totalCount;
  final int justDownCount;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    decoration: BoxDecoration(
      color: AppColors.navy900,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: AppColors.border),
    ),
    child: Row(
      children: [
        Expanded(
          child: _PortSummaryStat(
            icon: Icons.settings_ethernet_rounded,
            label: 'PORT TERPAKAI',
            value: '$usedCount/$totalCount',
            color: AppColors.green,
          ),
        ),
        Container(
          width: 1,
          height: 30,
          color: AppColors.border,
          margin: const EdgeInsets.symmetric(horizontal: 10),
        ),
        Expanded(
          child: _PortSummaryStat(
            icon: Icons.trending_down_rounded,
            label: 'BARU TURUN',
            value: '$justDownCount',
            color: justDownCount > 0 ? AppColors.red : AppColors.textMuted,
          ),
        ),
      ],
    ),
  );
}

class _PortSummaryStat extends StatelessWidget {
  const _PortSummaryStat({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: color.withValues(alpha: .13),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, size: 16, color: color),
      ),
      const SizedBox(width: 9),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.textMuted,
                fontSize: 8.5,
                fontWeight: FontWeight.w800,
                letterSpacing: .5,
              ),
            ),
            Text(
              value,
              style: TextStyle(
                color: color,
                fontSize: 15,
                fontWeight: FontWeight.w900,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

class _SensorsTab extends StatelessWidget {
  const _SensorsTab({required this.sensors});
  final List<SensorMetric> sensors;
  @override
  Widget build(BuildContext context) => sensors.isEmpty
      ? const _EmptyState(
          icon: Icons.device_thermostat_outlined,
          title: 'Sensor belum tersedia',
          subtitle:
              'Switch tidak mengekspos sensor atau cache SNMP belum dibuat.',
        )
      : ListView.separated(
          padding: const EdgeInsets.all(14),
          itemCount: sensors.length,
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (_, index) => _SensorRow(sensor: sensors[index]),
        );
}

class _DetailMetric extends StatelessWidget {
  const _DetailMetric({
    required this.label,
    required this.value,
    required this.color,
  });
  final String label;
  final String value;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: AppColors.navy900,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: AppColors.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 9,
            fontWeight: FontWeight.w800,
            letterSpacing: .8,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
        ),
      ],
    ),
  );
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
        ),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

class _PortRow extends StatelessWidget {
  const _PortRow({required this.port, this.justWentDown = false});
  final PortMetric port;
  final bool justWentDown;
  @override
  Widget build(BuildContext context) {
    final up = port.status == 'up';
    final accent = justWentDown
        ? AppColors.red
        : up
        ? AppColors.green
        : AppColors.textMuted;
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
          color: justWentDown
              ? AppColors.red.withValues(alpha: .5)
              : AppColors.border,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(13),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: .1),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(
                    Icons.settings_ethernet_rounded,
                    color: accent,
                    size: 19,
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        port.label,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                        ),
                      ),
                      if (port.alias?.isNotEmpty == true) ...[
                        const SizedBox(height: 3),
                        Text(
                          port.alias!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textMuted,
                            fontSize: 9,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (justWentDown)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.red.withValues(alpha: .16),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          'BARU TURUN',
                          style: TextStyle(
                            color: AppColors.red,
                            fontSize: 7.5,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      )
                    else
                      Text(
                        up ? 'UP' : port.status.toUpperCase(),
                        style: TextStyle(
                          color: accent,
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _PortTrafficStat(
                    icon: Icons.south_east_rounded,
                    label: 'IN',
                    value: formatBits(port.inBps),
                    color: AppColors.cyan,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _PortTrafficStat(
                    icon: Icons.north_east_rounded,
                    label: 'OUT',
                    value: formatBits(port.outBps),
                    color: AppColors.purple,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PortTrafficStat extends StatelessWidget {
  const _PortTrafficStat({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
    decoration: BoxDecoration(
      color: AppColors.navy950.withValues(alpha: .6),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Row(
      children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 5),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 8.5,
            fontWeight: FontWeight.w800,
          ),
        ),
        const Spacer(),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800),
        ),
      ],
    ),
  );
}

class _SensorRow extends StatelessWidget {
  const _SensorRow({required this.sensor});
  final SensorMetric sensor;
  @override
  Widget build(BuildContext context) {
    final alert = sensor.status == 'alert';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: (alert ? AppColors.red : AppColors.cyan).withValues(
                  alpha: .1,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                sensor.type == 'celsius'
                    ? Icons.device_thermostat_rounded
                    : Icons.sensors_rounded,
                color: alert ? AppColors.red : AppColors.cyan,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    sensor.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${sensor.scope ?? sensor.type} • ${sensor.status.toUpperCase()}',
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 9,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              sensor.display ?? (sensor.value?.toStringAsFixed(1) ?? '-'),
              style: TextStyle(
                color: alert ? AppColors.red : AppColors.textPrimary,
                fontWeight: FontWeight.w900,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CacheBadge extends StatelessWidget {
  const _CacheBadge();
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
    decoration: BoxDecoration(
      color: AppColors.amber.withValues(alpha: .1),
      borderRadius: BorderRadius.circular(999),
    ),
    child: const Text(
      'CACHE',
      style: TextStyle(
        color: AppColors.amber,
        fontSize: 8,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}

class _DetailError extends StatelessWidget {
  const _DetailError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_rounded, color: AppColors.red, size: 48),
          const SizedBox(height: 14),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: onRetry, child: const Text('Coba lagi')),
        ],
      ),
    ),
  );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(30),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: AppColors.textMuted),
          const SizedBox(height: 14),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 5),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
        ],
      ),
    ),
  );
}
