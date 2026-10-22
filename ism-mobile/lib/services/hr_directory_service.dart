import '../core/api_client.dart';
import '../models/hr_employee.dart';

class HrDirectoryService {
  const HrDirectoryService(this.client);
  final ApiClient client;

  Future<bool> isEnabled() async {
    final response = await client.get('hr_directory.php', query: const {'action': 'status'});
    return response.data['enabled'] == true;
  }

  Future<List<HrEmployee>> search(String query) async {
    final q = query.trim();
    if (q.length < 2) return const [];

    final response = await client.get('hr_directory.php', query: {'q': q});
    if (response.data['enabled'] != true) return const [];

    return ((response.data['employees'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => HrEmployee.fromJson(item.cast<String, dynamic>()))
        .toList();
  }
}
