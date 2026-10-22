import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../models/zerotier_network.dart';
import '../services/zerotier_service.dart';
import '../widgets/loading_skeleton.dart';
import 'zerotier_members_screen.dart';
import 'zerotier_network_form_screen.dart';

class ZeroTierScreen extends StatefulWidget {
  const ZeroTierScreen({super.key, required this.service, required this.isAdmin});
  final ZeroTierService service;
  final bool isAdmin;

  @override
  State<ZeroTierScreen> createState() => _ZeroTierScreenState();
}

class _ZeroTierScreenState extends State<ZeroTierScreen> {
  List<ZeroTierNetwork> _networks = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final networks = await widget.service.fetchNetworks();
      if (!mounted) return;
      setState(() {
        _networks = networks;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  Future<void> _openForm({ZeroTierNetwork? network}) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            ZeroTierNetworkFormScreen(service: widget.service, network: network),
      ),
    );
    if (changed == true) _load();
  }

  Future<void> _delete(ZeroTierNetwork network) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Hapus network?'),
        content: Text(
          '"${network.label}" akan dihapus dari daftar pengelolaan. Network tetap ada di akun ZeroTier kamu.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await widget.service.deleteNetwork(network.id);
      _load();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Gagal menghapus: $error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('ZeroTier')),
    floatingActionButton: widget.isAdmin
        ? FloatingActionButton.extended(
            onPressed: () => _openForm(),
            backgroundColor: AppColors.blue,
            foregroundColor: Colors.white,
            icon: const Icon(Icons.add_rounded),
            label: const Text(
              'Tambah Network',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          )
        : null,
    body: RefreshIndicator(
      onRefresh: _load,
      child: _loading
          ? ListView(
              padding: const EdgeInsets.all(18),
              children: List.generate(
                3,
                (_) => const Padding(
                  padding: EdgeInsets.only(bottom: 10),
                  child: LoadingSkeleton(height: 118),
                ),
              ),
            )
          : _error != null
          ? ListView(
              padding: const EdgeInsets.all(18),
              children: [_ErrorState(message: _error!, onRetry: _load)],
            )
          : _networks.isEmpty
          ? ListView(
              padding: const EdgeInsets.all(18),
              children: const [_EmptyNetworks()],
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 96),
              itemCount: _networks.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final network = _networks[index];
                return _NetworkCard(
                  network: network,
                  isAdmin: widget.isAdmin,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ZeroTierMembersScreen(
                        service: widget.service,
                        network: network,
                        isAdmin: widget.isAdmin,
                      ),
                    ),
                  ),
                  onEdit: () => _openForm(network: network),
                  onDelete: () => _delete(network),
                );
              },
            ),
    ),
  );
}

class _NetworkCard extends StatelessWidget {
  const _NetworkCard({
    required this.network,
    required this.isAdmin,
    required this.onTap,
    required this.onEdit,
    required this.onDelete,
  });

  final ZeroTierNetwork network;
  final bool isAdmin;
  final VoidCallback onTap;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final summary = network.summary;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: AppColors.cyan.withValues(alpha: .13),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.hub_rounded,
                      size: 18,
                      color: AppColors.cyan,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          network.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                          ),
                        ),
                        Text(
                          network.networkId,
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            color: AppColors.textMuted,
                            fontSize: 10,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (isAdmin)
                    PopupMenuButton<String>(
                      icon: const Icon(
                        Icons.more_vert_rounded,
                        color: AppColors.textMuted,
                        size: 20,
                      ),
                      onSelected: (value) {
                        if (value == 'edit') onEdit();
                        if (value == 'delete') onDelete();
                      },
                      itemBuilder: (_) => const [
                        PopupMenuItem(value: 'edit', child: Text('Edit')),
                        PopupMenuItem(value: 'delete', child: Text('Hapus')),
                      ],
                    ),
                ],
              ),
              if (network.notes != null && network.notes!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  network.notes!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
                ),
              ],
              const SizedBox(height: 10),
              if (summary.reachable)
                Row(
                  children: [
                    _StatDot(color: AppColors.green, label: '${summary.onlineCount ?? 0} online'),
                    const SizedBox(width: 12),
                    Text(
                      '${summary.authorizedCount ?? 0}/${summary.memberCount ?? 0} authorized',
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                )
              else
                Row(
                  children: [
                    const Icon(
                      Icons.warning_amber_rounded,
                      size: 14,
                      color: AppColors.amber,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        summary.message ?? 'Status belum dimuat',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.amber,
                          fontSize: 10.5,
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

class _StatDot extends StatelessWidget {
  const _StatDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 7,
        height: 7,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
      const SizedBox(width: 6),
      Text(
        label,
        style: TextStyle(color: color, fontSize: 10.5, fontWeight: FontWeight.w700),
      ),
    ],
  );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.cloud_off_rounded,
            size: 40,
            color: AppColors.textMuted,
          ),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 14),
          OutlinedButton(onPressed: onRetry, child: const Text('Coba lagi')),
        ],
      ),
    ),
  );
}

class _EmptyNetworks extends StatelessWidget {
  const _EmptyNetworks();
  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.diamond_outlined, size: 48, color: AppColors.textMuted),
          SizedBox(height: 14),
          Text(
            'Belum ada network ZeroTier',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          SizedBox(height: 5),
          Text(
            'Tambahkan Network ID untuk mulai mengelola member dari sini.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
        ],
      ),
    ),
  );
}
