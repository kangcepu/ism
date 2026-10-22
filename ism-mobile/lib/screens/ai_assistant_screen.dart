import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../models/ai_assistant.dart';
import '../services/ai_assistant_service.dart';

class AiAssistantScreen extends StatefulWidget {
  const AiAssistantScreen({super.key, required this.service});
  final AiAssistantService service;

  @override
  State<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends State<AiAssistantScreen> {
  final _message = TextEditingController();
  final _draft = TextEditingController();
  AiAssistantSummary? _summary;
  AiAssistantAnswer? _answer;
  String? _error;
  bool _loadingSummary = true;
  bool _asking = false;
  bool _drafting = false;
  bool _executing = false;
  bool _validating = false;

  @override
  void initState() {
    super.initState();
    _loadSummary();
  }

  @override
  void dispose() {
    _message.dispose();
    _draft.dispose();
    super.dispose();
  }

  Future<void> _loadSummary() async {
    setState(() => _loadingSummary = true);
    try {
      final summary = await widget.service.fetchSummary();
      if (mounted) setState(() => _summary = summary);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loadingSummary = false);
    }
  }

  Future<void> _ask() async {
    final message = _message.text.trim();
    if (message.isEmpty) {
      _showMessage('Tulis pertanyaan operasional terlebih dahulu.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _asking = true;
      _error = null;
      _answer = null;
    });
    try {
      final answer = await widget.service.ask(message);
      if (mounted) setState(() => _answer = answer);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _asking = false);
    }
  }

  Future<void> _createDraft() async {
    final message = _message.text.trim();
    if (message.isEmpty) {
      _showMessage('Tulis instruksi draft aset terlebih dahulu.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _drafting = true);
    try {
      final result = await widget.service.createDraft(message);
      _draft.text = const JsonEncoder.withIndent('  ').convert(result.draft);
      if (!mounted) return;
      _showMessage(
        result.validation['valid'] == true
            ? 'Draft dibuat. Draft belum disimpan.'
            : 'Draft dibuat, tetapi perlu diperiksa di bagian validasi.',
      );
    } on ApiException catch (error) {
      if (mounted) _showMessage(error.message, isError: true);
    } finally {
      if (mounted) setState(() => _drafting = false);
    }
  }

  Future<void> _executeAction() async {
    final message = _message.text.trim();
    if (message.isEmpty) {
      _showMessage('Tulis perintah aksi aset terlebih dahulu.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _executing = true);
    try {
      final result = await widget.service.executeAction(message);
      _showMessage(
        'Perintah berhasil dieksekusi: ${result['action'] ?? 'aksi'}.',
      );
      await _loadSummary();
    } on ApiException catch (error) {
      if (mounted) _showMessage(error.message, isError: true);
    } finally {
      if (mounted) setState(() => _executing = false);
    }
  }

  Future<void> _validateDraft() async {
    Map<String, dynamic> value;
    try {
      final decoded = jsonDecode(_draft.text);
      if (decoded is! Map) throw const FormatException();
      value = decoded.cast<String, dynamic>();
    } on FormatException {
      _showMessage('Format JSON draft belum valid.', isError: true);
      return;
    }
    setState(() => _validating = true);
    try {
      final result = await widget.service.validateDraft(value);
      final errors = ((result['errors'] as List?) ?? const [])
          .map((item) => item.toString())
          .join('\n');
      final warnings = ((result['warnings'] as List?) ?? const [])
          .map((item) => item.toString())
          .join('\n');
      _showMessage(
        result['valid'] == true
            ? 'Draft valid. ${warnings.isEmpty ? '' : '\n$warnings'}'
            : errors.isEmpty
            ? 'Draft belum valid.'
            : errors,
        isError: result['valid'] != true,
      );
    } on ApiException catch (error) {
      if (mounted) _showMessage(error.message, isError: true);
    } finally {
      if (mounted) setState(() => _validating = false);
    }
  }

  void _setPrompt(String value) => setState(() => _message.text = value);

  void _showMessage(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.red : AppColors.navy700,
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('AI Assistant'),
      actions: [
        IconButton(
          tooltip: 'Muat ulang ringkasan',
          onPressed: _loadingSummary ? null : _loadSummary,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
    ),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          _HeroCard(),
          const SizedBox(height: 14),
          _SummaryGrid(summary: _summary, loading: _loadingSummary),
          const SizedBox(height: 18),
          _QuestionCard(
            controller: _message,
            asking: _asking,
            drafting: _drafting,
            executing: _executing,
            onAsk: _ask,
            onDraft: _createDraft,
            onExecute: _executeAction,
            onPrompt: _setPrompt,
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            _Notice(message: _error!, error: true),
          ],
          if (_asking) ...[
            const SizedBox(height: 14),
            const _Notice(
              message: 'Membaca data operasional dan menyusun diagnosis…',
            ),
          ],
          if (_answer != null) ...[
            const SizedBox(height: 14),
            _AnswerCard(answer: _answer!),
          ],
          const SizedBox(height: 18),
          _DraftCard(
            controller: _draft,
            validating: _validating,
            onValidate: _validateDraft,
          ),
        ],
      ),
    ),
  );
}

class _HeroCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Card(
    color: AppColors.navy800,
    child: const Padding(
      padding: EdgeInsets.all(18),
      child: Row(
        children: [
          CircleAvatar(
            radius: 25,
            backgroundColor: Color(0x3320C5E8),
            child: Icon(Icons.auto_awesome_rounded, color: AppColors.cyan),
          ),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'AI Operational Assistant',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                ),
                SizedBox(height: 4),
                Text(
                  'Read-only. Jawaban selalu berdasar data inventaris dan cache monitoring.',
                  style: TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _SummaryGrid extends StatelessWidget {
  const _SummaryGrid({required this.summary, required this.loading});
  final AiAssistantSummary? summary;
  final bool loading;
  @override
  Widget build(BuildContext context) {
    final value = summary;
    final items = [
      ('Aset', value?.totalAssets ?? 0, AppColors.cyan),
      ('Maintenance', value?.maintenance ?? 0, AppColors.amber),
      ('Unassigned', value?.unassigned ?? 0, AppColors.purple),
      ('Offline', value?.offline ?? 0, AppColors.red),
      ('Degraded', value?.degraded ?? 0, AppColors.amber),
      ('Alert suhu', value?.temperatureAlerts ?? 0, AppColors.red),
    ];
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 1.35,
      children: items
          .map(
            (item) => Card(
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: loading
                    ? const Center(
                        child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.$1,
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 10,
                            ),
                          ),
                          const Spacer(),
                          Text(
                            '${item.$2}',
                            style: TextStyle(
                              color: item.$3,
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          )
          .toList(),
    );
  }
}

class _QuestionCard extends StatelessWidget {
  const _QuestionCard({
    required this.controller,
    required this.asking,
    required this.drafting,
    required this.executing,
    required this.onAsk,
    required this.onDraft,
    required this.onExecute,
    required this.onPrompt,
  });
  final TextEditingController controller;
  final bool asking;
  final bool drafting;
  final bool executing;
  final VoidCallback onAsk;
  final VoidCallback onDraft;
  final VoidCallback onExecute;
  final ValueChanged<String> onPrompt;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Tanya operasional',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 5),
          const Text(
            'AI memilih tool yang relevan lalu menyimpulkan dari bukti.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: controller,
            minLines: 3,
            maxLines: 6,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              hintText: 'Contoh: Cek SNMP dan suhu seluruh switch…',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              ActionChip(
                label: const Text('Health switch'),
                onPressed: () => onPrompt(
                  'Cek kesehatan seluruh switch: online/offline/degraded, suhu chassis, alert dan SNMP.',
                ),
              ),
              ActionChip(
                label: const Text('Analitik aset'),
                onPressed: () => onPrompt(
                  'Analisis stok available, maintenance, aset tanpa foto, dan tren lifecycle.',
                ),
              ),
              ActionChip(
                label: const Text('Cari aset'),
                onPressed: () => onPrompt(
                  'Cari aset Xiaomi Pad 6 yang available dan belum memiliki pemakai.',
                ),
              ),
            ],
          ),
          const SizedBox(height: 15),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: asking || drafting || executing ? null : onAsk,
                  icon: asking
                      ? const SizedBox(
                          width: 17,
                          height: 17,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send_rounded),
                  label: const Text('Tanya data'),
                ),
              ),
              const SizedBox(width: 10),
              OutlinedButton.icon(
                onPressed: asking || drafting || executing ? null : onDraft,
                icon: drafting
                    ? const SizedBox(
                        width: 17,
                        height: 17,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.auto_fix_high_rounded),
                label: const Text('Draft'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: asking || drafting || executing ? null : onExecute,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.green,
                foregroundColor: AppColors.navy950,
              ),
              icon: executing
                  ? const SizedBox(
                      width: 17,
                      height: 17,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.navy950,
                      ),
                    )
                  : const Icon(Icons.play_arrow_rounded),
              label: const Text('Eksekusi perintah aset'),
            ),
          ),
        ],
      ),
    ),
  );
}

