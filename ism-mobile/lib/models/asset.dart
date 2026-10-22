import '../core/app_config.dart';
import '../core/formatters.dart';

class Asset {
  const Asset({
    required this.id,
    required this.code,
    required this.name,
    required this.category,
    required this.location,
    required this.status,
    this.assignedTo,
    this.assignee,
    this.conditionGrade,
    this.macAddress,
    this.serialNumber,
    this.description,
    this.createdAt,
    this.updatedAt,
    this.customData = const {},
    this.photos = const [],
  });

  final int id;
  final String code;
  final String name;
  final AssetCategory category;
  final AssetLocation location;
  final String status;
  final String? assignedTo;
  final Assignee? assignee;
  final String? conditionGrade;
  final String? macAddress;
  final String? serialNumber;
  final String? description;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final Map<String, String> customData;
  final List<AssetPhoto> photos;

  factory Asset.fromJson(Map<String, dynamic> json) => Asset(
    id: (json['id'] as num?)?.toInt() ?? 0,
    code: json['code']?.toString() ?? '-',
    name: json['name']?.toString() ?? 'Aset tanpa nama',
    category: AssetCategory.fromJson(
      (json['category'] as Map?)?.cast<String, dynamic>() ?? const {},
    ),
    location: AssetLocation.fromJson(
      (json['location'] as Map?)?.cast<String, dynamic>() ?? const {},
    ),
    status: json['status']?.toString() ?? 'available',
    assignedTo: _text(json['assigned_to']),
    assignee: (json['assignee'] as Map?) != null
        ? Assignee.fromJson((json['assignee'] as Map).cast<String, dynamic>())
        : null,
    conditionGrade: _text(json['condition_grade']),
    macAddress: _text(json['mac_address']),
    serialNumber: _text(json['serial_number']),
    description: _text(json['description']),
    createdAt: parseDate(json['created_at']),
    updatedAt: parseDate(json['updated_at']),
    customData: _customData(json['custom_data']),
    photos: ((json['photos'] as List?) ?? const [])
        .whereType<Map>()
        .map((photo) => AssetPhoto.fromJson(photo.cast<String, dynamic>()))
        .toList(),
  );

  /// The current pemakai's display name, preferring the real assignment
  /// record over the legacy free-text mirror.
  String? get assigneeName => assignee?.name ?? assignedTo;

  static String? _text(dynamic value) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? null : text;
  }

  static Map<String, String> _customData(dynamic value) {
    if (value is! Map) return const {};
    return value.map((key, item) => MapEntry(key.toString(), item.toString()));
  }
}

class Assignee {
  const Assignee({
    this.id,
    required this.source,
    required this.name,
    this.employeeCode,
    this.company,
    this.assignedAt,
  });

  final int? id;
  final String source;
  final String name;
  final String? employeeCode;
  final String? company;
  final DateTime? assignedAt;

  factory Assignee.fromJson(Map<String, dynamic> json) => Assignee(
    id: (json['id'] as num?)?.toInt(),
    source: json['source']?.toString() ?? 'local',
    name: json['name']?.toString() ?? '-',
    employeeCode: Asset._text(json['employee_code']),
    company: Asset._text(json['company']),
    assignedAt: parseDate(json['assigned_at']),
  );

  String get subtitle => [?employeeCode, ?company].join(' · ');
}

class AssetPhoto {
  const AssetPhoto({
    required this.id,
    required this.path,
    required this.originalName,
    required this.mimeType,
    required this.fileSize,
    this.createdAt,
  });

  final int id;
  final String path;
  final String originalName;
  final String mimeType;
  final int fileSize;
  final DateTime? createdAt;

  factory AssetPhoto.fromJson(Map<String, dynamic> json) => AssetPhoto(
    id: (json['id'] as num?)?.toInt() ?? 0,
    path: json['path']?.toString() ?? '',
    originalName: json['original_name']?.toString() ?? 'Foto aset',
    mimeType: json['mime_type']?.toString() ?? '',
    fileSize: (json['file_size'] as num?)?.toInt() ?? 0,
    createdAt: parseDate(json['created_at']),
  );

  /// The server always hands back a path relative to the API root
  /// (api/asset_photo_file.php?id=...) - it streams the bytes itself rather
  /// than pointing at storage directly, wherever the backend actually lives.
  String get resolvedUrl => '${AppConfig.apiRootUrl}/$path';
}

class AssetCategory {
  const AssetCategory({required this.id, this.name, this.itemType});
  final int id;
  final String? name;
  final String? itemType;

  factory AssetCategory.fromJson(Map<String, dynamic> json) => AssetCategory(
    id: (json['id'] as num?)?.toInt() ?? 0,
    name: Asset._text(json['name']),
    itemType: Asset._text(json['item_type']),
  );
}

class AssetLocation {
  const AssetLocation({required this.id, this.name});
  final int id;
  final String? name;

  factory AssetLocation.fromJson(Map<String, dynamic> json) => AssetLocation(
    id: (json['id'] as num?)?.toInt() ?? 0,
    name: Asset._text(json['name']),
  );
}

class AssetPage {
  const AssetPage({
    required this.assets,
    required this.page,
    required this.total,
    required this.hasNext,
    this.fromCache = false,
    this.cachedAt,
  });
  final List<Asset> assets;
  final int page;
  final int total;
  final bool hasNext;
  final bool fromCache;
  final DateTime? cachedAt;
}

class AssetOptions {
  const AssetOptions({required this.categories, required this.locations});
  final List<AssetCategory> categories;
  final List<AssetLocation> locations;
}
