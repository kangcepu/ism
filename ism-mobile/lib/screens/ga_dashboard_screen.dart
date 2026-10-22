import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../services/ga_service.dart';

class GaDashboardScreen extends StatefulWidget {
  const GaDashboardScreen({
    super.key,
    required this.service,
    required this.onOpenWork,
    required this.onCreateOutdoor,
  });

  final GaService service;
  final VoidCallback onOpenWork;
  final VoidCallback onCreateOutdoor;

  @override
  State<GaDashboardScreen> createState() => _GaDashboardScreenState();
}

class _GaDashboardScreenState extends State<GaDashboardScreen> {
  late Future<_GaDashboardData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_GaDashboardData> _load() async {
    final now = DateTime.now();
    final results = await Future.wait([
      widget.service.dashboard(),
      widget.service.cleaning(now),
      widget.service.outdoor(now),
      widget.service.preventive(),
      widget.service.findings(),
    ]);
    return _GaDashboardData(
      summary: results[0] as Map<String, dynamic>,
      cleaning: results[1] as List<Map<String, dynamic>>,
      outdoor: results[2] as List<Map<String, dynamic>>,
      preventive: results[3] as List<Map<String, dynamic>>,
      findings: results[4] as List<Map<String, dynamic>>,
    );
  }

  Future<void> _refresh() async => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.transparent,
    body: SafeArea(
      child: FutureBuilder<_GaDashboardData>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Data operasional GA belum dapat dimuat.';
            return _GaError(message: message, onRetry: _refresh);
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: _GaContent(
              data: snapshot.requireData,
              onOpenWork: widget.onOpenWork,
              onCreateOutdoor: widget.onCreateOutdoor,
              onRefresh: _refresh,
            ),
          );
        },
      ),
    ),
  );
}

class _GaDashboardData {
  const _GaDashboardData({
    required this.summary,
    required this.cleaning,
    required this.outdoor,
    required this.preventive,
    required this.findings,
  });

  final Map<String, dynamic> summary;
  final List<Map<String, dynamic>> cleaning;
  final List<Map<String, dynamic>> outdoor;
  final List<Map<String, dynamic>> preventive;
  final List<Map<String, dynamic>> findings;

  int get completedLines => cleaning.fold(0, (total, item) {
    final lines = item['lines'] as List? ?? const [];
    return total +
        lines
            .whereType<Map>()
            .where((line) => line['completed'] == true)
            .length;
  });

  int get totalLines => cleaning.fold(
    0,
    (total, item) => total + ((item['lines'] as List?)?.length ?? 0),
  );

  int get openFindings => findings
      .where((item) => !['CLOSED', 'RESOLVED'].contains(item['status']))
      .length;
}

class _GaContent extends StatelessWidget {
  const _GaContent({
    required this.data,
    required this.onOpenWork,
    required this.onCreateOutdoor,
    required this.onRefresh,
  });

