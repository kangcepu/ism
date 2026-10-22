import 'dart:async';

import 'package:dartssh2/dartssh2.dart';
import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../models/monitor_device.dart';
import 'ssh_terminal_screen.dart';

class SshLoginScreen extends StatefulWidget {
  const SshLoginScreen({super.key, required this.device});
  final MonitorDevice device;

  @override
  State<SshLoginScreen> createState() => _SshLoginScreenState();
}

class _SshLoginScreenState extends State<SshLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _host;
  final _port = TextEditingController(text: '22');
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _connecting = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _host = TextEditingController(text: widget.device.host);
  }

  @override
  void dispose() {
    _host.dispose();
    _port.dispose();
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    if (_connecting || !_formKey.currentState!.validate()) return;
    setState(() {
      _connecting = true;
      _error = null;
    });

    SSHClient? client;
    var password = _password.text;
    try {
      final port = int.parse(_port.text.trim());
      final socket = await SSHSocket.connect(
        _host.text.trim(),
        port,
      ).timeout(const Duration(seconds: 12));
      client = SSHClient(
        socket,
        username: _username.text.trim(),
        onPasswordRequest: () => password,
        handshakeTimeout: const Duration(seconds: 12),
        authTimeout: const Duration(seconds: 12),
      );
      await client.authenticated;
      final shell = await client.shell();
      password = '';
      _password.clear();
      if (!mounted) {
        client.close();
        return;
      }
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => SshTerminalScreen(
            deviceName: widget.device.name,
            host: _host.text.trim(),
            client: client!,
            shell: shell,
          ),
        ),
      );
      client = null; // The terminal screen closes the active SSH client.
    } on TimeoutException {
      if (mounted) {
        setState(
          () => _error =
              'Koneksi SSH timeout. Periksa IP, port, dan jaringan HP.',
        );
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = 'Login SSH gagal: $error');
      }
    } finally {
      password = '';
      if (client != null) client.close();
      if (mounted) setState(() => _connecting = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Login SSH')),
    body: Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.blue.withValues(alpha: .10),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.blue.withValues(alpha: .35)),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.shield_outlined, color: AppColors.cyan),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Kredensial hanya dipakai untuk sesi ini dan tidak disimpan di aplikasi atau server.',
                    style: TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 11,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          Text(
            widget.device.name,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _host,
            keyboardType: TextInputType.url,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(
              labelText: 'Host / IP switch',
              prefixIcon: Icon(Icons.lan_outlined),
            ),
            validator: (value) => value == null || value.trim().isEmpty
                ? 'Host SSH wajib diisi'
                : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _port,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Port SSH',
              prefixIcon: Icon(Icons.settings_ethernet_rounded),
            ),
            validator: (value) {
              final port = int.tryParse(value?.trim() ?? '');
              return port == null || port < 1 || port > 65535
                  ? 'Port harus antara 1-65535'
                  : null;
            },
          ),
          const SizedBox(height: 20),
          const Text(
            'KREDENSIAL SSH',
            style: TextStyle(
              color: AppColors.cyan,
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _username,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(
              labelText: 'Username SSH',
              prefixIcon: Icon(Icons.person_outline_rounded),
            ),
            validator: (value) => value == null || value.trim().isEmpty
                ? 'Username wajib diisi'
                : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _password,
            obscureText: _obscurePassword,
            autocorrect: false,
            enableSuggestions: false,
            decoration: InputDecoration(
              labelText: 'Password SSH',
              prefixIcon: const Icon(Icons.key_outlined),
              suffixIcon: IconButton(
                onPressed: () =>
                    setState(() => _obscurePassword = !_obscurePassword),
                icon: Icon(
                  _obscurePassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                ),
              ),
            ),
            validator: (value) =>
                value == null || value.isEmpty ? 'Password wajib diisi' : null,
            onFieldSubmitted: (_) => _connect(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(
              _error!,
              style: const TextStyle(color: AppColors.red, fontSize: 11),
            ),
          ],
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: _connecting ? null : _connect,
            icon: _connecting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.terminal_rounded),
            label: Text(
              _connecting ? 'Menghubungkan...' : 'Login & buka terminal',
            ),
          ),
        ],
      ),
    ),
  );
}