class _AnswerCard extends StatelessWidget {
  const _AnswerCard({required this.answer});
  final AiAssistantAnswer answer;
  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppColors.navy800,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.auto_awesome_rounded, color: AppColors.cyan),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Jawaban AI',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(answer.answer, style: const TextStyle(height: 1.5)),
          ],
        ),
      ),
    );
  }
}

class _DraftCard extends StatelessWidget {
  const _DraftCard({
    required this.controller,
    required this.validating,
    required this.onValidate,
  });
  final TextEditingController controller;
  final bool validating;
  final VoidCallback onValidate;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Validasi draft JSON',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 5),
          const Text(
            'Draft tidak pernah langsung disimpan.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: controller,
            minLines: 5,
            maxLines: 10,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            decoration: const InputDecoration(
              hintText: '{"name":"Monitor LG","quantity":5,...}',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: validating ? null : onValidate,
            icon: validating
                ? const SizedBox(
                    width: 17,
                    height: 17,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.verified_user_rounded),
            label: const Text('Validasi draft'),
          ),
        ],
      ),
    ),
  );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.message, this.error = false});
  final String message;
  final bool error;
  @override
  Widget build(BuildContext context) => Card(
    color: error ? AppColors.red.withValues(alpha: .14) : AppColors.navy800,
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Icon(
            error ? Icons.error_outline_rounded : Icons.hourglass_top_rounded,
            color: error ? AppColors.red : AppColors.cyan,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: error ? const Color(0xFFFFB8BE) : AppColors.textMuted,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
