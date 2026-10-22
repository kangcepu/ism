import '../core/api_client.dart';
import '../models/ai_assistant.dart';

class AiAssistantService {
  AiAssistantService(this.client);
  final ApiClient client;

  static const _path = 'ai_assistant.php';
  static const _timeout = Duration(seconds: 45);

  Future<AiAssistantSummary> fetchSummary() async {
    final response = await client.get(_path, query: {'resource': 'summary'});
    return AiAssistantSummary.fromJson(response.data);
  }

  Future<AiAssistantAnswer> ask(String message) async {
    final response = await client.request(
      'POST',
      _path,
      timeout: _timeout,
      body: {'resource': 'operational_diagnosis', 'message': message},
    );
    return AiAssistantAnswer.fromJson(response.data);
  }

  Future<Map<String, dynamic>> executeAction(String message) async {
    final response = await client.request(
      'POST',
      _path,
      timeout: _timeout,
      body: {'resource': 'execute_action', 'message': message},
    );
    return response.data;
  }

  Future<AiDraftResult> createDraft(String message) async {
    final response = await client.request(
      'POST',
      _path,
      timeout: _timeout,
      body: {'resource': 'draft_asset', 'message': message},
    );
    return AiDraftResult.fromJson(response.data);
  }

  Future<Map<String, dynamic>> validateDraft(Map<String, dynamic> draft) async {
    final response = await client.request(
      'POST',
      _path,
      body: {'resource': 'validate_draft', 'draft': draft},
    );
    return (response.data['validation'] as Map?)?.cast<String, dynamic>() ??
        const {};
  }
}
