import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/environment_config.dart';

class ApiResponse<T> {
  final bool success;
  final T? data;
  final String? errorMessage;
  final int statusCode;

  String? get message => errorMessage;

  ApiResponse({
    required this.success,
    this.data,
    this.errorMessage,
    required this.statusCode,
  });
}

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  String? _authToken;
  void Function(String message)? onUnauthorized;

  void setAuthToken(String? token) {
    _authToken = token;
  }

  String? get authToken => _authToken;

  Map<String, String> _buildHeaders() {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (_authToken != null && _authToken!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    return headers;
  }

  Uri _buildUri(String endpoint, [Map<String, String>? queryParams]) {
    final base = Uri.parse(EnvironmentConfig.activeApiUrl);
    final endpointUri = Uri.parse(endpoint);

    final basePath = base.path.endsWith('/')
        ? base.path.substring(0, base.path.length - 1)
        : base.path;
    final epPath = endpointUri.path.startsWith('/')
        ? endpointUri.path
        : '/${endpointUri.path}';
    final combinedPath = '$basePath$epPath';

    final mergedQuery = <String, String>{};
    if (endpointUri.hasQuery) {
      mergedQuery.addAll(endpointUri.queryParameters);
    }
    if (queryParams != null && queryParams.isNotEmpty) {
      mergedQuery.addAll(queryParams);
    }

    return Uri(
      scheme: base.scheme,
      host: base.host,
      port: base.hasPort ? base.port : null,
      path: combinedPath,
      queryParameters: mergedQuery.isNotEmpty ? mergedQuery : null,
    );
  }

  Future<ApiResponse<T>> get<T>(String endpoint, {Map<String, String>? queryParams}) async {
    try {
      final uri = _buildUri(endpoint, queryParams);

      final response = await http
          .get(uri, headers: _buildHeaders())
          .timeout(const Duration(seconds: 15));

      return _handleResponse<T>(response);
    } catch (e) {
      debugPrint('[ApiClient GET Error] $endpoint: $e');
      return ApiResponse<T>(
        success: false,
        errorMessage: e.toString(),
        statusCode: 500,
      );
    }
  }

  Future<ApiResponse<T>> post<T>(String endpoint, {dynamic body}) async {
    try {
      final uri = _buildUri(endpoint);

      final response = await http
          .post(
            uri,
            headers: _buildHeaders(),
            body: body != null ? jsonEncode(body) : null,
          )
          .timeout(const Duration(seconds: 15));

      return _handleResponse<T>(response);
    } catch (e) {
      debugPrint('[ApiClient POST Error] $endpoint: $e');
      return ApiResponse<T>(
        success: false,
        errorMessage: e.toString(),
        statusCode: 500,
      );
    }
  }

  Future<ApiResponse<T>> put<T>(String endpoint, {dynamic body}) async {
    try {
      final uri = _buildUri(endpoint);

      final response = await http
          .put(
            uri,
            headers: _buildHeaders(),
            body: body != null ? jsonEncode(body) : null,
          )
          .timeout(const Duration(seconds: 15));

      return _handleResponse<T>(response);
    } catch (e) {
      debugPrint('[ApiClient PUT Error] $endpoint: $e');
      return ApiResponse<T>(
        success: false,
        errorMessage: e.toString(),
        statusCode: 500,
      );
    }
  }

  Future<ApiResponse<T>> delete<T>(String endpoint, {dynamic body}) async {
    try {
      final uri = _buildUri(endpoint);

      final response = await http
          .delete(
            uri,
            headers: _buildHeaders(),
            body: body != null ? jsonEncode(body) : null,
          )
          .timeout(const Duration(seconds: 15));

      return _handleResponse<T>(response);
    } catch (e) {
      debugPrint('[ApiClient DELETE Error] $endpoint: $e');
      return ApiResponse<T>(
        success: false,
        errorMessage: e.toString(),
        statusCode: 500,
      );
    }
  }

  ApiResponse<T> _handleResponse<T>(http.Response res) {
    try {
      final decoded = jsonDecode(res.body);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final data = decoded is Map && decoded.containsKey('data') ? decoded['data'] : decoded;
        return ApiResponse<T>(
          success: true,
          data: data as T?,
          statusCode: res.statusCode,
        );
      } else {
        String? msg;
        if (decoded is Map) {
          final errObj = decoded['error'];
          if (errObj is Map) {
            msg = errObj['message']?.toString() ?? errObj['code']?.toString();
          } else if (errObj != null) {
            msg = errObj.toString();
          } else if (decoded['message'] != null) {
            msg = decoded['message'].toString();
          } else if (decoded['errorMessage'] != null) {
            msg = decoded['errorMessage'].toString();
          }
        }
        msg ??= 'Request failed with status ${res.statusCode}';

        if (res.statusCode == 401) {
          onUnauthorized?.call(msg);
        }

        return ApiResponse<T>(
          success: false,
          errorMessage: msg,
          statusCode: res.statusCode,
        );
      }
    } catch (e) {
      final isSuccess = res.statusCode >= 200 && res.statusCode < 300;
      return ApiResponse<T>(
        success: isSuccess,
        errorMessage: isSuccess ? null : 'Server returned status ${res.statusCode}',
        statusCode: res.statusCode,
      );
    }
  }
}
