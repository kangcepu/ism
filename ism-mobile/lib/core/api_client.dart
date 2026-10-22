import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'app_config.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode, this.code});

  final String message;
  final int? statusCode;
  final String? code;

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}

class ApiResult {
  const ApiResult({required this.statusCode, required this.headers, this.body});

  final int statusCode;
  final Map<String, String> headers;
  final Map<String, dynamic>? body;

  bool get notModified => statusCode == 304;
  Map<String, dynamic> get data =>
      (body?['data'] as Map?)?.cast<String, dynamic>() ?? const {};
  List<dynamic> get items => (body?['data'] as List?) ?? const [];
  Map<String, dynamic> get meta =>
      (body?['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
}

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  String? token;

  Future<ApiResult> get(
    String path, {
    Map<String, String>? query,
    Map<String, String>? headers,
  }) {
    return request('GET', path, query: query, headers: headers);
  }

  Future<ApiResult> request(
    String method,
    String path, {
    Map<String, String>? query,
    Map<String, dynamic>? body,
    Map<String, String>? headers,
    Duration? timeout,
  }) async {
    final uri = Uri.parse(
      '${AppConfig.baseUrl}/$path',
    ).replace(queryParameters: query);
    final requestHeaders = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
      ...?headers,
    };

    try {
      late http.Response response;
      final encodedBody = body == null ? null : jsonEncode(body);
      switch (method) {
        case 'POST':
          response = await _client
              .post(uri, headers: requestHeaders, body: encodedBody)
              .timeout(timeout ?? AppConfig.requestTimeout);
        case 'PUT':
          response = await _client
              .put(uri, headers: requestHeaders, body: encodedBody)
              .timeout(timeout ?? AppConfig.requestTimeout);
        case 'PATCH':
          response = await _client
              .patch(uri, headers: requestHeaders, body: encodedBody)
              .timeout(timeout ?? AppConfig.requestTimeout);
        case 'DELETE':
          response = await _client
              .delete(uri, headers: requestHeaders, body: encodedBody)
              .timeout(timeout ?? AppConfig.requestTimeout);
        default:
          response = await _client
              .get(uri, headers: requestHeaders)
              .timeout(timeout ?? AppConfig.requestTimeout);
      }

      if (response.statusCode == 304) {
        return ApiResult(statusCode: 304, headers: response.headers);
      }

      Map<String, dynamic>? decoded;
      if (response.body.isNotEmpty) {
        final value = jsonDecode(utf8.decode(response.bodyBytes));
        if (value is Map) decoded = value.cast<String, dynamic>();
      }

      if (response.statusCode < 200 ||
          response.statusCode >= 300 ||
          decoded?['success'] == false) {
        final error = (decoded?['error'] as Map?)?.cast<String, dynamic>();
        throw ApiException(
          error?['message']?.toString() ??
              'Server mengembalikan status ${response.statusCode}.',
          statusCode: response.statusCode,
          code: error?['code']?.toString(),
        );
      }

      return ApiResult(
        statusCode: response.statusCode,
        headers: response.headers,
        body: decoded,
      );
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(
        'Server terlalu lama merespons. Periksa koneksi jaringan.',
      );
    } on SocketException {
      throw const ApiException('Tidak dapat terhubung ke server monitoring.');
    } on FormatException {
      throw const ApiException('Response server tidak valid.');
    } catch (error) {
      throw ApiException('Koneksi gagal: $error');
    }
  }

  Future<ApiResult> uploadFile(
    String path, {
    required String fileField,
    required String filePath,
    Map<String, String>? query,
    Map<String, String>? fields,
  }) async {
    final uri = Uri.parse(
      '${AppConfig.baseUrl}/$path',
    ).replace(queryParameters: query);
    final request = http.MultipartRequest('POST', uri)
      ..headers.addAll({
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      })
      ..fields.addAll(fields ?? {});

    try {
      request.files.add(await http.MultipartFile.fromPath(fileField, filePath));
      final streamed = await request.send().timeout(AppConfig.uploadTimeout);
      final response = await http.Response.fromStream(streamed);
      return _parseResponse(response);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(
        'Upload terlalu lama. Periksa koneksi jaringan lalu coba lagi.',
      );
    } on SocketException {
      throw const ApiException('Tidak dapat terhubung ke server monitoring.');
    } on FormatException {
      throw const ApiException('Response server tidak valid.');
    } catch (error) {
      throw ApiException('Upload gagal: $error');
    }
  }

  Future<ApiResult> uploadFiles(
    String path, {
    required String fileField,
    required List<String> filePaths,
  }) async {
    final uri = Uri.parse('${AppConfig.baseUrl}/$path');
    final request = http.MultipartRequest('POST', uri)
      ..headers.addAll({
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      });
    try {
      for (final filePath in filePaths) {
        request.files.add(
          await http.MultipartFile.fromPath(fileField, filePath),
        );
      }
      final streamed = await request.send().timeout(AppConfig.uploadTimeout);
      return _parseResponse(await http.Response.fromStream(streamed));
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(
        'Upload terlalu lama. Periksa koneksi jaringan lalu coba lagi.',
      );
    } on SocketException {
      throw const ApiException('Tidak dapat terhubung ke server monitoring.');
    } on FormatException {
      throw const ApiException('Response server tidak valid.');
    } catch (error) {
      throw ApiException('Upload gagal: $error');
    }
  }

  ApiResult _parseResponse(http.Response response) {
    if (response.statusCode == 304) {
      return ApiResult(statusCode: 304, headers: response.headers);
    }

    Map<String, dynamic>? decoded;
    if (response.body.isNotEmpty) {
      final value = jsonDecode(utf8.decode(response.bodyBytes));
      if (value is Map) decoded = value.cast<String, dynamic>();
    }

    if (response.statusCode < 200 ||
        response.statusCode >= 300 ||
        decoded?['success'] == false) {
      final error = (decoded?['error'] as Map?)?.cast<String, dynamic>();
      throw ApiException(
        error?['message']?.toString() ??
            'Server mengembalikan status ${response.statusCode}.',
        statusCode: response.statusCode,
        code: error?['code']?.toString(),
      );
    }

    return ApiResult(
      statusCode: response.statusCode,
      headers: response.headers,
      body: decoded,
    );
  }

  void close() => _client.close();
}
