import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../services/ga_service.dart';

class GaOutdoorReportScreen extends StatefulWidget {
  const GaOutdoorReportScreen({super.key, required this.service});
  final GaService service;

  @override
  State<GaOutdoorReportScreen> createState() => _GaOutdoorReportScreenState();
}

class _GaOutdoorReportScreenState extends State<GaOutdoorReportScreen> {
  final _formKey = GlobalKey<FormState>();
  final _action = TextEditingController();
  final _picker = ImagePicker();
  List<Map<String, dynamic>> _areas = const [];
  Map<int, Map<String, dynamic>> _todayInspections = const {};
  final List<XFile> _evidence = [];
  int? _areaId;
  String _plantCondition = 'BAIK';
  String _drainCondition = 'BAIK';
  String _cleanliness = 'BAIK';
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadAreas();
  }

  @override
  void dispose() {
    _action.dispose();
    super.dispose();
  }

  Future<void> _loadAreas() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final values = await Future.wait([
        widget.service.areas(),
        widget.service.outdoor(DateTime.now()),
      ]);
      final areas = values[0];
      final inspections = values[1];
      if (mounted) {
        setState(() {
          _areas = areas.where((area) => area['active'] != false).toList();
          _todayInspections = {
            for (final inspection in inspections)
              if (inspection['areaId'] is num)
                (inspection['areaId'] as num).toInt(): inspection,
          };
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final files = source == ImageSource.gallery
          ? await _picker.pickMultiImage(imageQuality: 85, maxWidth: 1920)
          : [
              ?await _picker.pickImage(
                source: source,
                imageQuality: 85,
                maxWidth: 1920,
              ),
            ];
      if (!mounted || files.isEmpty) return;
      setState(() {
        for (final file in files) {
          if (_evidence.length >= 8) break;
          if (!_evidence.any((item) => item.path == file.path)) {
            _evidence.add(file);
          }
        }
      });
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Foto tidak dapat diambil. Periksa izin kamera lalu coba lagi.',
        );
      }
    }
  }

  Future<void> _pickVideo(ImageSource source) async {
    try {
      final video = await _picker.pickVideo(
        source: source,
        maxDuration: const Duration(minutes: 3),
      );
      if (video != null && mounted && _evidence.length < 8) {
        setState(() => _evidence.add(video));
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Video tidak dapat dipilih. Coba lagi.');
      }
    }
  }

  Future<void> _chooseEvidence() async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Ambil foto'),
              onTap: () {
                Navigator.pop(context);
                _pickImage(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Pilih foto dari galeri'),
              onTap: () {
                Navigator.pop(context);
                _pickImage(ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.videocam_outlined),
              title: const Text('Rekam video'),
              onTap: () {
                Navigator.pop(context);
                _pickVideo(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.video_library_outlined),
              title: const Text('Pilih video dari galeri'),
              onTap: () {
                Navigator.pop(context);
                _pickVideo(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_submitting || !_formKey.currentState!.validate()) return;
    if (_areaId == null) {
      setState(() => _error = 'Area wajib dipilih.');
      return;
    }
    if (_evidence.isEmpty) {
      setState(
        () => _error = 'Minimal satu foto kondisi area wajib dilampirkan.',
      );
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final today = DateTime.now();
      final payload = {
        'areaId': _areaId,
        'inspectedAt':
            '${today.year.toString().padLeft(4, '0')}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}',
        'plantCondition': _plantCondition,
        'drainCondition': _drainCondition,
        'cleanliness': _cleanliness,
        'action': _action.text.trim().isEmpty ? null : _action.text.trim(),
      };
      final current = _todayInspections[_areaId!];
      final status = current?['status']?.toString();
      if (current != null && !['DRAFT', 'REWORK', 'OVERDUE'].contains(status)) {
        throw const ApiException(
          'Laporan area ini sudah dikirim dan sedang menunggu verifikasi.',
        );
      }
      final inspection = current == null
          ? await widget.service.createOutdoor(payload)
          : await widget.service.updateOutdoor((current['id'] as num).toInt(), {
              'plantCondition': _plantCondition,
              'drainCondition': _drainCondition,
              'cleanliness': _cleanliness,
              'action': _action.text.trim().isEmpty
                  ? null
                  : _action.text.trim(),
            });
      final id = (inspection['id'] as num).toInt();
      await widget.service.uploadOutdoorMedia(
        id,
        _evidence.map((file) => file.path).toList(),
      );
      await widget.service.submitOutdoor(id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Laporan kondisi area berhasil dikirim.'),
          ),
        );
        Navigator.pop(context, true);
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Laporan kondisi area')),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 30),
              children: [
                const Text(
                  'Inspeksi lapangan',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Laporkan kondisi area langsung dari lokasi. Foto kondisi wajib dilampirkan.',
                  style: TextStyle(color: AppColors.textMuted, height: 1.4),
                ),
                const SizedBox(height: 22),
                DropdownButtonFormField<int>(
                  initialValue: _areaId,
                  decoration: const InputDecoration(
                    labelText: 'Area yang diperiksa',
                    prefixIcon: Icon(Icons.location_on_outlined),
                  ),
                  items: _areas
                      .map(
                        (area) => DropdownMenuItem(
                          value: (area['id'] as num).toInt(),
                          child: Text('${area['code']} · ${area['name']}'),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => setState(() => _areaId = value),
                  validator: (value) =>
                      value == null ? 'Pilih area terlebih dahulu' : null,
                ),
                const SizedBox(height: 16),
                _ConditionField(
                  label: 'Kondisi taman / vegetasi',
                  value: _plantCondition,
                  onChanged: (value) => setState(() => _plantCondition = value),
                ),
                const SizedBox(height: 12),
                _ConditionField(
                  label: 'Kondisi drainase',
                  value: _drainCondition,
                  onChanged: (value) => setState(() => _drainCondition = value),
                ),
                const SizedBox(height: 12),
                _ConditionField(
                  label: 'Kebersihan area',
                  value: _cleanliness,
                  onChanged: (value) => setState(() => _cleanliness = value),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _action,
                  minLines: 3,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    labelText: 'Tindakan atau catatan',
                    alignLabelWithHint: true,
                    hintText:
                        'Contoh: pembersihan saluran dijadwalkan sore ini.',
                  ),
                ),
                const SizedBox(height: 22),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Bukti kondisi',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    Text(
                      '${_evidence.length}/8',
                      style: const TextStyle(color: AppColors.textMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'Wajib minimal satu foto. Video dapat ditambahkan bila diperlukan.',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _evidence.length >= 8 ? null : _chooseEvidence,
                  icon: const Icon(Icons.add_a_photo_outlined),
                  label: const Text('Tambah foto atau video'),
                ),
                if (_evidence.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _evidence.length,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          mainAxisSpacing: 8,
                          crossAxisSpacing: 8,
                        ),
                    itemBuilder: (context, index) {
                      final file = _evidence[index];
                      final isVideo = RegExp(
                        r'\.(mp4|mov|avi|mkv|webm)$',
                      ).hasMatch(file.path.toLowerCase());
                      return Stack(
                        fit: StackFit.expand,
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: isVideo
                                ? Container(
                                    color: AppColors.navy800,
                                    child: const Icon(
                                      Icons.play_circle_outline_rounded,
                                      size: 36,
                                      color: AppColors.cyan,
                                    ),
                                  )
                                : Image.file(
                                    File(file.path),
                                    fit: BoxFit.cover,
                                  ),
                          ),
                          Align(
                            alignment: Alignment.topRight,
                            child: IconButton(
                              style: IconButton.styleFrom(
                                backgroundColor: Colors.black54,
                                foregroundColor: Colors.white,
                              ),
                              iconSize: 17,
                              onPressed: () =>
                                  setState(() => _evidence.removeAt(index)),
                              icon: const Icon(Icons.close_rounded),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(_error!, style: const TextStyle(color: AppColors.red)),
                ],
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _submitting ? null : _submit,
                  icon: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send_rounded),
                  label: Text(
                    _submitting ? 'Mengirim laporan...' : 'Kirim laporan',
                  ),
                ),
              ],
            ),
          ),
  );
}

class _ConditionField extends StatelessWidget {
  const _ConditionField({
    required this.label,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => DropdownButtonFormField<String>(
    initialValue: value,
    decoration: InputDecoration(labelText: label),
    items: const [
      DropdownMenuItem(value: 'BAIK', child: Text('Baik')),
      DropdownMenuItem(
        value: 'PERLU PERHATIAN',
        child: Text('Perlu perhatian'),
      ),
      DropdownMenuItem(value: 'KRITIS', child: Text('Kritis')),
    ],
    onChanged: (next) => onChanged(next!),
  );
}
