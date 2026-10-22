import 'dart:io';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../models/app_update.dart';

class AppUpdateInstaller {
  const AppUpdateInstaller();

  static const _channel = MethodChannel('is_dept/app_update_installer');
  static const _apkMimeType = 'application/vnd.android.package-archive';

  Future<bool> canRequestPackageInstalls() async {
    if (!Platform.isAndroid) return false;
    return await _channel.invokeMethod<bool>('canRequestPackageInstalls') ??
        false;
  }

  Future<void> requestInstallPermission() async {
    if (!Platform.isAndroid) {
      throw UnsupportedError('Pemasangan APK hanya tersedia di Android.');
    }
    await _channel.invokeMethod<void>('requestInstallPermission');
  }

  Future<void> downloadAndOpenInstaller({
    required Uri url,
    required AppUpdate update,
    required void Function(int receivedBytes, int? totalBytes) onProgress,
  }) async {
    if (!Platform.isAndroid) {
      throw UnsupportedError('Pemasangan APK hanya tersedia di Android.');
    }

    final directory = await getTemporaryDirectory();
    final file = File(
      '${directory.path}${Platform.pathSeparator}is-dept-update-${update.versionCode}.apk',
    );
    if (await file.exists()) await file.delete();

    final client = http.Client();
    IOSink? sink;
    try {
      final response = await client
          .send(http.Request('GET', url))
          .timeout(const Duration(minutes: 8));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException(
          'Server mengembalikan HTTP ${response.statusCode} saat mengunduh APK.',
        uri: url,
      );
      }

      sink = file.openWrite();
      var receivedBytes = 0;
      final totalBytes = response.contentLength;
      await for (final chunk in response.stream) {
        sink.add(chunk);
        receivedBytes += chunk.length;
        onProgress(receivedBytes, totalBytes);
      }
      await sink.flush();
      await sink.close();
      sink = null;

      if (receivedBytes == 0 ||
          (totalBytes != null && totalBytes > 0 && receivedBytes != totalBytes)) {
        throw const HttpException('Unduhan APK tidak lengkap.');
      }

      final result = await OpenFilex.open(file.path, type: _apkMimeType);
      if (result.type != ResultType.done) {
        throw StateError(result.message.isEmpty
            ? 'Installer Android tidak dapat dibuka.'
            : result.message);
      }
    } catch (_) {
      await sink?.close();
      if (await file.exists()) await file.delete();
      rethrow;
    } finally {
      client.close();
    }
  }
}
