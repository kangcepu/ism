import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../services/session_store.dart';

class AssetCacheSnapshot {
  const AssetCacheSnapshot({required this.assets, required this.savedAt});
  final List<Map<String, dynamic>> assets;
  final DateTime savedAt;
}

class AssetsCacheStore {
  const AssetsCacheStore({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _storage = storage;

  final FlutterSecureStorage _storage;

  Future<AssetCacheSnapshot?> read() async {
    final raw = await _storage.read(key: SessionStore.assetsCacheKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      final value = jsonDecode(raw);
      if (value is! Map || value['assets'] is! List) return null;
      final assets = (value['assets'] as List)
          .whereType<Map>()
          .map((asset) => asset.cast<String, dynamic>())
          .toList();
      final savedAt = DateTime.tryParse(value['saved_at']?.toString() ?? '');
      if (assets.isEmpty || savedAt == null) return null;
      return AssetCacheSnapshot(assets: assets, savedAt: savedAt);
    } catch (_) {
      return null;
    }
  }

  Future<void> writePage({required List<Map<String, dynamic>> assets}) async {
    final previous = await read();
    final merged = <int, Map<String, dynamic>>{
      for (final asset in previous?.assets ?? const [])
        (asset['id'] as num?)?.toInt() ?? 0: asset,
      for (final asset in assets) (asset['id'] as num?)?.toInt() ?? 0: asset,
    };
    merged.remove(0);
    await _storage.write(
      key: SessionStore.assetsCacheKey,
      value: jsonEncode({
        'saved_at': DateTime.now().toUtc().toIso8601String(),
        'assets': merged.values.toList(),
      }),
    );
  }
}
