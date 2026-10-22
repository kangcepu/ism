import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../core/formatters.dart';
import '../models/zerotier_network.dart';
import '../services/zerotier_service.dart';
import '../widgets/loading_skeleton.dart';

class ZeroTierMembersScreen extends StatefulWidget {
  const ZeroTierMembersScreen({
    super.key,
    required this.service,
    required this.network,
    required this.isAdmin,
  });
  final ZeroTierService service;
  final ZeroTierNetwork network;
  final bool isAdmin;

  @override
  State<ZeroTierMembersScreen> createState() => _ZeroTierMembersScreenState();
}

class _ZeroTierMembersScreenState extends State<ZeroTierMembersScreen> {
  List<ZeroTierMember> _members = const [];
  bool _loading = true;
  String? _error;
  final Set<String> _busyMemberIds = {};

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
      final members = await widget.service.fetchMembers(
        widget.network.networkId,
      );
      if (!mounted) return;
      setState(() {
        _members = members;
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

  Future<void> _toggleAuthorized(ZeroTierMember member) async {
    if (member.authorized) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Deauthorize device?'),
          content: Text(
            '"${member.displayName}" akan langsung kehilangan akses ke network ini.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Batal'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Deauthorize'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }

    setState(() => _busyMemberIds.add(member.id));
    try {
      final updated = await widget.service.setMemberAuthorized(
        widget.network.networkId,
        member.id,
        !member.authorized,
      );
      if (!mounted) return;
      setState(() {
        _members = _members
            .map((item) => item.id == member.id ? updated : item)
            .toList();
      });
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal mengubah status: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _busyMemberIds.remove(member.id));
    }
  }

  Future<void> _deleteMember(ZeroTierMember member) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Hapus member?'),
        content: Text(
          '"${member.displayName}" akan dihapus dari network. Device harus join ulang dan di-authorize lagi kalau ingin kembali.',
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

    setState(() => _busyMemberIds.add(member.id));
    try {
      await widget.service.deleteMember(widget.network.networkId, member.id);
      if (!mounted) return;
      setState(() {
        _members = _members.where((item) => item.id != member.id).toList();
      });
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Gagal menghapus: $error')));
      }
    } finally {
      if (mounted) setState(() => _busyMemberIds.remove(member.id));
    }
  }

  Future<void> _renameMember(ZeroTierMember member) async {
    final nameController = TextEditingController(text: member.name);
    final formKey = GlobalKey<FormState>();
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ubah nama perangkat'),
        content: Form(
          key: formKey,
          child: TextFormField(
            controller: nameController,
            autofocus: true,
            maxLength: 100,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Nama perangkat',
              hintText: 'Contoh: Mobile Khalid',
            ),
            validator: (value) => value == null || value.trim().isEmpty
                ? 'Nama perangkat wajib diisi.'
                : null,
            onFieldSubmitted: (_) {
              if (formKey.currentState!.validate()) {
                Navigator.of(context).pop(nameController.text.trim());
              }
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.of(context).pop(nameController.text.trim());
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
    nameController.dispose();
    if (name == null || name == member.name) return;

    setState(() => _busyMemberIds.add(member.id));
    try {
      final updated = await widget.service.renameMember(
        widget.network.networkId,
        member.id,
        name,
      );
      if (!mounted) return;
      setState(() {
        _members = _members
            .map((item) => item.id == member.id ? updated : item)
            .toList();
      });
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Gagal mengubah nama: $error')));
      }
    } finally {
      if (mounted) setState(() => _busyMemberIds.remove(member.id));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.network.label),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(20),
        child: Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(
            widget.network.networkId,
            style: const TextStyle(
              fontFamily: 'monospace',
              color: AppColors.textMuted,
              fontSize: 11,
            ),
          ),
        ),
      ),
    ),
    body: RefreshIndicator(
      onRefresh: _load,
      child: _loading
          ? ListView(
              padding: const EdgeInsets.all(18),
              children: List.generate(
                4,
                (_) => const Padding(
                  padding: EdgeInsets.only(bottom: 10),
                  child: LoadingSkeleton(height: 92),
                ),
              ),
            )
          : _error != null
          ? ListView(
              padding: const EdgeInsets.all(18),
              children: [_ErrorState(message: _error!, onRetry: _load)],
            )
          : _members.isEmpty
          ? ListView(
              padding: const EdgeInsets.all(18),
              children: const [_EmptyMembers()],
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(18, 6, 18, 24),
              itemCount: _members.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final member = _members[index];
                return _MemberCard(
                  member: member,
                  isAdmin: widget.isAdmin,
                  busy: _busyMemberIds.contains(member.id),
                  onRename: () => _renameMember(member),
                  onToggleAuthorized: () => _toggleAuthorized(member),
                  onDelete: () => _deleteMember(member),
                );
              },
            ),
    ),
  );
}

