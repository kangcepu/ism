class AiAssistantSummary {
  const AiAssistantSummary({
    required this.totalAssets,
    required this.maintenance,
    required this.unassigned,
    required this.offline,
    required this.degraded,
    required this.temperatureAlerts,
  });

  final int totalAssets;
  final int maintenance;
  final int unassigned;
  final int offline;
  final int degraded;
  final int temperatureAlerts;

  factory AiAssistantSummary.fromJson(Map<String, dynamic> json) {
    final assets =
        (json['assets'] as Map?)?.cast<String, dynamic>() ?? const {};
    final monitoring =
        (json['monitoring'] as Map?)?.cast<String, dynamic>() ?? const {};
    int value(Map<String, dynamic> source, String key) =>
        (source[key] as num?)?.toInt() ?? 0;
    return AiAssistantSummary(
      totalAssets: value(assets, 'total'),
      maintenance: value(assets, 'maintenance'),
      unassigned: value(assets, 'unassigned'),
      offline: value(monitoring, 'offline'),
      degraded: value(monitoring, 'degraded'),
      temperatureAlerts: value(monitoring, 'temperature_alerts'),
    );
  }
}

class AiAssistantAnswer {
  const AiAssistantAnswer({
    required this.answer,
    required this.model,
    required this.tools,
    required this.memorySource,
    required this.responseMs,
    required this.toolResults,
  });

  final String answer;
  final String model;
  final List<String> tools;
  final String? memorySource;
  final int? responseMs;
  final Map<String, dynamic> toolResults;

  bool get fromMemory => memorySource == 'exact_cache';

  factory AiAssistantAnswer.fromJson(Map<String, dynamic> json) {
    final memory =
        (json['memory'] as Map?)?.cast<String, dynamic>() ?? const {};
    return AiAssistantAnswer(
      answer: json['answer']?.toString() ?? '',
      model: json['model']?.toString() ?? '',
      tools: ((json['tools_used'] as List?) ?? const [])
          .map((value) => value.toString())
          .toList(),
      memorySource: memory['source']?.toString(),
      responseMs: (memory['response_ms'] as num?)?.toInt(),
      toolResults:
          (json['tool_results'] as Map?)?.cast<String, dynamic>() ?? const {},
    );
  }
}

class AiDraftResult {
  const AiDraftResult({required this.draft, required this.validation});
  final Map<String, dynamic> draft;
  final Map<String, dynamic> validation;

  factory AiDraftResult.fromJson(Map<String, dynamic> json) => AiDraftResult(
    draft: (json['draft'] as Map?)?.cast<String, dynamic>() ?? const {},
    validation:
        (json['validation'] as Map?)?.cast<String, dynamic>() ?? const {},
  );
}
