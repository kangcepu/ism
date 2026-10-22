import 'package:flutter/material.dart';

import '../core/app_theme.dart';

class ModulesScreen extends StatelessWidget {
  const ModulesScreen({
    super.key,
    required this.onAssetsTap,
    required this.onDevicesTap,
    required this.onZeroTierTap,
    required this.onFloorMapsTap,
    required this.onAiAssistantTap,
    required this.onGaTap,
    required this.onInventoryTap,
    required this.onCctvTap,
    required this.onMonitoringTap,
    required this.onFloorMapTap,
    this.onAddsTap,
  });

  final VoidCallback onAssetsTap;
  final VoidCallback onDevicesTap;
  final VoidCallback onZeroTierTap;
  final VoidCallback onFloorMapsTap;
  final VoidCallback onAiAssistantTap;
  final VoidCallback onGaTap;
  final VoidCallback onInventoryTap;
  final VoidCallback onCctvTap;
  final VoidCallback onMonitoringTap;
  final VoidCallback onFloorMapTap;
  final VoidCallback? onAddsTap;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: ListView(
      padding: const EdgeInsets.fromLTRB(18, 24, 18, 18),
      children: [
        const Text(
          'MODUL',
          style: TextStyle(
            color: AppColors.cyan,
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.6,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Area kerja',
          style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 7),
        const Text(
          'Pilih area yang ingin kamu pantau atau kelola.',
          style: TextStyle(color: AppColors.textMuted, height: 1.4),
        ),
        const SizedBox(height: 22),
        _ModuleCard(
          icon: Icons.monitor_heart_rounded,
          color: AppColors.cyan,
          title: 'Monitoring Switch',
          description:
              'Status perangkat, SNMP, traffic, dan kesehatan jaringan.',
          onTap: onMonitoringTap,
        ),
        const SizedBox(height: 12),
        _ModuleCard(
          icon: Icons.inventory_2_rounded,
          color: AppColors.green,
          title: 'Inventory',
          description:
              'Item stok, lokasi penyimpanan, dan ketersediaan material.',
          onTap: onInventoryTap,
        ),
        const SizedBox(height: 12),
        _ModuleCard(
          icon: Icons.videocam_rounded,
          color: AppColors.purple,
          title: 'CCTV',
          description:
              'Register kamera, recorder, dan kondisi operasional CCTV.',
          onTap: onCctvTap,
        ),
        const SizedBox(height: 12),
        _ModuleCard(
          icon: Icons.map_rounded,
          color: AppColors.blue,
          title: 'Denah dan Map',
          description: 'Denah lantai, marker aset, switch, dan CCTV.',
          onTap: onFloorMapTap,
        ),
        const SizedBox(height: 12),
        _ModuleCard(
          icon: Icons.fact_check_rounded,
          color: AppColors.amber,
          title: 'General Affair',
          description:
              'Checklist kebersihan, inspeksi area, preventive, CCTV, dan finding.',
          onTap: onGaTap,
        ),
        const SizedBox(height: 12),
        _ModuleCard(
          icon: Icons.auto_awesome_rounded,
          color: AppColors.cyan,
          title: 'AI Assistant',
          description:
              'Tanya data inventaris dan monitoring, buat atau validasi draft aset.',
          onTap: onAiAssistantTap,
        ),
        const SizedBox(height: 12),
        _ModuleCard(
          icon: Icons.hub_rounded,
          color: AppColors.cyan,
          title: 'Perangkat',
          description: 'Status switch, suhu chassis, trafik, dan detail SNMP.',
          onTap: onDevicesTap,
        ),
        const SizedBox(height: 12),
        _ModuleCard(
          icon: Icons.inventory_2_rounded,
          color: AppColors.green,
          title: 'Management Assets',
          description: 'Lihat aset dan tambahkan inventaris dari mobile.',
          onTap: onAssetsTap,
        ),
        const SizedBox(height: 12),
        _ModuleCard(
          icon: Icons.diamond_rounded,
          color: AppColors.purple,
          title: 'ZeroTier',
          description: 'Network dan anggota remote yang terhubung.',
          onTap: onZeroTierTap,
        ),
        const SizedBox(height: 12),
        _ModuleCard(
          icon: Icons.map_rounded,
          color: AppColors.purple,
          title: 'Map Panel',
          description:
              'Denah area, CCTV, switch, jalur backbone, dan status perangkat.',
          onTap: onFloorMapsTap,
        ),
        if (onAddsTap != null) ...[
          const SizedBox(height: 12),
          _ModuleCard(
            icon: Icons.domain_rounded,
            color: AppColors.blue,
            title: 'ADDS Management',
            description:
                'Kelola OU, user, grup, dan komputer Active Directory.',
            onTap: onAddsTap!,
          ),
        ],
      ],
    ),
  );
}

class _ModuleCard extends StatelessWidget {
  const _ModuleCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.description,
    this.onTap,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String description;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: AppColors.navy900,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(18),
      side: BorderSide(color: color.withValues(alpha: .38)),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: color.withValues(alpha: .14),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: color),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right_rounded, color: color),
          ],
        ),
      ),
    ),
  );
}
