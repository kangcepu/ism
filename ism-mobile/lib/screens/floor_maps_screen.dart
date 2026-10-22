import 'package:flutter/material.dart';

import '../core/app_config.dart';
import '../core/app_theme.dart';
import '../models/floor_map.dart';
import '../services/floor_maps_service.dart';

class FloorMapsScreen extends StatefulWidget {
  const FloorMapsScreen({super.key, required this.service});

  final FloorMapsService service;

  @override
  State<FloorMapsScreen> createState() => _FloorMapsScreenState();
}

class _FloorMapsScreenState extends State<FloorMapsScreen> {
  late Future<List<FloorMapArea>?> _future;
  List<FloorMapArea> _areas = [];

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<FloorMapArea>?> _load() async {
    final areas = await widget.service.list();
    if (areas != null) _areas = areas;
    return areas;
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Denah Infrastruktur')),
      body: FutureBuilder<List<FloorMapArea>?>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done && _areas.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError && _areas.isEmpty) {
            return _Retry(message: snapshot.error.toString(), onRetry: _refresh);
          }
          if (_areas.isEmpty) return const _Empty();

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'OPERASIONAL MAP',
                  style: TextStyle(
                    color: AppColors.cyan,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Lihat kondisi area dengan cepat',
                  style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Status marker mengikuti perangkat yang ditautkan pada monitoring.',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 11),
                ),
                const SizedBox(height: 18),
                ..._areas.map(
                  (area) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _AreaCard(
                      area: area,
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => FloorMapDetailScreen(
                            service: widget.service,
                            area: area,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _AreaCard extends StatelessWidget {
  const _AreaCard({required this.area, required this.onTap});

  final FloorMapArea area;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final summary = area.summary;
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 43,
                    height: 43,
                    decoration: BoxDecoration(
                      color: AppColors.cyan.withValues(alpha: .12),
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: const Icon(Icons.map_rounded, color: AppColors.cyan),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(area.name, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
                        if (area.description?.isNotEmpty == true)
                          Text(
                            area.description!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
                          ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
                ],
              ),
              const SizedBox(height: 15),
              Row(
                children: [
                  _Stat('${summary.markers}', 'MARKER', AppColors.cyan),
                  _Stat('${summary.online}', 'ONLINE', AppColors.green),
                  _Stat('${summary.attention}', 'PERHATIAN', summary.attention > 0 ? AppColors.red : AppColors.textMuted),
                  _Stat('${summary.offline}', 'OFFLINE', summary.offline > 0 ? AppColors.red : AppColors.textMuted),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.value, this.label, this.color);

  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: TextStyle(color: color, fontSize: 17, fontWeight: FontWeight.w900)),
            Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 8, fontWeight: FontWeight.w800)),
          ],
        ),
      );
}

class FloorMapDetailScreen extends StatefulWidget {
  const FloorMapDetailScreen({super.key, required this.service, required this.area});

  final FloorMapsService service;
  final FloorMapArea area;

  @override
  State<FloorMapDetailScreen> createState() => _FloorMapDetailScreenState();
}

