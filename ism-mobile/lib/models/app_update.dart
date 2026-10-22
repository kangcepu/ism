class AppUpdate {
  const AppUpdate({
    required this.versionName,
    required this.versionCode,
    required this.releaseNotes,
    required this.forceUpdate,
    required this.fileName,
  });

  final String versionName;
  final int versionCode;
  final String? releaseNotes;
  final bool forceUpdate;
  final String fileName;

  factory AppUpdate.fromJson(Map<String, dynamic> json) => AppUpdate(
    versionName: json['version_name']?.toString() ?? 'versi terbaru',
    versionCode: (json['version_code'] as num?)?.toInt() ?? 0,
    releaseNotes: json['release_notes']?.toString(),
    forceUpdate: json['force_update'] == true || json['force_update'] == 1,
    fileName: json['file_name']?.toString() ?? '',
  );
}
