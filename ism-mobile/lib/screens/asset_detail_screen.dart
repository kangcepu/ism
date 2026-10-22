import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../core/item_lifecycle.dart';
import '../models/asset.dart';
import '../models/hr_employee.dart';
import '../services/assets_service.dart';
import '../services/hr_directory_service.dart';
import 'asset_form_screen.dart';

class AssetDetailScreen extends StatefulWidget {
  const AssetDetailScreen({
    super.key,
    required this.service,
    required this.asset,
    required this.isAdmin,
  });
  final AssetsService service;
  final Asset asset;
  final bool isAdmin;

  @override
  State<AssetDetailScreen> createState() => _AssetDetailScreenState();
}

class _AssetDetailScreenState extends State<AssetDetailScreen> {
  late Future<Asset> _assetFuture;
  late final HrDirectoryService _hrService = HrDirectoryService(
    widget.service.client,
  );
  bool _actionBusy = false;

  @override
  void initState() {
    super.initState();
    _assetFuture = widget.service.fetchAsset(widget.asset.id);
  }

  Future<void> _reload() async {
    setState(() => _assetFuture = widget.service.fetchAsset(widget.asset.id));
    try {
      await _assetFuture;
    } catch (_) {
      // FutureBuilder renders the request error in the screen.
    }
  }

  Future<void> _openEdit() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            AssetFormScreen(service: widget.service, asset: widget.asset),
      ),
    );
    if (changed == true) await _reload();
  }

  Future<void> _runAction(Future<Asset> Function() action) async {
    setState(() => _actionBusy = true);
    try {
      final updated = await action();
      if (!mounted) return;
      setState(() => _assetFuture = Future.value(updated));
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _openAssignSheet() async {
    final picked = await showModalBottomSheet<HrEmployee>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.navy900,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _HrAssignSheet(hrService: _hrService),
    );
    if (picked == null) return;
    await _runAction(
      () => widget.service.assignHr(
        assetId: widget.asset.id,
        name: picked.fullname,
        code: picked.employeeCode,
        company: picked.company,
      ),
    );
  }

  Future<void> _checkin() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Kosongkan pemakai?'),
        content: const Text(
          'Aset akan kembali ke stock (status Available) dan tercatat di riwayat.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Kosongkan'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _runAction(() => widget.service.checkin(assetId: widget.asset.id));
  }

  Future<void> _openStatusSheet(String currentStatus) async {
    final status = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.navy900,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _StatusPickerSheet(current: currentStatus),
    );
    if (status == null || status == currentStatus) return;
    await _runAction(
      () => widget.service.setStatus(assetId: widget.asset.id, status: status),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Detail aset'),
      actions: [
        if (widget.isAdmin)
          IconButton(
            onPressed: _openEdit,
            tooltip: 'Edit aset',
            icon: const Icon(Icons.edit_outlined),
          ),
      ],
    ),
    body: FutureBuilder<Asset>(
      future: _assetFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          final message = snapshot.error is ApiException
              ? (snapshot.error! as ApiException).message
              : 'Detail aset tidak dapat dimuat.';
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.cloud_off_rounded,
                    color: AppColors.textMuted,
                    size: 44,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.textMuted),
                  ),
                  TextButton(
                    onPressed: _reload,
                    child: const Text('Coba lagi'),
                  ),
                ],
              ),
            ),
          );
        }
        final asset = snapshot.data!;
        final details = <(String, String?)>[
          ('Kode aset', asset.code),
          ('Tipe', asset.category.itemType),
          ('Kategori', asset.category.name),
          ('Lokasi', asset.location.name),
          (
            'Kondisi',
            asset.conditionGrade != null
                ? (conditionLabels[asset.conditionGrade] ??
                      asset.conditionGrade)
                : null,
          ),
          ('MAC Address', asset.macAddress),
          ('Serial Number', asset.serialNumber),
        ];
        return RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 28),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Row(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: AppColors.blue.withValues(alpha: .14),
                          borderRadius: BorderRadius.circular(15),
                        ),
                        child: const Icon(
                          Icons.inventory_2_outlined,
                          color: AppColors.cyan,
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(
                          asset.name,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              _StatusCard(
                status: asset.status,
                busy: _actionBusy,
                editable: widget.isAdmin,
                onChange: () => _openStatusSheet(asset.status),
              ),
              const SizedBox(height: 14),
              _AssigneeCard(
                asset: asset,
                busy: _actionBusy,
                editable: widget.isAdmin,
                onAssign: _openAssignSheet,
                onCheckin: _checkin,
              ),
              const SizedBox(height: 14),
              Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 6,
                  ),
                  child: Column(
                    children: details
                        .where((detail) => detail.$2 != null)
                        .map(
                          (detail) =>
                              _DetailRow(label: detail.$1, value: detail.$2!),
                        )
                        .toList(),
                  ),
                ),
              ),
              if (asset.description != null) ...[
                const SizedBox(height: 14),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: _DetailSection(
                      title: 'Deskripsi',
                      value: asset.description!,
                    ),
                  ),
                ),
              ],
              if (asset.photos.isNotEmpty) ...[
                const SizedBox(height: 14),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: _AssetPhotoGallery(
                      photos: asset.photos,
                      authToken: widget.service.client.token,
                    ),
                  ),
                ),
              ],
              if (asset.customData.isNotEmpty) ...[
                const SizedBox(height: 14),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Field tambahan',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 8),
                        ...asset.customData.entries.map(
                          (entry) =>
                              _DetailRow(label: entry.key, value: entry.value),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    ),
  );
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.status,
    required this.busy,
    required this.editable,
    required this.onChange,
  });
  final String status;
  final bool busy;
  final bool editable;
  final VoidCallback onChange;

  @override
  Widget build(BuildContext context) {
    final meta = statusMetaFor(status);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(meta.$3, color: meta.$2, size: 22),
            const SizedBox(width: 10),
            const Text('Status:', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                meta.$1,
                style: TextStyle(color: meta.$2, fontWeight: FontWeight.w800),
              ),
            ),
            if (editable)
              TextButton(
                onPressed: busy ? null : onChange,
                child: const Text('Ubah'),
              ),
          ],
        ),
      ),
    );
  }
}

