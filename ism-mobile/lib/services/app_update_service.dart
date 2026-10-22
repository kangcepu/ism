import 'package:package_info_plus/package_info_plus.dart';

import '../core/api_client.dart';
import '../models/app_update.dart';

class AppUpdateService {
  const AppUpdateService(this.client);
  final ApiClient client;

  Future<AppUpdate?> check() async {
    final package = await PackageInfo.fromPlatform();
    final response = await client.get(
      'app_update.php',
      query: {'version_code': package.buildNumber},
    );
    if (response.data['update_available'] != true) return null;
    final release = (response.data['release'] as Map?)?.cast<String, dynamic>();
    if (release == null || release['file_name']?.toString().isEmpty != false) {
      return null;
    }
    return AppUpdate.fromJson(release);
  }
}
