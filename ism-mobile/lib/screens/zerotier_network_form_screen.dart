import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../models/zerotier_network.dart';
import '../services/zerotier_service.dart';

class ZeroTierNetworkFormScreen extends StatefulWidget {
  const ZeroTierNetworkFormScreen({
    super.key,
    required this.service,
    this.network,
  });
  final ZeroTierService service;
  final ZeroTierNetwork? network;

  @override
  State<ZeroTierNetworkFormScreen> createState() =>
      _ZeroTierNetworkFormScreenState();
}

class _ZeroTierNetworkFormScreenState
    extends State<ZeroTierNetworkFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _networkId;
  late final TextEditingController _label;
  late final TextEditingController _notes;
  bool _saving = false;
  String? _error;

  bool get isEdit => widget.network != null;

  @override
  void initState() {
    super.initState();
    _networkId = TextEditingController(text: widget.network?.networkId ?? '');
    _label = TextEditingController(text: widget.network?.label ?? '');
    _notes = TextEditingController(text: widget.network?.notes ?? '');
  }

  @override
  void dispose() {
    _networkId.dispose();
    _label.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final payload = <String, dynamic>{
      if (isEdit) 'id': widget.network!.id,
      if (!isEdit) 'network_id': _networkId.text.trim(),
      'label': _label.text.trim(),
      'notes': _notes.text.trim(),
    };
    try {
      isEdit
          ? await widget.service.updateNetwork(payload)
          : await widget.service.createNetwork(payload);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(isEdit ? 'Edit Network ZeroTier' : 'Tambah Network ZeroTier'),
    ),
    body: Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          TextFormField(
            controller: _networkId,
            readOnly: isEdit,
            enabled: !isEdit,
            maxLength: 16,
            style: const TextStyle(fontFamily: 'monospace'),
            decoration: InputDecoration(
              labelText: 'Network ID',
              hintText: '8056c2e21c000001',
              prefixIcon: const Icon(Icons.diamond_outlined),
              helperText: isEdit
                  ? 'Network ID tidak bisa diubah. Hapus lalu tambah ulang jika perlu ganti.'
                  : null,
            ),
            validator: (value) {
              if (isEdit) return null;
              final trimmed = (value ?? '').trim();
              if (!RegExp(r'^[a-fA-F0-9]{10,16}$').hasMatch(trimmed)) {
                return 'Network ID harus hex 10-16 karakter';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _label,
            maxLength: 150,
            decoration: const InputDecoration(
              labelText: 'Label',
              prefixIcon: Icon(Icons.label_outline_rounded),
            ),
            validator: (value) => value == null || value.trim().isEmpty
                ? 'Label wajib diisi'
                : null,
          ),
          TextFormField(
            controller: _notes,
            minLines: 2,
            maxLines: 4,
            maxLength: 500,
            decoration: const InputDecoration(
              labelText: 'Catatan',
              alignLabelWithHint: true,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.red.withValues(alpha: .1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _error!,
                style: const TextStyle(color: AppColors.red, fontSize: 11),
              ),
            ),
          ],
          const SizedBox(height: 18),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text(isEdit ? 'Simpan perubahan' : 'Tambah network'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    ),
  );
}
