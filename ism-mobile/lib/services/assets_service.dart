import '../core/api_client.dart';
import '../models/asset.dart';
import 'assets_cache_store.dart';

class AssetsService {
  AssetsService(this.client, {AssetsCacheStore? cacheStore})
    : _cacheStore = cacheStore ?? const AssetsCacheStore();
  final ApiClient client;
  final AssetsCacheStore _cacheStore;

  Future<AssetPage> fetchAssets({
    String query = '',
    int? categoryId,
    int page = 1,
  }) async {
    try {
      final response = await client.get(
        'assets.php',
        query: {
          'page': '$page',
          'per_page': '40',
          if (query.isNotEmpty) 'q': query,
          if (categoryId != null) 'category_id': '$categoryId',
        },
      );
      final pagination =
          (response.meta['pagination'] as Map?)?.cast<String, dynamic>() ??
          const {};
      final rawAssets = ((response.data['assets'] as List?) ?? const [])
          .whereType<Map>()
          .map((value) => value.cast<String, dynamic>())
          .toList();
      if (query.isEmpty && categoryId == null) {
        try {
          await _cacheStore.writePage(assets: rawAssets);
        } catch (_) {
          // Cache must never prevent the online asset list from loading.
        }
      }
      return AssetPage(
        assets: rawAssets.map(Asset.fromJson).toList(),
        page: (pagination['page'] as num?)?.toInt() ?? page,
        total: (pagination['total'] as num?)?.toInt() ?? 0,
        hasNext: pagination['has_next'] == true,
      );
    } on ApiException {
      if (page != 1) rethrow;
      final cached = await _cacheStore.read();
      if (cached == null) rethrow;
      final normalizedQuery = query.trim().toLowerCase();
      final assets = cached.assets
          .map(Asset.fromJson)
          .where(
            (asset) =>
                (categoryId == null || asset.category.id == categoryId) &&
                (normalizedQuery.isEmpty ||
                    [
                      asset.name,
                      asset.code,
                      asset.serialNumber,
                      asset.assignedTo,
                    ].whereType<String>().any(
                      (value) => value.toLowerCase().contains(normalizedQuery),
                    )),
          )
          .toList();
      return AssetPage(
        assets: assets,
        page: 1,
        total: assets.length,
        hasNext: false,
        fromCache: true,
        cachedAt: cached.savedAt,
      );
    }
  }

  Future<Asset> fetchAsset(int id) async {
    try {
      final response = await client.get('assets.php', query: {'id': '$id'});
      return Asset.fromJson(
        (response.data['asset'] as Map).cast<String, dynamic>(),
      );
    } on ApiException {
      final cached = await _cacheStore.read();
      final item = cached?.assets.where((asset) {
        return (asset['id'] as num?)?.toInt() == id;
      }).firstOrNull;
      if (item == null) rethrow;
      return Asset.fromJson(item);
    }
  }

  Future<AssetOptions> fetchOptions() async {
    final response = await client.get(
      'assets.php',
      query: {'resource': 'options'},
    );
    return AssetOptions(
      categories: ((response.data['categories'] as List?) ?? const [])
          .whereType<Map>()
          .map((value) => AssetCategory.fromJson(value.cast<String, dynamic>()))
          .toList(),
      locations: ((response.data['locations'] as List?) ?? const [])
          .whereType<Map>()
          .map((value) => AssetLocation.fromJson(value.cast<String, dynamic>()))
          .toList(),
    );
  }

  Future<Asset> createAsset(Map<String, dynamic> payload) async {
    final response = await client.request('POST', 'assets.php', body: payload);
    return Asset.fromJson(
      (response.data['asset'] as Map).cast<String, dynamic>(),
    );
  }

  Future<Asset> updateAsset(Map<String, dynamic> payload) async {
    final response = await client.request('PUT', 'assets.php', body: payload);
    return Asset.fromJson(
      (response.data['asset'] as Map).cast<String, dynamic>(),
    );
  }

  Future<AssetPhoto> uploadPhoto({
    required int assetId,
    required String filePath,
  }) async {
    final response = await client.uploadFile(
      'assets.php',
      query: {'resource': 'photo', 'id': '$assetId'},
      fileField: 'photo',
      filePath: filePath,
    );
    return AssetPhoto.fromJson(
      (response.data['photo'] as Map).cast<String, dynamic>(),
    );
  }

  /// Set the pemakai from an HR directory hit. This is the real assignment
  /// (assigned_to/assignee_name + history), not the legacy free-text
  /// `user_name` column the create/edit form used to write to directly.
  Future<Asset> assignHr({
    required int assetId,
    required String name,
    String? code,
    String? company,
    String? note,
  }) => _lifecycleAction('assign', {
    'item_id': assetId,
    'assignee_source': 'hr',
    'assignee_name': name,
    if (code?.trim().isNotEmpty == true) 'assignee_code': code!.trim(),
    if (company?.trim().isNotEmpty == true) 'assignee_company': company!.trim(),
    if (note?.trim().isNotEmpty == true) 'note': note!.trim(),
  });

  /// Clear the pemakai - the asset goes back to stock (status available).
  Future<Asset> checkin({required int assetId, String? note}) =>
      _lifecycleAction('checkin', {
        'item_id': assetId,
        if (note?.trim().isNotEmpty == true) 'note': note!.trim(),
      });

  /// Change lifecycle status directly (Maintenance / Retired / Disposed / ...).
  Future<Asset> setStatus({
    required int assetId,
    required String status,
    String? note,
  }) => _lifecycleAction('status', {
    'item_id': assetId,
    'status': status,
    if (note?.trim().isNotEmpty == true) 'note': note!.trim(),
  });

  Future<Asset> _lifecycleAction(
    String resource,
    Map<String, dynamic> body,
  ) async {
    final response = await client.request(
      'POST',
      'assets.php',
      query: {'resource': resource},
      body: body,
    );
    final assetJson = response.data['asset'];
    if (assetJson is Map) {
      return Asset.fromJson(assetJson.cast<String, dynamic>());
    }
    return fetchAsset((body['item_id'] as num).toInt());
  }
}
