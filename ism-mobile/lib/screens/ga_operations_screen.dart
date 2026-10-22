import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../services/ga_service.dart';
import 'ga_outdoor_report_screen.dart';

class GaOperationsScreen extends StatefulWidget {
  const GaOperationsScreen({super.key, required this.service});
  final GaService service;

  @override
  State<GaOperationsScreen> createState() => _GaOperationsScreenState();
}

class _GaOperationsScreenState extends State<GaOperationsScreen> {
  late Future<_GaData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_GaData> _load() async {
    final values = await Future.wait([
      widget.service.dashboard(),
      widget.service.cleaning(DateTime.now()),
      widget.service.outdoor(DateTime.now()),
      widget.service.preventive(),
      widget.service.findings(),
    ]);
    return _GaData(
      dashboard: values[0] as Map<String, dynamic>,
      cleaning: values[1] as List<Map<String, dynamic>>,
      outdoor: values[2] as List<Map<String, dynamic>>,
      preventive: values[3] as List<Map<String, dynamic>>,
      findings: values[4] as List<Map<String, dynamic>>,
    );
  }

  Future<void> _refresh() async => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('General Affair'),
      actions: [
        IconButton(
          tooltip: 'Buat laporan area',
          icon: const Icon(Icons.add_a_photo_outlined),
          onPressed: () async {
            final created = await Navigator.of(context).push<bool>(
              MaterialPageRoute(
                builder: (_) => GaOutdoorReportScreen(service: widget.service),
              ),
            );
            if (created == true && context.mounted) _refresh();
          },
        ),
      ],
    ),
    body: RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<_GaData>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _ErrorView(
              message: snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Data GA tidak dapat dimuat.',
              onRetry: _refresh,
            );
          }
          final data = snapshot.requireData;
          return ListView(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 28),
            children: [
              const Text(
                'Operasional GA',
                style: TextStyle(fontSize: 25, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 6),
              const Text(
                'Checklist, inspeksi, preventive, dan temuan hari ini.',
                style: TextStyle(color: AppColors.textMuted),
              ),
              const SizedBox(height: 18),
              _Summary(data: data.dashboard),
              const SizedBox(height: 22),
              _Section(
                title: 'Checklist kebersihan hari ini',
                count: data.cleaning.length,
                child: Column(
                  children: data.cleaning
                      .map(
                        (item) => _CleaningRow(
                          item: item,
                          service: widget.service,
                          onChanged: _refresh,
                        ),
                      )
                      .toList(),
                ),
              ),
              const SizedBox(height: 18),
              _Section(
                title: 'Inspeksi area luar',
                count: data.outdoor.length,
                child: _ListRows(
                  items: data.outdoor,
                  subtitle: (item) =>
                      '${item['plantCondition'] ?? '-'} · ${item['cleanliness'] ?? '-'}',
                ),
              ),
              const SizedBox(height: 18),
              _Section(
                title: 'Preventive pekerjaan',
                count: data.preventive.length,
                child: _ListRows(
                  items: data.preventive,
                  subtitle: (item) =>
                      '${item['area'] is Map ? (item['area'] as Map)['name'] : '-'} · ${item['status'] ?? '-'}',
                ),
              ),
              const SizedBox(height: 18),
              _Section(
                title: 'Finding dan tindak lanjut',
                count: data.findings.length,
                child: _ListRows(
                  items: data.findings,
                  subtitle: (item) =>
                      '${item['severity'] ?? '-'} · ${item['status'] ?? '-'}',
                ),
              ),
            ],
          );
        },
      ),
    ),
  );
}

class _GaData {
  const _GaData({
    required this.dashboard,
    required this.cleaning,
    required this.outdoor,
    required this.preventive,
    required this.findings,
  });
  final Map<String, dynamic> dashboard;
  final List<Map<String, dynamic>> cleaning;
  final List<Map<String, dynamic>> outdoor;
  final List<Map<String, dynamic>> preventive;
  final List<Map<String, dynamic>> findings;
}

