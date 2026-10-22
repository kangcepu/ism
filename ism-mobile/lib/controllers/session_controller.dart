import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../models/user_profile.dart';
import '../services/auth_service.dart';
import '../services/session_store.dart';

enum SessionStatus { initializing, authenticated, unauthenticated }

class SessionController extends ChangeNotifier {
  SessionController({
    required this.client,
    required this.authService,
    required this.store,
  });

  final ApiClient client;
  final AuthService authService;
  final SessionStore store;

  SessionStatus status = SessionStatus.initializing;
  UserProfile? user;
  bool isBusy = false;
  String? error;

  Future<void> initialize() async {
    final token = await store.readToken();
    if (token == null) {
      status = SessionStatus.unauthenticated;
      notifyListeners();
      return;
    }
    client.token = token;
    try {
      user = await authService.profile();
      status = SessionStatus.authenticated;
    } catch (_) {
      client.token = null;
      await store.clear();
      status = SessionStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<bool> login(String username, String password) async {
    isBusy = true;
    error = null;
    notifyListeners();
    try {
      final result = await authService.login(username.trim(), password);
      await store.saveToken(result.token);
      user = result.user;
      status = SessionStatus.authenticated;
      return true;
    } on ApiException catch (exception) {
      error = exception.message;
      return false;
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    isBusy = true;
    notifyListeners();
    try {
      await authService.logout();
    } catch (_) {
      client.token = null;
    }
    await store.clear();
    user = null;
    status = SessionStatus.unauthenticated;
    isBusy = false;
    notifyListeners();
  }

  Future<bool> changePassword({
    required String currentPassword,
    required String newPassword,
    required String confirmPassword,
  }) async {
    isBusy = true;
    error = null;
    notifyListeners();
    try {
      await authService.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
        confirmPassword: confirmPassword,
      );
      return true;
    } on ApiException catch (exception) {
      error = exception.message;
      return false;
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }
}
