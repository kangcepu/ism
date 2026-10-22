import 'package:flutter/material.dart';

import '../core/app_config.dart';
import '../core/app_theme.dart';
import '../core/formatters.dart';
import '../models/monitor_device.dart';
import 'status_badge.dart';

class DeviceCard extends StatelessWidget {
  const DeviceCard({super.key, required this.device, required this.onTap});
  final MonitorDevice device;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final temperature = device.chassisTemperature;
    final temperatureColor = temperature == null
        ? AppColors.textMuted
        : temperature >= AppConfig.chassisAlertThreshold
        ? AppColors.red
        : temperature >= 45
        ? AppColors.amber
        : AppColors.cyan;
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Column(
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Hero(
                    tag: 'device-${device.id}',
                    child: Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: AppColors.blue.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: const Icon(
                        Icons.hub_rounded,
                        color: AppColors.cyan,
                        size: 21,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          device.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            height: 1.25,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          '${device.host}  •  ${device.location ?? 'Tanpa lokasi'}',
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
                  const SizedBox(width: 8),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 260),
                    child: StatusBadge(
                      key: ValueKey(device.status),
                      status: device.status,
                      compact: true,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: AppColors.navy950.withValues(alpha: .6),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Row(
                  children: [
                    _CompactMetric(
                      label: 'LATENCY',
                      value: formatLatency(device.latencyMs),
                    ),
                    const _VerticalLine(),
                    _CompactMetric(
                      label: 'TRAFFIC',
                      value: formatBits(device.totalTrafficBps),
                    ),
                    const _VerticalLine(),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          const Text(
                            'CHASSIS',
                            style: TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 8,
                              fontWeight: FontWeight.w700,
                              letterSpacing: .7,
                            ),
                          ),
                          const SizedBox(height: 3),
                          AnimatedSwitcher(
                            duration: const Duration(milliseconds: 280),
                            transitionBuilder: (child, animation) =>
                                FadeTransition(
                                  opacity: animation,
                                  child: SlideTransition(
                                    position: Tween<Offset>(
                                      begin: const Offset(0, .25),
                                      end: Offset.zero,
                                    ).animate(animation),
                                    child: child,
                                  ),
                                ),
                            child: Text(
                              formatTemperature(temperature),
                              key: ValueKey(temperature),
                              maxLines: 1,
                              style: TextStyle(
                                color: temperatureColor,
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CompactMetric extends StatelessWidget {
  const _CompactMetric({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: AppColors.textMuted,
            fontSize: 8,
            fontWeight: FontWeight.w700,
            letterSpacing: .7,
          ),
        ),
        const SizedBox(height: 3),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 260),
          child: Text(
            value,
            key: ValueKey(value),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

class _VerticalLine extends StatelessWidget {
  const _VerticalLine();
  @override
  Widget build(BuildContext context) => Container(
    width: 1,
    height: 26,
    margin: const EdgeInsets.symmetric(horizontal: 10),
    color: AppColors.border,
  );
}
