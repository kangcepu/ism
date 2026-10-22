import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../core/item_lifecycle.dart';
import '../models/asset.dart';
import '../services/assets_service.dart';

class AssetFormScreen extends StatefulWidget {
  const AssetFormScreen({super.key, required this.service, this.asset});
  final AssetsService service;
  final Asset? asset;

  @override
  State<AssetFormScreen> createState() => _AssetFormScreenState();
}

class _AssetFormScreenState extends State<AssetFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController(
    text: 'ITEM-${DateTime.now().millisecondsSinceEpoch}',
  );
  final _name = TextEditingController();
  final _macAddress = TextEditingController();
  final _serialNumber = TextEditingController();
  final _description = TextEditingController();
  AssetOptions? _options;
  int? _categoryId;
  int? _locationId;
  String? _conditionGrade;
  bool _isLoading = true;
  bool _isSaving = false;
  String? _error;
  XFile? _pickedPhoto;
  final _picker = ImagePicker();

  bool get _isEdit => widget.asset != null;

  @override
  void initState() {
    super.initState();
    final asset = widget.asset;
    if (asset != null) {
      _code.text = asset.code;
      _name.text = asset.name;
      _macAddress.text = asset.macAddress ?? '';
      _serialNumber.text = asset.serialNumber ?? '';
      _description.text = asset.description ?? '';
      _categoryId = asset.category.id > 0 ? asset.category.id : null;
      _locationId = asset.location.id > 0 ? asset.location.id : null;
      _conditionGrade = asset.conditionGrade;
    }
    _loadOptions();
  }

  @override
  void dispose() {
    _code.dispose();
    _name.dispose();
    _macAddress.dispose();
    _serialNumber.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _loadOptions() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final options = await widget.service.fetchOptions();
      if (!mounted) return;
      setState(() => _options = options);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _save() async {
    if (_isSaving || !_formKey.currentState!.validate()) return;
    if (_categoryId == null || _locationId == null) {
      setState(() => _error = 'Kategori dan lokasi wajib dipilih.');
      return;
    }
    setState(() {
      _isSaving = true;
      _error = null;
    });
    try {
      final payload = {
        'code': _code.text.trim(),
        'name': _name.text.trim(),
        'category_id': _categoryId,
        'location_id': _locationId,
        'condition_grade': _conditionGrade,
        'mac_address': _macAddress.text.trim(),
        'serial_number': _serialNumber.text.trim(),
        'description': _description.text.trim(),
      };
      final asset = _isEdit
          ? await widget.service.updateAsset({
              ...payload,
              'id': widget.asset!.id,
            })
          : await widget.service.createAsset(payload);
      if (_pickedPhoto != null) {
        await widget.service.uploadPhoto(
          assetId: asset.id,
          filePath: _pickedPhoto!.path,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _pickPhoto(ImageSource source) async {
    try {
      final photo = await _picker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 1920,
      );
      if (photo != null && mounted) setState(() => _pickedPhoto = photo);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Foto tidak dapat dipilih. Coba lagi.');
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(_isEdit ? 'Edit aset' : 'Tambah aset')),
    body: _isLoading
        ? const Center(child: CircularProgressIndicator())
        : _error != null && _options == null
        ? Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.textMuted),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: _loadOptions,
                    child: const Text('Coba lagi'),
                  ),
                ],
              ),
            ),
          )
        : Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 28),
              children: [
                const Text(
                  'INFORMASI ASET',
                  style: TextStyle(
                    color: AppColors.cyan,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _code,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                    labelText: 'Kode aset',
                    prefixIcon: Icon(Icons.qr_code_rounded),
                  ),
                  validator: (value) => value == null || value.trim().isEmpty
                      ? 'Kode aset wajib diisi'
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Nama aset',
                    prefixIcon: Icon(Icons.inventory_2_outlined),
                  ),
                  validator: (value) => value == null || value.trim().isEmpty
                      ? 'Nama aset wajib diisi'
                      : null,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<int>(
                  initialValue: _categoryId,
                  decoration: const InputDecoration(
                    labelText: 'Kategori',
                    prefixIcon: Icon(Icons.category_outlined),
                  ),
                  items: _options!.categories
                      .map(
                        (category) => DropdownMenuItem(
                          value: category.id,
                          child: Text(category.name ?? '-'),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => setState(() => _categoryId = value),
                  validator: (value) =>
                      value == null ? 'Kategori wajib dipilih' : null,
                ),
                if (_categoryId != null) ...[
                  const SizedBox(height: 7),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Text(
                      'Tipe: ${_options!.categories.where((category) => category.id == _categoryId).firstOrNull?.itemType ?? '-'}',
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 11,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                DropdownButtonFormField<int>(
                  initialValue: _locationId,
                  decoration: const InputDecoration(
                    labelText: 'Lokasi',
                    prefixIcon: Icon(Icons.location_on_outlined),
                  ),
                  items: _options!.locations
                      .map(
                        (location) => DropdownMenuItem(
                          value: location.id,
                          child: Text(location.name ?? '-'),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => setState(() => _locationId = value),
                  validator: (value) =>
                      value == null ? 'Lokasi wajib dipilih' : null,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String?>(
                  initialValue: _conditionGrade,
                  decoration: const InputDecoration(
                    labelText: 'Kondisi',
                    prefixIcon: Icon(Icons.health_and_safety_outlined),
                  ),
                  items: [
                    const DropdownMenuItem(
                      value: null,
                      child: Text('Tidak diketahui'),
                    ),
                    ...conditionOrder.map(
                      (grade) => DropdownMenuItem(
                        value: grade,
                        child: Text(conditionLabels[grade]!),
                      ),
                    ),
                  ],
                  onChanged: (value) => setState(() => _conditionGrade = value),
                ),
                const SizedBox(height: 24),
                const Text(
                  'DETAIL TAMBAHAN',
                  style: TextStyle(
                    color: AppColors.cyan,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 14),
                if (_isEdit) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.blue.withValues(alpha: .1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.info_outline_rounded,
                          color: AppColors.cyan,
                          size: 18,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Pemakai & status aset diatur di halaman detail, bukan di sini.',
                            style: TextStyle(
                              color: AppColors.textMuted.withValues(alpha: .95),
                              fontSize: 11.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                TextFormField(
                  controller: _macAddress,
                  decoration: const InputDecoration(
                    labelText: 'MAC Address',
                    prefixIcon: Icon(Icons.settings_ethernet_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _serialNumber,
                  decoration: const InputDecoration(
                    labelText: 'Serial Number',
                    prefixIcon: Icon(Icons.confirmation_number_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _description,
                  minLines: 3,
                  maxLines: 5,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    labelText: 'Deskripsi',
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 24),
                const Text(
                  'FOTO ASET',
                  style: TextStyle(
                    color: AppColors.cyan,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Opsional. Foto akan dikompresi sebelum diunggah (maks. 5 MB).',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 11),
                ),
                const SizedBox(height: 12),
                if (_pickedPhoto != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Image.file(
                      File(_pickedPhoto!.path),
                      height: 170,
                      width: double.infinity,
                      fit: BoxFit.cover,
                    ),
                  ),
                if (_pickedPhoto != null) const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _isSaving
                            ? null
                            : () => _pickPhoto(ImageSource.gallery),
                        icon: const Icon(Icons.photo_library_outlined),
                        label: Text(
                          _pickedPhoto == null ? 'Pilih galeri' : 'Ganti foto',
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    OutlinedButton.icon(
                      onPressed: _isSaving
                          ? null
                          : () => _pickPhoto(ImageSource.camera),
                      icon: const Icon(Icons.camera_alt_outlined),
                      label: const Text('Kamera'),
                    ),
                  ],
                ),
                if (_error != null) ...[
                  const SizedBox(height: 14),
                  Text(
                    _error!,
                    style: const TextStyle(color: AppColors.red, fontSize: 12),
                  ),
                ],
                const SizedBox(height: 22),
                FilledButton(
                  onPressed: _isSaving ? null : _save,
                  child: _isSaving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(_isEdit ? 'Simpan perubahan' : 'Simpan aset'),
                ),
              ],
            ),
          ),
  );
}
