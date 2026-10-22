import '../core/api_client.dart';

class GaService {
  const GaService(this.client);
  final ApiClient client;

  Future<Map<String, dynamic>> dashboard() async =>
      (await client.get('ga/control/dashboard')).data;

  Future<List<Map<String, dynamic>>> cleaning(DateTime date) async {
    final response = await client.get(
      'ga/cleaning',
      query: {'date': _date(date)},
    );
    return _list(response.items);
  }

  Future<List<Map<String, dynamic>>> outdoor(DateTime date) async {
    final response = await client.get(
      'ga/outdoor',
      query: {'date': _date(date)},
    );
    return _list(response.items);
  }

  Future<List<Map<String, dynamic>>> preventive() async {
    final response = await client.get('ga/preventive/jobs');
    return _list(response.items);
  }

  Future<List<Map<String, dynamic>>> findings() async {
    final response = await client.get('ga/control/findings');
    return _list(response.items);
  }

  Future<List<Map<String, dynamic>>> areas() async =>
      _list((await client.get('ga/areas')).items);

  Future<Map<String, dynamic>> createOutdoor(
    Map<String, dynamic> payload,
  ) async => (await client.request('POST', 'ga/outdoor', body: payload)).data;

  Future<Map<String, dynamic>> updateOutdoor(
    int inspectionId,
    Map<String, dynamic> payload,
  ) async => (await client.request(
    'PATCH',
    'ga/outdoor/$inspectionId',
    body: payload,
  )).data;

  Future<void> uploadOutdoorMedia(
    int inspectionId,
    List<String> filePaths,
  ) async {
    await client.uploadFiles(
      'ga/outdoor/$inspectionId/media',
      fileField: 'files',
      filePaths: filePaths,
    );
  }

  Future<void> submitOutdoor(int inspectionId) async {
    await client.request('POST', 'ga/outdoor/$inspectionId/submit');
  }

  Future<void> updateCleaningLine(int id, bool completed) async {
    await client.request(
      'PATCH',
      'ga/cleaning/lines/$id',
      body: {'completed': completed},
    );
  }

  Future<void> submitCleaning(int id) async {
    await client.request('POST', 'ga/cleaning/$id/submit');
  }

  String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  List<Map<String, dynamic>> _list(List<dynamic> data) => data
      .whereType<Map>()
      .map((item) => item.cast<String, dynamic>())
      .toList();
}
