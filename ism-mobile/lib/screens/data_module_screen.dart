import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';

class DataModuleScreen extends StatefulWidget {
  const DataModuleScreen({
    super.key,
    required this.title,
    required this.endpoint,
    required this.client,
  });
  final String title;
  final String endpoint;
  final ApiClient client;

  @override
  State<DataModuleScreen> createState() => _DataModuleScreenState();
}

class _DataModuleScreenState extends State<DataModuleScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final response = await widget.client.get(widget.endpoint);
    final raw = response.items.isNotEmpty
        ? response.items
        : (response.data['items'] as List? ?? const []);
    if (raw.isNotEmpty) {
      return raw
          .whereType<Map>()
          .map((item) => item.cast<String, dynamic>())
          .toList();
    }
    return response.data.isEmpty ? const [] : [response.data];
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.title)),
    body: RefreshIndicator(
      onRefresh: () async => setState(() => _future = _load()),
      child: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return ListView(
              children: [
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    snapshot.error.toString(),
                    style: const TextStyle(color: AppColors.red),
                  ),
                ),
              ],
            );
          }
          final items = snapshot.requireData;
          if (items.isEmpty) {
            return ListView(
              children: const [
                Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Belum ada data.',
                    style: TextStyle(color: AppColors.textMuted),
                  ),
                ),
              ],
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final item = items[index];
              final title =
                  item['name'] ??
                  item['title'] ??
                  item['code'] ??
                  item['hostname'] ??
                  'Data ${index + 1}';
              final details = item.entries
                  .where((entry) => entry.key != 'name' && entry.key != 'title')
                  .take(3)
                  .map((entry) => '${entry.key}: ${entry.value}')
                  .join('\n');
              return Card(
                child: ListTile(
                  title: Text(
                    title.toString(),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(
                    details.isEmpty ? '-' : details,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                ),
              );
            },
          );
        },
      ),
    ),
  );
}
