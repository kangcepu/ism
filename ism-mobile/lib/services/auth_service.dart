import '../core/api_client.dart';
import '../models/user_profile.dart';

class LoginResult {
  const LoginResult({required this.token, required this.user});
  final String token;
  final UserProfile user;
}

class AuthService {
  const AuthService(this.client);
  final ApiClient client;

  Future<LoginResult> login(String username, String password) async {
    final response = await client.request(
      'POST',
      'mobile/auth/login',
      body: {
        'username': username,
        'password': password,
        'deviceName': 'ISM Mobile',
      },
    );
    final token = response.data['token']?.toString();
    final userJson = (response.data['user'] as Map?)?.cast<String, dynamic>();
    if (token == null || userJson == null) {
      throw const ApiException('Data login tidak lengkap.');
    }
    client.token = token;
    return LoginResult(token: token, user: UserProfile.fromJson(userJson));
  }

  Future<UserProfile> profile() async {
    final response = await client.get('mobile/auth/me');
    return UserProfile.fromJson(response.data);
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
    required String confirmPassword,
  }) async {
    await client.request(
      'POST',
      'mobile/auth/change-password',
      body: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
        'confirmPassword': confirmPassword,
      },
    );
  }

  Future<void> logout() async {
    try {
      await client.request('POST', 'mobile/auth/logout');
    } finally {
      client.token = null;
    }
  }
}