class _AssigneeCard extends StatelessWidget {
  const _AssigneeCard({
    required this.asset,
    required this.busy,
    required this.editable,
    required this.onAssign,
    required this.onCheckin,
  });
  final Asset asset;
  final bool busy;
  final bool editable;
  final VoidCallback onAssign;
  final VoidCallback onCheckin;

  @override
  Widget build(BuildContext context) {
    final assignee = asset.assignee;
    final hasAssignee = assignee != null || (asset.assignedTo?.isNotEmpty ?? false);
    final frozen = asset.status == 'retired' || asset.status == 'disposed';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Pemakai Perangkat',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
            ),
            const SizedBox(height: 10),
            if (hasAssignee)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.person_rounded,
                    color: AppColors.blue,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          assignee?.name ?? asset.assignedTo ?? '-',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        if (assignee?.subtitle.isNotEmpty == true)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              assignee!.subtitle,
                              style: const TextStyle(
                                color: AppColors.textMuted,
                                fontSize: 11.5,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              )
            else
              const Row(
                children: [
                  Icon(
                    Icons.inbox_outlined,
                    color: AppColors.textMuted,
                    size: 18,
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Belum ada pemakai (stock).',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 12.5),
                  ),
                ],
              ),
            if (editable) ...[
              const SizedBox(height: 12),
              if (frozen)
                Text(
                  'Ubah status dari ${statusMetaFor(asset.status).$1} dulu ke Available untuk menetapkan pemakai.',
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 11.5),
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: busy ? null : onAssign,
                        icon: const Icon(Icons.person_search_rounded, size: 18),
                        label: Text(hasAssignee ? 'Ganti pemakai' : 'Tetapkan pemakai'),
                      ),
                    ),
                    if (hasAssignee) ...[
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: busy ? null : onCheckin,
                        child: const Text('Kosongkan'),
                      ),
                    ],
                  ],
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Search-and-pick sheet for setting the pemakai from the HR directory.
/// Mirrors the web app's Assignment tab HR picker, just as a bottom sheet.
class _HrAssignSheet extends StatefulWidget {
  const _HrAssignSheet({required this.hrService});
  final HrDirectoryService hrService;

  @override
  State<_HrAssignSheet> createState() => _HrAssignSheetState();
}