class _Summary extends StatelessWidget {
  const _Summary({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) => GridView.count(
    crossAxisCount: 2,
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    mainAxisSpacing: 10,
    crossAxisSpacing: 10,
    childAspectRatio: 2.2,
    children: [
      _Metric(
        label: 'Cleaning aktif',
        value: '${data['cleaning'] ?? 0}',
        color: AppColors.cyan,
      ),
      _Metric(
        label: 'Preventive aktif',
        value: '${data['preventive'] ?? 0}',
        color: AppColors.amber,
      ),
      _Metric(
        label: 'Finding terbuka',
        value: '${data['openFindings'] ?? 0}',
        color: AppColors.red,
      ),
      _Metric(
        label: 'CCTV perlu aksi',
        value: '${data['gaps'] ?? 0}',
        color: AppColors.purple,
      ),
    ],
  );
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.label,
    required this.value,
    required this.color,
  });
  final String label;
  final String value;
  final Color color;
  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: color.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(14),
    ),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w900,
              color: color,
            ),
          ),
        ],
      ),
    ),
  );
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.count,
    required this.child,
  });
  final String title;
  final int count;
  final Widget child;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
          ),
          Text(
            '$count data',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
        ],
      ),
      const SizedBox(height: 9),
      child,
    ],
  );
}

class _CleaningRow extends StatefulWidget {
  const _CleaningRow({
    required this.item,
    required this.service,
    required this.onChanged,
  });
  final Map<String, dynamic> item;
  final GaService service;
  final Future<void> Function() onChanged;
  @override
  State<_CleaningRow> createState() => _CleaningRowState();
}

class _CleaningRowState extends State<_CleaningRow> {
  bool _saving = false;
  Future<void> _toggle(Map<String, dynamic> line, bool value) async {
    setState(() => _saving = true);
    try {
      await widget.service.updateCleaningLine(
        (line['id'] as num).toInt(),
        value,
      );
      await widget.onChanged();
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final area = widget.item['area'] as Map?;
    final lines = (widget.item['lines'] as List? ?? const [])
        .whereType<Map>()
        .map((value) => value.cast<String, dynamic>())
        .toList();
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    area?['name']?.toString() ?? 'Area',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                _Status(value: widget.item['status']?.toString() ?? '-'),
              ],
            ),
            const SizedBox(height: 7),
            ...lines.map(
              (line) => CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                value: line['completed'] == true,
                onChanged: _saving
                    ? null
                    : (value) => _toggle(line, value ?? false),
                title: Text(
                  line['task']?.toString() ?? '-',
                  style: const TextStyle(fontSize: 13),
                ),
              ),
            ),
            if ((widget.item['status']?.toString() == 'DRAFT' ||
                    widget.item['status']?.toString() == 'OVERDUE') &&
                lines.every((line) => line['completed'] == true))
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: _saving
                      ? null
                      : () async {
                          await widget.service.submitCleaning(
                            (widget.item['id'] as num).toInt(),
                          );
                          await widget.onChanged();
                        },
                  child: const Text('Kirim checklist'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ListRows extends StatelessWidget {
  const _ListRows({required this.items, required this.subtitle});
  final List<Map<String, dynamic>> items;
  final String Function(Map<String, dynamic>) subtitle;
  @override
  Widget build(BuildContext context) => Card(
    child: items.isEmpty
        ? const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'Belum ada data.',
              style: TextStyle(color: AppColors.textMuted),
            ),
          )
        : Column(
            children: items.map((item) {
              final area = item['area'] as Map?;
              final title =
                  item['title'] ??
                  item['cameraName'] ??
                  area?['name'] ??
                  item['code'] ??
                  '-';
              return ListTile(
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 2,
                ),
                title: Text(
                  title.toString(),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(subtitle(item)),
                trailing: _Status(value: item['status']?.toString() ?? '-'),
              );
            }).toList(),
          ),
  );
}

class _Status extends StatelessWidget {
  const _Status({required this.value});
  final String value;
  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: AppColors.blue.withValues(alpha: .16),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      child: Text(
        value.replaceAll('_', ' '),
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: AppColors.cyan,
        ),
      ),
    ),
  );
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_rounded, size: 42, color: AppColors.amber),
          const SizedBox(height: 14),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 14),
          FilledButton(onPressed: onRetry, child: const Text('Coba lagi')),
        ],
      ),
    ),
  );
}
