import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../models/monitor_device.dart';
import '../services/monitoring_service.dart';

class DeviceFormScreen extends StatefulWidget {
  const DeviceFormScreen({super.key, required this.service, this.device});
  final MonitoringService service;
  final MonitorDevice? device;

  @override
  State<DeviceFormScreen> createState() => _DeviceFormScreenState();
}

class _DeviceFormScreenState extends State<DeviceFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _host;
  late final TextEditingController _location;
  late final TextEditingController _timeout;
  late final TextEditingController _ports;
  late final TextEditingController _notes;
  late final TextEditingController _httpCheckUrl;
  final _community = TextEditingController();
  late String _deviceType;
  late bool _snmpEnabled;
  late bool _httpCheckEnabled;
  bool _saving = false;
  String? _error;

  bool get isEdit => widget.device != null;

  @override
  void initState() {
    super.initState();
    final device = widget.device;
    final config = device?.configuration ?? const {};
    _name = TextEditingController(text: device?.name ?? '');
    _host = TextEditingController(text: device?.host ?? '');
    _location = TextEditingController(text: device?.location ?? '');
    _timeout = TextEditingController(text: '${config['timeout_ms'] ?? 1500}');
    _ports = TextEditingController(
      text: ((config['custom_ports'] as List?) ?? const []).join(', '),
    );
    _notes = TextEditingController(text: config['notes']?.toString() ?? '');
    _httpCheckUrl = TextEditingController(
      text: config['http_check_url']?.toString() ?? '',
    );
    _deviceType = device?.deviceType ?? 'cisco_switch';
    _snmpEnabled = device?.snmpEnabled ?? false;
    _httpCheckEnabled = config['http_check_enabled'] == true;
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _host,
      _location,
      _timeout,
      _ports,
      _notes,
      _httpCheckUrl,
      _community,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final payload = <String, dynamic>{
      if (isEdit) 'id': widget.device!.id,
      'name': _name.text.trim(),
      'host': _host.text.trim(),
      'location': _location.text.trim(),
      'device_type': _deviceType,
      'timeout_ms': int.tryParse(_timeout.text) ?? 1500,
      'custom_ports': _ports.text,
      'notes': _notes.text.trim(),
      'snmp_enabled': _snmpEnabled,
      'http_check_enabled': _httpCheckEnabled,
      'http_check_url': _httpCheckUrl.text.trim(),
      if (_community.text.trim().isNotEmpty)
        'snmp_community': _community.text.trim(),
    };
    try {
      isEdit
          ? await widget.service.updateDevice(payload)
          : await widget.service.createDevice(payload);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(isEdit ? 'Edit perangkat' : 'Tambah perangkat')),
    body: Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const Text(
            'IDENTITY',
            style: TextStyle(
              color: AppColors.cyan,
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _name,
            decoration: const InputDecoration(
              labelText: 'Nama perangkat',
              prefixIcon: Icon(Icons.hub_outlined),
            ),
            validator: (value) => value == null || value.trim().isEmpty
                ? 'Nama wajib diisi'
                : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _host,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'IP / Hostname',
              prefixIcon: Icon(Icons.lan_outlined),
            ),
            validator: (value) => value == null || value.trim().isEmpty
                ? 'Host wajib diisi'
                : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _location,
            decoration: const InputDecoration(
              labelText: 'Lokasi',
              prefixIcon: Icon(Icons.location_on_outlined),
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _deviceType,
            decoration: const InputDecoration(
              labelText: 'Tipe perangkat',
              prefixIcon: Icon(Icons.category_outlined),
            ),
            items: const [
              DropdownMenuItem(
                value: 'cisco_switch',
                child: Text('Cisco Switch'),
              ),
              DropdownMenuItem(
                value: 'juniper_switch',
                child: Text('Juniper Switch'),
              ),
              DropdownMenuItem(value: 'mikrotik', child: Text('MikroTik')),
              DropdownMenuItem(
                value: 'huawei_switch',
                child: Text('Huawei Switch'),
              ),
              DropdownMenuItem(
                value: 'hp_switch',
                child: Text('HP / Aruba Switch'),
              ),
              DropdownMenuItem(
                value: 'linux_server',
                child: Text('Linux Server / VPS'),
              ),
              DropdownMenuItem(
                value: 'dell_server',
                child: Text('Dell Server'),
              ),
              DropdownMenuItem(value: 'vm', child: Text('Virtual Machine')),
              DropdownMenuItem(value: 'server', child: Text('Server')),
              DropdownMenuItem(
                value: 'generic_snmp',
                child: Text('Generic SNMP'),
              ),
            ],
            onChanged: (value) => setState(() => _deviceType = value!),
          ),
          const SizedBox(height: 22),
          const Text(
            'MONITORING',
            style: TextStyle(
              color: AppColors.cyan,
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _timeout,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Timeout (ms)',
              prefixIcon: Icon(Icons.timer_outlined),
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _ports,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Custom ports',
              hintText: '443, 8443',
              prefixIcon: Icon(Icons.settings_ethernet_rounded),
            ),
          ),
          const SizedBox(height: 12),
          SwitchListTile.adaptive(
            value: _httpCheckEnabled,
            onChanged: (value) => setState(() => _httpCheckEnabled = value),
            title: const Text(
              'Health-check HTTP/HTTPS',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
            subtitle: const Text(
              'Cocok untuk WordPress dan layanan web publik',
              style: TextStyle(color: AppColors.textMuted, fontSize: 10),
            ),
            activeThumbColor: AppColors.green,
            contentPadding: const EdgeInsets.symmetric(horizontal: 4),
          ),
          if (_httpCheckEnabled) ...[
            const SizedBox(height: 8),
            TextFormField(
              controller: _httpCheckUrl,
              keyboardType: TextInputType.url,
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(
                labelText: 'URL health-check',
                hintText: 'https://domain-wordpress.com/',
                prefixIcon: Icon(Icons.language_rounded),
              ),
              validator: (value) {
                final url = Uri.tryParse(value?.trim() ?? '');
                return url == null ||
                        !url.hasAuthority ||
                        !['http', 'https'].contains(url.scheme)
                    ? 'Masukkan URL HTTP/HTTPS yang valid'
                    : null;
              },
            ),
          ],
          const SizedBox(height: 12),
          SwitchListTile.adaptive(
            value: _snmpEnabled,
            onChanged: (value) => setState(() => _snmpEnabled = value),
            title: const Text(
              'SNMP Monitoring',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
            subtitle: const Text(
              'Traffic, port, chassis temperature',
              style: TextStyle(color: AppColors.textMuted, fontSize: 10),
            ),
            activeThumbColor: AppColors.cyan,
            contentPadding: const EdgeInsets.symmetric(horizontal: 4),
          ),
          if (_snmpEnabled) ...[
            const SizedBox(height: 8),
            TextFormField(
              controller: _community,
              obscureText: true,
              decoration: InputDecoration(
                labelText: isEdit
                    ? 'SNMP Community (kosong = tidak berubah)'
                    : 'SNMP Community',
                prefixIcon: const Icon(Icons.key_outlined),
              ),
              validator: (value) =>
                  !isEdit && _snmpEnabled && (value == null || value.isEmpty)
                  ? 'Community wajib diisi'
                  : null,
            ),
          ],
          const SizedBox(height: 12),
          TextFormField(
            controller: _notes,
            minLines: 3,
            maxLines: 5,
            decoration: const InputDecoration(
              labelText: 'Catatan operasional',
              alignLabelWithHint: true,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
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
          const SizedBox(height: 22),
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
                : Text(isEdit ? 'Simpan perubahan' : 'Tambah ke monitoring'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    ),
  );
}
