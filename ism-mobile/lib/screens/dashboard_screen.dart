import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../controllers/monitoring_controller.dart';
import '../controllers/zerotier_summary_controller.dart';
import '../core/app_config.dart';
import '../core/app_theme.dart';
import '../core/formatters.dart';
import '../models/monitor_device.dart';
import '../services/monitoring_service.dart';
import '../widgets/loading_skeleton.dart';
import '../widgets/realtime_badge.dart';
import '../widgets/status_badge.dart';
import 'device_detail_screen.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({
    super.key,
    required this.controller,
    required this.zeroTier,
    required this.service,
    this.isAdmin = false,
    this.onZeroTierTap,
  });

  final MonitoringController controller;
  final ZeroTierSummaryController zeroTier;
  final MonitoringService service;
  final bool isAdmin;
  final VoidCallback? onZeroTierTap;

  void _openDevice(BuildContext context, MonitorDevice device) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DeviceDetailScreen(
          device: device,
          service: service,
          isAdmin: isAdmin,
          onChanged: controller.refresh,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: ListenableBuilder(
          listenable: Listenable.merge([controller, zeroTier]),
          builder: (context, _) => LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxHeight < 720;
              final devices = [...controller.devices]
                ..sort(
                  (a, b) => (b.chassisTemperature ?? -999).compareTo(
                    a.chassisTemperature ?? -999,
                  ),
                );
              final attention =
                  controller.devices
                      .where((device) => device.needsAttention)
                      .toList()
                    ..sort(
                      (a, b) => (b.chassisTemperature ?? -999).compareTo(
                        a.chassisTemperature ?? -999,
                      ),
                    );

              return Padding(
                padding: EdgeInsets.fromLTRB(
                  compact ? 10 : 12,
                  compact ? 6 : 8,
                  compact ? 10 : 12,
                  compact ? 6 : 8,
                ),
                child: Column(
                  children: [
                    _Header(
                      controller: controller,
                      attentionCount: attention.length,
                    ),
                    SizedBox(height: compact ? 4 : 5),
                    if (controller.error != null) ...[
                      _ErrorStrip(
                        message: controller.error!,
                        onRetry: controller.refresh,
                      ),
                      SizedBox(height: compact ? 4 : 5),
                    ],
                    SizedBox(
                      height: compact ? 96 : 108,
                      child: controller.isInitialLoading
                          ? const LoadingSkeleton(height: 108)
                          : _Reveal(
                              child: _OverviewStrip(
                                controller: controller,
                                compact: compact,
                              ),
                            ),
                    ),
                    SizedBox(height: compact ? 4 : 5),
                    _SectionLine(
                      title: 'Traffic VLAN & ZeroTier',
                      trailing: 'IN / OUT • ~ estimasi',
                      compact: compact,
                    ),
                    SizedBox(height: compact ? 2 : 3),
                    SizedBox(
                      height: compact ? 50 : 58,
                      child: _Reveal(
                        delay: 100,
                        child: _VlanTrafficPanel(
                          metrics: controller.summary.vlanTraffic,
                          zeroTier: zeroTier,
                          onZeroTierTap: onZeroTierTap,
                        ),
                      ),
                    ),
                    if (attention.isNotEmpty) ...[
                      SizedBox(height: compact ? 4 : 5),
                      SizedBox(
                        height: compact ? 34 : 38,
                        child: _AttentionRow(
                          device: attention.first,
                          hiddenCount: attention.length - 1,
                          onTap: () => _openDevice(context, attention.first),
                        ),
                      ),
                    ],
                    SizedBox(height: compact ? 4 : 5),
                    _SectionLine(
                      title: 'Chassis temperature',
                      trailing: '${devices.length} switch',
                      compact: compact,
                    ),
                    SizedBox(height: compact ? 2 : 3),
                    Expanded(
                      child: controller.isInitialLoading
                          ? const LoadingSkeleton(height: 260)
                          : _TemperatureGrid(
                              devices: devices,
                              onTap: (device) => _openDevice(context, device),
                            ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.controller, required this.attentionCount});

  final MonitoringController controller;
  final int attentionCount;

  @override
  Widget build(BuildContext context) {
    final statusColor = attentionCount > 0 ? AppColors.amber : AppColors.green;
    final statusText = attentionCount > 0
        ? '$attentionCount switch perlu perhatian'
        : 'Seluruh perangkat stabil';
    return SizedBox(
      height: 34,
      child: Row(
        children: [
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Pusat Operasional',
                    style: TextStyle(
                      fontSize: 16,
                      height: 1,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -.4,
                    ),
                  ),
                ),
                const SizedBox(height: 3),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 5,
                      height: 5,
                      decoration: BoxDecoration(
                        color: statusColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        statusText,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 8.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          RealtimeBadge(active: controller.error == null),
          const SizedBox(width: 4),
          IconButton(
            tooltip: 'Perbarui data',
            onPressed: controller.refresh,
            icon: const Icon(Icons.refresh_rounded, size: 22),
          ),
        ],
      ),
    );
  }
}

class _AvailabilityCard extends StatelessWidget {
  const _AvailabilityCard({required this.controller, required this.compact});

  final MonitoringController controller;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final total = controller.summary.total;
    final rate = total == 0 ? 0.0 : controller.summary.online / total;
    final gaugeSize = compact ? 38.0 : 44.0;
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 9 : 11,
        vertical: compact ? 5 : 6,
      ),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF12334B), Color(0xFF0C2539)],
        ),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: const Color(0xFF28536E)),
      ),
      child: Row(
        children: [
          SizedBox(
            width: gaugeSize,
            height: gaugeSize,
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: rate),
              duration: const Duration(milliseconds: 650),
              curve: Curves.easeOutCubic,
              builder: (context, value, _) => Stack(
                fit: StackFit.expand,
                children: [
                  CircularProgressIndicator(
                    value: value,
                    strokeWidth: compact ? 4 : 5,
                    color: AppColors.green,
                    backgroundColor: AppColors.navy950,
                    strokeCap: StrokeCap.round,
                  ),
                  Center(
                    child: Text(
                      '${(value * 100).round()}%',
                      style: TextStyle(
                        fontSize: compact ? 10 : 11.5,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SizedBox(width: compact ? 8 : 10),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Network availability',
                  maxLines: 1,
                  style: TextStyle(
                    fontSize: compact ? 11 : 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  '${controller.summary.online}/$total online  •  Sync ${relativeTime(controller.lastSync)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: AppColors.textMuted,
                    fontSize: compact ? 7.5 : 8.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// Availability gauge + the four headline numbers used to live in two
// separately-sized blocks (a tall gauge card, then a 2x2 metric grid below
// it) costing ~170-190px of vertical space combined. Folded into one strip
// - slim gauge row on top, a single dense row of 4 metric chips below - so
// the temperature list (the actual actionable content) gets that space
// back instead of an idle info card.
class _OverviewStrip extends StatelessWidget {
  const _OverviewStrip({required this.controller, required this.compact});
  final MonitoringController controller;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final attentionCount = controller.devices
        .where((device) => device.needsAttention)
        .length;
    return Column(
      children: [
        Expanded(
          flex: 5,
          child: _AvailabilityCard(controller: controller, compact: compact),
        ),
        SizedBox(height: compact ? 4 : 5),
        Expanded(
          flex: 4,
          child: Row(
            children: [
              Expanded(
                child: _MetricCell(
                  label: 'Devices',
                  value: '${controller.summary.total}',
                  icon: Icons.hub_rounded,
                  color: AppColors.blue,
                  compact: compact,
                ),
              ),
              const SizedBox(width: 5),
              Expanded(
                child: _MetricCell(
                  label: 'Attention',
                  value: '$attentionCount',
                  icon: Icons.warning_amber_rounded,
                  color: AppColors.amber,
                  compact: compact,
                ),
              ),
              const SizedBox(width: 5),
              Expanded(
                child: _MetricCell(
                  label: 'Inbound',
                  value: formatCompactBits(controller.summary.trafficInBps),
                  icon: Icons.south_east_rounded,
                  color: AppColors.cyan,
                  compact: compact,
                ),
              ),
              const SizedBox(width: 5),
              Expanded(
                child: _MetricCell(
                  label: 'Outbound',
                  value: formatCompactBits(controller.summary.trafficOutBps),
                  icon: Icons.north_east_rounded,
                  color: AppColors.purple,
                  compact: compact,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MetricCell extends StatelessWidget {
  const _MetricCell({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    required this.compact,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final bool compact;

  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.symmetric(horizontal: compact ? 5 : 6, vertical: 3),
    decoration: BoxDecoration(
      color: AppColors.navy900,
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: AppColors.border),
    ),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 9, color: color),
            const SizedBox(width: 3),
            Expanded(
              child: Text(
                label.toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.clip,
                style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 6.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: .3,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 260),
          child: Text(
            value,
            key: ValueKey(value),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: compact ? 12 : 13.5,
              height: 1.1,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    ),
  );
}

class _VlanTrafficPanel extends StatelessWidget {
  const _VlanTrafficPanel({
    required this.metrics,
    required this.zeroTier,
    this.onZeroTierTap,
  });

  final List<VlanTrafficMetric> metrics;
  final ZeroTierSummaryController zeroTier;
  final VoidCallback? onZeroTierTap;

  // PC and Voice are the two traffic classes ops cares about first, so they
  // lead the strip; Management/Guest/CCTV follow, then the ZeroTier
  // connection tile (rendered separately - it has no bps, only member
  // status from ZeroTier Central).
  static const _definitions = <VlanTrafficMetric>[
    VlanTrafficMetric(id: 1, label: 'VLAN 1', name: 'PC'),
    VlanTrafficMetric(id: 80, label: 'VLAN 80', name: 'Voice'),
    VlanTrafficMetric(id: 40, label: 'VLAN 40', name: 'Management'),
    VlanTrafficMetric(id: 50, label: 'VLAN 50', name: 'Guest WiFi'),
    VlanTrafficMetric(id: 70, label: 'VLAN 70', name: 'CCTV'),
  ];

  @override
  Widget build(BuildContext context) {
    final values = _definitions.map((definition) {
      return metrics
              .where((metric) => metric.id == definition.id)
              .firstOrNull ??
          definition;
    }).toList();
    final cellCount = values.length + 1;
    return Row(
      children: List.generate(cellCount, (index) {
        final isLast = index == cellCount - 1;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: isLast ? 0 : 4),
            child: index == values.length
                ? _ZeroTierMetricCell(
                    controller: zeroTier,
                    onTap: onZeroTierTap,
                  )
                : _VlanMetricCell(metric: values[index]),
          ),
        );
      }),
    );
  }
}

class _VlanMetricCell extends StatelessWidget {
  const _VlanMetricCell({required this.metric});
  final VlanTrafficMetric metric;

  @override
  Widget build(BuildContext context) {
    final color = switch (metric.id) {
      1 => AppColors.blue,
      80 => AppColors.green,
      40 => AppColors.cyan,
      50 => AppColors.purple,
      _ => AppColors.amber,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .09),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: .28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  metric.label.replaceAll(' ', ''),
                  maxLines: 1,
                  overflow: TextOverflow.clip,
                  style: TextStyle(
                    color: color,
                    fontSize: 7,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              if (metric.estimated)
                const Text(
                  '~',
                  style: TextStyle(color: AppColors.amber, fontSize: 7.5),
                ),
            ],
          ),
          Text(
            metric.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 6),
          ),
          const Spacer(),
          Row(
            children: [
              Expanded(
                child: _VlanRate(
                  prefix: 'I',
                  value: metric.available ? metric.inBps : null,
                  color: AppColors.cyan,
                ),
              ),
              Expanded(
                child: _VlanRate(
                  prefix: 'O',
                  value: metric.available ? metric.outBps : null,
                  color: AppColors.purple,
                  alignRight: true,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ZeroTierMetricCell extends StatelessWidget {
  const _ZeroTierMetricCell({required this.controller, this.onTap});
  final ZeroTierSummaryController controller;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    const color = AppColors.cyan;
    final reachable = controller.anyReachable;
    return Material(
      color: color.withValues(alpha: .09),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: color.withValues(alpha: .28)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'ZEROTIER',
                      maxLines: 1,
                      overflow: TextOverflow.clip,
                      style: TextStyle(
                        color: color,
                        fontSize: 7,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Container(
                    width: 5,
                    height: 5,
                    decoration: BoxDecoration(
                      color: reachable ? AppColors.green : AppColors.textMuted,
                      shape: BoxShape.circle,
                    ),
                  ),
                ],
              ),
              Text(
                controller.isLoading
                    ? 'Memuat...'
                    : '${controller.networkCount} network',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 6),
              ),
              const Spacer(),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'On ${controller.onlineCount}',
                      maxLines: 1,
                      overflow: TextOverflow.clip,
                      style: const TextStyle(
                        color: AppColors.green,
                        fontSize: 6.5,
                        fontWeight: FontWeight.w800,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      '${controller.authorizedCount}/${controller.memberCount}',
                      maxLines: 1,
                      overflow: TextOverflow.clip,
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        color: color,
                        fontSize: 7,
                        fontWeight: FontWeight.w800,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _VlanRate extends StatelessWidget {
  const _VlanRate({
    required this.prefix,
    required this.value,
    required this.color,
    this.alignRight = false,
  });

  final String prefix;
  final double? value;
  final Color color;
  final bool alignRight;

  @override
  Widget build(BuildContext context) => Text(
    '$prefix ${formatCompactBits(value)}',
    maxLines: 1,
    overflow: TextOverflow.clip,
    textAlign: alignRight ? TextAlign.right : TextAlign.left,
    style: TextStyle(
      color: color,
      fontSize: 7,
      fontWeight: FontWeight.w800,
      fontFeatures: const [FontFeature.tabularFigures()],
    ),
  );
}

class _SectionLine extends StatelessWidget {
  const _SectionLine({
    required this.title,
    required this.trailing,
    required this.compact,
  });

  final String title;
  final String trailing;
  final bool compact;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: compact ? 15 : 17,
    child: Row(
      children: [
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: compact ? 10 : 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerRight,
            child: Text(
              trailing,
              maxLines: 1,
              style: TextStyle(
                color: AppColors.textMuted,
                fontSize: compact ? 7.5 : 8.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

class _AttentionRow extends StatelessWidget {
  const _AttentionRow({
    required this.device,
    required this.hiddenCount,
    required this.onTap,
  });

  final MonitorDevice device;
  final int hiddenCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: AppColors.red.withValues(alpha: .08),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
      side: BorderSide(color: AppColors.red.withValues(alpha: .3)),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Row(
          children: [
            const Icon(
              Icons.warning_amber_rounded,
              color: AppColors.red,
              size: 14,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                '${device.name}  •  Chassis ${formatTemperature(device.chassisTemperature)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            if (hiddenCount > 0) ...[
              const SizedBox(width: 5),
              Text(
                '+$hiddenCount',
                style: const TextStyle(
                  color: AppColors.red,
                  fontSize: 8.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
            const SizedBox(width: 6),
            StatusBadge(status: device.status, compact: true),
          ],
        ),
      ),
    ),
  );
}

class _TemperatureGrid extends StatelessWidget {
  const _TemperatureGrid({required this.devices, required this.onTap});

  final List<MonitorDevice> devices;
  final ValueChanged<MonitorDevice> onTap;

  @override
  Widget build(BuildContext context) {
    if (devices.isEmpty) {
      return Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.navy900,
          borderRadius: BorderRadius.circular(13),
          border: Border.all(color: AppColors.border),
        ),
        child: const Text(
          'Belum ada data switch',
          style: TextStyle(color: AppColors.textMuted, fontSize: 10),
        ),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        // Tuned for the tightened _TemperatureCell below (~20px/row, ~120px
        // min column width) - denser than the old 145/27 thresholds so more
        // of the switch list is visible without scrolling.
        final maxColumns = math.max(
          2,
          math.min(4, (constraints.maxWidth / 120).floor()),
        );
        final comfortableRows = math.max(
          1,
          (constraints.maxHeight / 20).floor(),
        );
        final columns = (devices.length / comfortableRows).ceil().clamp(
          2,
          maxColumns,
        );
        final rows = (devices.length / columns).ceil();
        return Container(
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            color: AppColors.navy900,
            borderRadius: BorderRadius.circular(13),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: List.generate(rows, (rowIndex) {
              return Expanded(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: List.generate(columns, (columnIndex) {
                    final index = (rowIndex * columns) + columnIndex;
                    return Expanded(
                      child: Padding(
                        padding: const EdgeInsets.all(1),
                        child: index >= devices.length
                            ? const SizedBox.shrink()
                            : _TemperatureCell(
                                device: devices[index],
                                onTap: () => onTap(devices[index]),
                              ),
                      ),
                    );
                  }),
                ),
              );
            }),
          ),
        );
      },
    );
  }
}

class _TemperatureCell extends StatelessWidget {
  const _TemperatureCell({required this.device, required this.onTap});
  final MonitorDevice device;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final temperature = device.chassisTemperature;
    final color = temperature == null
        ? AppColors.textMuted
        : temperature >= AppConfig.chassisAlertThreshold
        ? AppColors.red
        : temperature >= 45
        ? AppColors.amber
        : AppColors.cyan;
    return LayoutBuilder(
      builder: (context, constraints) {
        final generous = constraints.maxHeight >= 30;
        return Material(
          color: AppColors.navy950.withValues(alpha: .72),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(6),
            side: BorderSide(color: color.withValues(alpha: .4)),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      device.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: generous ? 8.5 : 7.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 3),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 280),
                    child: Text(
                      formatTemperature(temperature),
                      key: ValueKey(temperature),
                      maxLines: 1,
                      style: TextStyle(
                        color: color,
                        fontSize: generous ? 9.5 : 8,
                        fontWeight: FontWeight.w900,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ErrorStrip extends StatelessWidget {
  const _ErrorStrip({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 30,
    child: Material(
      color: AppColors.red.withValues(alpha: .09),
      borderRadius: BorderRadius.circular(9),
      child: InkWell(
        onTap: onRetry,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 9),
          child: Row(
            children: [
              const Icon(
                Icons.cloud_off_rounded,
                color: AppColors.red,
                size: 14,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  message,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 8,
                  ),
                ),
              ),
              const Text(
                'COBA LAGI',
                style: TextStyle(
                  color: AppColors.red,
                  fontSize: 7,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _Reveal extends StatefulWidget {
  const _Reveal({required this.child, this.delay = 0});
  final Widget child;
  final int delay;

  @override
  State<_Reveal> createState() => _RevealState();
}

class _RevealState extends State<_Reveal> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 430),
  );
  late final Animation<double> _opacity = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOutCubic,
  );
  late final Animation<Offset> _slide = Tween<Offset>(
    begin: const Offset(0, .07),
    end: Offset.zero,
  ).animate(_opacity);

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return widget.child;
    return FadeTransition(
      opacity: _opacity,
      child: SlideTransition(position: _slide, child: widget.child),
    );
  }
}
