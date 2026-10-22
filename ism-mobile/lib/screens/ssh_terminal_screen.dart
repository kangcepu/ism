import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dartssh2/dartssh2.dart';
import 'package:flutter/material.dart';

import '../core/app_theme.dart';

class SshTerminalScreen extends StatefulWidget {
  const SshTerminalScreen({
    super.key,
    required this.deviceName,
    required this.host,
    required this.client,
    required this.shell,
  });
  final String deviceName;
  final String host;
  final SSHClient client;
  final SSHSession shell;

  @override
  State<SshTerminalScreen> createState() => _SshTerminalScreenState();
}

class _SshTerminalScreenState extends State<SshTerminalScreen> {
  static const _maxOutputLength = 60000;
  final _command = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();
  StreamSubscription<Uint8List>? _stdoutSubscription;
  StreamSubscription<Uint8List>? _stderrSubscription;
  String _output = '';
  bool _closed = false;

  @override
  void initState() {
    super.initState();
    _append('Terhubung ke ${widget.host}\r\n');
    _stdoutSubscription = widget.shell.stdout.listen(_writeBytes);
    _stderrSubscription = widget.shell.stderr.listen(_writeBytes);
    widget.shell.done.then(
      (_) {
        if (mounted && !_closed) {
          _append('\r\n[Sesi SSH ditutup oleh perangkat]\r\n');
        }
      },
      onError: (_) {
        if (mounted && !_closed) _append('\r\n[Sesi SSH terputus]\r\n');
      },
    );
  }

  @override
  void dispose() {
    _stdoutSubscription?.cancel();
    _stderrSubscription?.cancel();
    _command.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    widget.client.close();
    super.dispose();
  }

  void _writeBytes(Uint8List bytes) =>
      _append(utf8.decode(bytes, allowMalformed: true));

  void _append(String text) {
    if (!mounted) return;
    final updated = (_output + text).replaceAll('\r\n', '\n');
    setState(() {
      _output = updated.length > _maxOutputLength
          ? updated.substring(updated.length - _maxOutputLength)
          : updated;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
      }
    });
  }

  void _sendCommand([String? value]) {
    final command = (value ?? _command.text).trimRight();
    if (command.isEmpty || _closed) return;
    widget.shell.write(Uint8List.fromList(utf8.encode('$command\r')));
    _command.clear();
    _focusNode.requestFocus();
  }

  void _sendControl(int code) {
    if (_closed) return;
    widget.shell.write(Uint8List.fromList([code]));
    _focusNode.requestFocus();
  }

  void _disconnect() {
    if (_closed) return;
    _closed = true;
    widget.client.close();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    onPopInvokedWithResult: (_, _) => _disconnect(),
    child: Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.deviceName,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
            ),
            Text(
              'SSH • ${widget.host}',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _disconnect,
            tooltip: 'Putuskan koneksi',
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: Container(
                width: double.infinity,
                color: Colors.black,
                child: SingleChildScrollView(
                  controller: _scrollController,
                  padding: const EdgeInsets.all(14),
                  child: SelectableText(
                    _output.isEmpty ? 'Menunggu output...' : _output,
                    style: const TextStyle(
                      color: Color(0xFFB8F6C7),
                      fontFamily: 'monospace',
                      fontSize: 12,
                      height: 1.3,
                    ),
                  ),
                ),
              ),
            ),
            Container(
              color: AppColors.navy900,
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Column(
                children: [
                  Row(
                    children: [
                      TextButton(
                        onPressed: () => _sendControl(3),
                        child: const Text('Ctrl+C'),
                      ),
                      TextButton(
                        onPressed: () => setState(() => _output = ''),
                        child: const Text('Bersihkan'),
                      ),
                      const Spacer(),
                      const Text(
                        'Sesi tidak disimpan',
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 9,
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _command,
                          focusNode: _focusNode,
                          autocorrect: false,
                          enableSuggestions: false,
                          keyboardType: TextInputType.visiblePassword,
                          textInputAction: TextInputAction.send,
                          onSubmitted: _sendCommand,
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 13,
                          ),
                          decoration: const InputDecoration(
                            hintText: 'Ketik perintah...',
                            isDense: true,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed: _sendCommand,
                        icon: const Icon(Icons.send_rounded),
                        tooltip: 'Kirim perintah',
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