  final _GaDashboardData data;
  final VoidCallback onOpenWork;
  final VoidCallback onCreateOutdoor;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final percentage = data.totalLines == 0
        ? 0
        : (data.completedLines / data.totalLines * 100).round();
    final urgent = data.findings
        .where((item) => ['HIGH', 'CRITICAL'].contains(item['severity']))
        .toList();
    final pending = data.preventive
        .where((item) => !['COMPLETED', 'CLOSED'].contains(item['status']))
        .toList();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Pusat Operasional GA',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -.5,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Rencana kerja, inspeksi, dan tindak lanjut hari ini',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: onRefresh,
              tooltip: 'Perbarui data',
              icon: const Icon(Icons.refresh_rounded),
            ),
          ],
        ),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: AppColors.navy800,
            border: Border.all(color: AppColors.border),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 66,
                height: 66,
                child: CircularProgressIndicator(
                  value: percentage / 100,
                  strokeWidth: 7,
                  backgroundColor: AppColors.navy700,
                  color: AppColors.green,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'CHECKLIST HARI INI',
                      style: TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: .8,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$percentage% terselesaikan',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${data.completedLines}/${data.totalLines} pekerjaan selesai',
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.75,
          children: [
            _Metric(
              label: 'Checklist aktif',
              value: '${data.summary['cleaning'] ?? data.cleaning.length}',
              icon: Icons.checklist_rounded,
              color: AppColors.green,
            ),
            _Metric(
              label: 'Area luar',
              value: '${data.summary['outdoor'] ?? data.outdoor.length}',
              icon: Icons.yard_outlined,
              color: AppColors.cyan,
            ),
            _Metric(
              label: 'Preventive',
              value: '${data.summary['preventive'] ?? pending.length}',
              icon: Icons.build_outlined,
              color: AppColors.amber,
            ),
            _Metric(
              label: 'Temuan terbuka',
              value: '${data.summary['openFindings'] ?? data.openFindings}',
              icon: Icons.report_problem_outlined,
              color: AppColors.red,
            ),
          ],
        ),
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: onCreateOutdoor,
          icon: const Icon(Icons.add_a_photo_outlined),
          label: const Text('Buat laporan kondisi area'),
        ),
        const SizedBox(height: 24),
        _SectionHeader(
          title: 'Perlu ditindaklanjuti',
          action: 'Buka pekerjaan',
          onTap: onOpenWork,
        ),
        const SizedBox(height: 9),
        if (urgent.isEmpty && pending.isEmpty)
          const _EmptyWork()
        else ...[
          ...urgent
              .take(3)
              .map(
                (item) => _ActionRow(
                  icon: Icons.report_problem_rounded,
                  iconColor: AppColors.red,
                  title:
                      item['title']?.toString() ??
                      item['code']?.toString() ??
                      'Temuan GA',
                  detail:
                      '${item['severity'] ?? 'NORMAL'} · ${item['status'] ?? 'OPEN'}',
                ),
              ),
          ...pending
              .take(3)
              .map(
                (item) => _ActionRow(
                  icon: Icons.build_circle_outlined,
                  iconColor: AppColors.amber,
                  title:
                      item['title']?.toString() ??
                      item['code']?.toString() ??
                      'Pekerjaan preventive',
                  detail: item['status']?.toString() ?? 'RELEASED',
                ),
              ),
        ],
        const SizedBox(height: 24),
        _SectionHeader(title: 'Kegiatan hari ini'),
        const SizedBox(height: 9),
        _ActivityRow(
          icon: Icons.cleaning_services_outlined,
          title: 'Checklist kebersihan',
          value: '${data.cleaning.length} area',
        ),
        _ActivityRow(
          icon: Icons.park_outlined,
          title: 'Inspeksi area luar',
          value: '${data.outdoor.length} inspeksi',
        ),
        _ActivityRow(
          icon: Icons.videocam_outlined,
          title: 'CCTV dan coverage',
          value: '${data.summary['gaps'] ?? 0} perlu cek',
        ),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      color: AppColors.navy900,
      borderRadius: BorderRadius.circular(15),
      border: Border.all(color: AppColors.border),
    ),
    child: Row(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 10,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                value,
                style: TextStyle(
                  color: color,
                  fontSize: 20,
                  height: 1,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.action, this.onTap});
  final String title;
  final String? action;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(
          title,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
        ),
      ),
      if (action != null) TextButton(onPressed: onTap, child: Text(action!)),
    ],
  );
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.detail,
  });
  final IconData icon;
  final Color iconColor;
  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 8),
    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
    decoration: BoxDecoration(
      color: AppColors.navy900,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: AppColors.border),
    ),
    child: Row(
      children: [
        Icon(icon, color: iconColor),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                detail,
                style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
        const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
      ],
    ),
  );
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({
    required this.icon,
    required this.title,
    required this.value,
  });
  final IconData icon;
  final String title;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 10),
    child: Row(
      children: [
        Icon(icon, color: AppColors.cyan, size: 20),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
        Text(
          value,
          style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
        ),
      ],
    ),
  );
}

class _EmptyWork extends StatelessWidget {
  const _EmptyWork();
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: AppColors.green.withValues(alpha: .08),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: AppColors.green.withValues(alpha: .35)),
    ),
    child: const Row(
      children: [
        Icon(Icons.verified_outlined, color: AppColors.green),
        SizedBox(width: 11),
        Expanded(
          child: Text(
            'Tidak ada temuan prioritas. Operasional hari ini terkendali.',
            style: TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
        ),
      ],
    ),
  );
}

class _GaError extends StatelessWidget {
  const _GaError({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_outlined, color: AppColors.red, size: 36),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted),
          ),
          const SizedBox(height: 14),
          FilledButton.tonal(
            onPressed: onRetry,
            child: const Text('Coba lagi'),
          ),
        ],
      ),
    ),
  );
}