class _HrAssignSheetState extends State<_HrAssignSheet> {
  final _query = TextEditingController();
  Timer? _debounce;
  List<HrEmployee> _results = const [];
  bool _searching = false;
  bool _hrEnabled = true;
  bool _checkedEnabled = false;

  @override
  void initState() {
    super.initState();
    widget.hrService.isEnabled().then((enabled) {
      if (mounted) setState(() { _hrEnabled = enabled; _checkedEnabled = true; });
    }).catchError((_) {
      if (mounted) setState(() { _hrEnabled = true; _checkedEnabled = true; });
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    final query = value.trim();
    if (query.length < 2) {
      setState(() => _results = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _searching = true);
      try {
        final results = await widget.hrService.search(query);
        if (mounted) setState(() { _results = results; _searching = false; });
      } catch (_) {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(
      left: 18,
      right: 18,
      top: 18,
      bottom: MediaQuery.of(context).viewInsets.bottom + 18,
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Cari pemakai',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
        const SizedBox(height: 12),
        if (_checkedEnabled && !_hrEnabled)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.amber.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Text(
              'Integrasi HR belum aktif. Atur pemakai lewat aplikasi web.',
              style: TextStyle(color: AppColors.amber, fontSize: 12),
            ),
          )
        else ...[
          TextField(
            controller: _query,
            autofocus: true,
            onChanged: _onChanged,
            decoration: InputDecoration(
              hintText: 'Ketik nama karyawan…',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _searching
                  ? const Padding(
                      padding: EdgeInsets.all(14),
                      child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 320),
            child: _results.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Text(
                      _query.text.trim().length < 2
                          ? 'Ketik minimal 2 huruf untuk mencari.'
                          : (_searching ? 'Mencari…' : 'Tidak ada hasil.'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12.5),
                    ),
                  )
                : ListView.separated(
                    shrinkWrap: true,
                    itemCount: _results.length,
                    separatorBuilder: (_, _) => const Divider(height: 1, color: AppColors.border),
                    itemBuilder: (context, index) {
                      final employee = _results[index];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.person_outline_rounded, color: AppColors.cyan),
                        title: Text(employee.fullname),
                        subtitle: employee.subtitle.isEmpty ? null : Text(employee.subtitle),
                        onTap: () => Navigator.pop(context, employee),
                      );
                    },
                  ),
          ),
        ],
      ],
    ),
  );
}

class _StatusPickerSheet extends StatelessWidget {
  const _StatusPickerSheet({required this.current});
  final String current;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 18),
            child: Text(
              'Ubah status',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
            ),
          ),
          const SizedBox(height: 6),
          ...statusOrder.map((status) {
            final meta = statusMetaFor(status);
            final selected = status == current;
            return ListTile(
              leading: Icon(meta.$3, color: meta.$2),
              title: Text(meta.$1),
              trailing: selected ? const Icon(Icons.check_rounded, color: AppColors.cyan) : null,
              onTap: () => Navigator.pop(context, status),
            );
          }),
        ],
      ),
    ),
  );
}

class _AssetPhotoGallery extends StatelessWidget {
  const _AssetPhotoGallery({required this.photos, required this.authToken});
  final List<AssetPhoto> photos;
  // Photos are streamed through api/asset_photo_file.php (never a direct
  // storage link), same as every other API call - so Image.network needs
  // the bearer token attached explicitly; it doesn't get it for free the way
  // ApiClient's own requests do.
  final String? authToken;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        'Foto aset (${photos.length})',
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 12),
      GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: photos.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 1.25,
        ),
        itemBuilder: (context, index) {
          final photo = photos[index];
          return ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.network(
              photo.resolvedUrl,
              headers: authToken != null ? {'Authorization': 'Bearer $authToken'} : null,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => Container(
                color: AppColors.blue.withValues(alpha: .12),
                child: const Icon(
                  Icons.broken_image_outlined,
                  color: AppColors.textMuted,
                ),
              ),
            ),
          );
        },
      ),
    ],
  );
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 11),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 118,
          child: Text(
            label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}

class _DetailSection extends StatelessWidget {
  const _DetailSection({required this.title, required this.value});
  final String title;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
      ),
      const SizedBox(height: 6),
      Text(value, style: const TextStyle(fontSize: 13, height: 1.45)),
    ],
  );
}