class _FloorMapDetailScreenState extends State<FloorMapDetailScreen> {
  late Future<FloorMapArea> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.service.detail(widget.area.id);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.area.name)),
      body: FutureBuilder<FloorMapArea>(
        future: _future,
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            if (snapshot.hasError) {
              return _Retry(
                message: snapshot.error.toString(),
                onRetry: () => setState(() => _future = widget.service.detail(widget.area.id)),
              );
            }
            return const Center(child: CircularProgressIndicator());
          }
          final area = snapshot.data!;
          return Column(
            children: [
              _Summary(summary: area.summary),
              Expanded(
                child: InteractiveViewer(
                  minScale: .15,
                  maxScale: 5,
                  boundaryMargin: const EdgeInsets.all(90),
                  child: AspectRatio(
                    aspectRatio: area.canvasWidth / area.canvasHeight,
                    child: LayoutBuilder(
                      builder: (context, constraints) => Stack(
                        fit: StackFit.expand,
                        children: [
                          if (area.backgroundPath != null)
                            Image.network(
                              '${AppConfig.webRootUrl}${area.backgroundPath}',
                              fit: BoxFit.fill,
                              errorBuilder: (_, error, stackTrace) => const _Grid(),
                            )
                          else
                            const _Grid(),
                          Positioned.fill(child: CustomPaint(painter: _CablePainter(area.cables))),
                          ...area.markers.map(
                            (marker) => Positioned(
                              left: marker.x * constraints.maxWidth - 17,
                              top: marker.y * constraints.maxHeight - 17,
                              width: 34,
                              height: 34,
                              child: _Marker(marker: marker, onTap: () => _showMarker(marker)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showMarker(FloorMapMarker marker) {
    final monitor = marker.monitor;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.navy900,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(marker.label.isEmpty ? 'Marker' : marker.label, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            if (monitor != null) ...[
              Text('${monitor['name']} · ${monitor['host']}', style: const TextStyle(color: AppColors.textMuted)),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: [
                  _Pill(
                    monitor['status']?.toString().toUpperCase() ?? 'UNKNOWN',
                    _statusColor(monitor['status']?.toString()),
                  ),
                  if (monitor['temperature_c'] != null)
                    _Pill(
                      '${monitor['temperature_c']}°C',
                      monitor['temperature_alert'] == true ? AppColors.red : AppColors.amber,
                    ),
                ],
              ),
            ],
            if (marker.notes?.isNotEmpty == true) ...[
              const SizedBox(height: 12),
              Text(marker.notes!, style: const TextStyle(color: AppColors.textMuted)),
            ],
          ],
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.summary});
  final FloorMapSummary summary;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 12),
        color: AppColors.navy900,
        child: Row(
          children: [
            _Stat('${summary.cctv}', 'CCTV', AppColors.green),
            _Stat('${summary.switches}', 'SWITCH', AppColors.amber),
            _Stat('${summary.online}', 'ONLINE', AppColors.cyan),
            _Stat('${summary.attention}', 'ALERT', summary.attention > 0 ? AppColors.red : AppColors.textMuted),
          ],
        ),
      );
}

class _Marker extends StatelessWidget {
  const _Marker({required this.marker, required this.onTap});
  final FloorMapMarker marker;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = marker.monitor?['status']?.toString();
    final color = status == 'offline'
        ? AppColors.red
        : status == 'degraded'
            ? AppColors.amber
            : marker.type == 'cctv'
                ? AppColors.green
                : AppColors.amber;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: color,
            shape: marker.type == 'cctv' ? BoxShape.circle : BoxShape.rectangle,
            borderRadius: marker.type == 'cctv' ? null : BorderRadius.circular(8),
            border: Border.all(color: Colors.white, width: 2),
          ),
          child: Icon(marker.type == 'cctv' ? Icons.videocam_rounded : Icons.router_rounded, color: Colors.white, size: 18),
        ),
      ),
    );
  }
}

class _CablePainter extends CustomPainter {
  _CablePainter(this.cables);
  final List<FloorMapCable> cables;

  @override
  void paint(Canvas canvas, Size size) {
    for (final cable in cables) {
      if (cable.points.length < 2) continue;
      final color = cable.type == 'lan'
          ? AppColors.red
          : cable.type == 'power'
              ? AppColors.blue
              : AppColors.green;
      final paint = Paint()
        ..color = color
        ..strokeWidth = 3
        ..style = PaintingStyle.stroke;
      final path = Path()..moveTo(cable.points.first['x']! * size.width, cable.points.first['y']! * size.height);
      for (final point in cable.points.skip(1)) {
        path.lineTo(point['x']! * size.width, point['y']! * size.height);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _CablePainter oldDelegate) => oldDelegate.cables != cables;
}

class _Grid extends StatelessWidget {
  const _Grid();

  @override
  Widget build(BuildContext context) => CustomPaint(painter: _GridPainter(), child: const SizedBox.expand());
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = AppColors.border..strokeWidth = 1;
    for (double x = 0; x < size.width; x += 40) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += 40) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _GridPainter oldDelegate) => false;
}

class _Pill extends StatelessWidget {
  const _Pill(this.text, this.color);
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(color: color.withValues(alpha: .15), borderRadius: BorderRadius.circular(99)),
        child: Text(text, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w900)),
      );
}

Color _statusColor(String? status) => status == 'online'
    ? AppColors.green
    : status == 'offline'
        ? AppColors.red
        : status == 'degraded'
            ? AppColors.amber
            : AppColors.textMuted;

class _Retry extends StatelessWidget {
  const _Retry({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_rounded, size: 46, color: AppColors.red),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textMuted)),
              const SizedBox(height: 14),
              FilledButton(onPressed: onRetry, child: const Text('Coba lagi')),
            ],
          ),
        ),
      );
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => const Center(
        child: Text('Belum ada denah yang dipublikasikan.', style: TextStyle(color: AppColors.textMuted)),
      );
}