class _MemberCard extends StatelessWidget {
  const _MemberCard({
    required this.member,
    required this.isAdmin,
    required this.busy,
    required this.onRename,
    required this.onToggleAuthorized,
    required this.onDelete,
  });

  final ZeroTierMember member;
  final bool isAdmin;
  final bool busy;
  final VoidCallback onRename;
  final VoidCallback onToggleAuthorized;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final statusColor = member.online ? AppColors.green : AppColors.textMuted;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: statusColor,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    member.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                ),
                if (isAdmin)
                  IconButton(
                    tooltip: 'Ubah nama perangkat',
                    onPressed: busy ? null : onRename,
                    icon: const Icon(Icons.edit_outlined, size: 18),
                  ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color:
                        (member.authorized ? AppColors.green : AppColors.amber)
                            .withValues(alpha: .13),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    member.authorized ? 'Authorized' : 'Menunggu',
                    style: TextStyle(
                      color: member.authorized
                          ? AppColors.green
                          : AppColors.amber,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              member.id,
              style: const TextStyle(
                fontFamily: 'monospace',
                color: AppColors.textMuted,
                fontSize: 10,
              ),
            ),
            if (member.description.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                member.description,
                style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 11,
                ),
              ),
            ],
            const SizedBox(height: 10),
            Wrap(
              spacing: 14,
              runSpacing: 4,
              children: [
                _InfoChip(
                  icon: Icons.lan_outlined,
                  label: member.ipAssignments.isEmpty
                      ? '-'
                      : member.ipAssignments.join(', '),
                ),
                _InfoChip(
                  icon: Icons.public_rounded,
                  label: member.physicalAddress ?? '-',
                ),
                _InfoChip(
                  icon: Icons.schedule_rounded,
                  label: relativeTime(member.lastOnlineAt),
                ),
                if (member.version != null)
                  _InfoChip(
                    icon: Icons.info_outline_rounded,
                    label: 'v${member.version}',
                  ),
              ],
            ),
            if (isAdmin) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: busy ? null : onToggleAuthorized,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: member.authorized
                            ? AppColors.amber
                            : AppColors.green,
                        side: BorderSide(
                          color:
                              (member.authorized
                                      ? AppColors.amber
                                      : AppColors.green)
                                  .withValues(alpha: .45),
                        ),
                      ),
                      child: busy
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(
                              member.authorized ? 'Deauthorize' : 'Authorize',
                            ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: busy ? null : onDelete,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.red,
                        side: BorderSide(
                          color: AppColors.red.withValues(alpha: .45),
                        ),
                      ),
                      child: const Text('Hapus'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 13, color: AppColors.textMuted),
      const SizedBox(width: 4),
      Text(
        label,
        style: const TextStyle(color: AppColors.textMuted, fontSize: 10.5),
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

class _EmptyMembers extends StatelessWidget {
  const _EmptyMembers();
  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.devices_other_rounded,
            size: 48,
            color: AppColors.textMuted,
          ),
          SizedBox(height: 14),
          Text(
            'Belum ada device',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          SizedBox(height: 5),
          Text(
            'Device yang join network ini akan muncul di sini.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
        ],
      ),
    ),
  );
}
