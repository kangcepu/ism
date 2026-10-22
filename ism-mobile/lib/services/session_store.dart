import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SessionStore {
  const SessionStore({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _storage = storage;

  static const _tokenKey = 'mobile_api_access_token';
  static const assetsCacheKey = 'mobile_assets_cache_v1';
  final FlutterSecureStorage _storage;

  Future<String?> readToken() => _storage.read(key: _tokenKey);
  Future<void> saveToken(String token) =>
      _storage.write(key: _tokenKey, value: token);
  Future<void> clear() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: assetsCacheKey);
  }
}
