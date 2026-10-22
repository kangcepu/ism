import '../core/api_client.dart';
import '../models/adds_directory.dart';

class AddsService {
  const AddsService(this.client);
  final ApiClient client;

  Future<List<AddsDirectoryService>> fetchServices() async {
    final response = await client.get('adds.php');
    return ((response.data['services'] as List?) ?? const [])
        .map(
          (item) => AddsDirectoryService.fromJson(
            (item as Map).cast<String, dynamic>(),
          ),
        )
        .toList();
  }

  Future<void> createService({
    required String domainName,
    required String host,
    required String adminUsername,
    required String adminPassword,
    required String security,
  }) => client.request(
    'POST',
    'adds.php',
    body: {
      'action': 'service',
      'domain_name': domainName,
      'host': host,
      'admin_username': adminUsername,
      'admin_password': adminPassword,
      'security': security,
    },
  );

  Future<List<AddsOu>> fetchOus(int serviceId) async {
    final response = await client.get(
      'adds.php',
      query: {'service_id': '$serviceId', 'resource': 'ous'},
    );
    return ((response.data['ous'] as List?) ?? const [])
        .map((item) => AddsOu.fromJson((item as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<List<AddsDirectoryUser>> fetchUsers(int serviceId, String ouDn) async {
    final response = await client.get(
      'adds.php',
      query: {'service_id': '$serviceId', 'resource': 'users', 'ou_dn': ouDn},
    );
    return ((response.data['users'] as List?) ?? const [])
        .map(
          (item) =>
              AddsDirectoryUser.fromJson((item as Map).cast<String, dynamic>()),
        )
        .toList();
  }

  Future<List<AddsGroup>> fetchGroups(int serviceId, String ouDn) async {
    final response = await client.get(
      'adds.php',
      query: {'service_id': '$serviceId', 'resource': 'groups', 'ou_dn': ouDn},
    );
    return ((response.data['groups'] as List?) ?? const [])
        .map(
          (item) => AddsGroup.fromJson((item as Map).cast<String, dynamic>()),
        )
        .toList();
  }

  Future<List<AddsComputer>> fetchComputers(int serviceId, String ouDn) async {
    final response = await client.get(
      'adds.php',
      query: {
        'service_id': '$serviceId',
        'resource': 'computers',
        'ou_dn': ouDn,
      },
    );
    return ((response.data['computers'] as List?) ?? const [])
        .map(
          (item) =>
              AddsComputer.fromJson((item as Map).cast<String, dynamic>()),
        )
        .toList();
  }

  Future<List<AddsDirectoryUser>> fetchGroupMembers(
    int serviceId,
    String groupDn,
  ) async {
    final response = await client.get(
      'adds.php',
      query: {
        'service_id': '$serviceId',
        'resource': 'group_members',
        'group_dn': groupDn,
      },
    );
    return ((response.data['members'] as List?) ?? const [])
        .map(
          (item) =>
              AddsDirectoryUser.fromJson((item as Map).cast<String, dynamic>()),
        )
        .toList();
  }

  Future<void> createOu(int serviceId, String name, String parentDn) =>
      _write('ou', serviceId, {'name': name, 'parent_dn': parentDn});

  Future<void> createGroup(int serviceId, String name, String ouDn) =>
      _write('group', serviceId, {'name': name, 'ou_dn': ouDn});

  Future<void> createUser({
    required int serviceId,
    required String ouDn,
    required String username,
    required String displayName,
    required String password,
    String? email,
    String? groupDn,
  }) => _write('user', serviceId, {
    'ou_dn': ouDn,
    'username': username,
    'display_name': displayName,
    'password': password,
    if (email?.trim().isNotEmpty == true) 'email': email!.trim(),
    if (groupDn?.isNotEmpty == true) 'group_dn': groupDn,
  });

  Future<void> setUserEnabled(int serviceId, String userDn, bool enabled) =>
      client.request(
        'PUT',
        'adds.php',
        body: {
          'service_id': serviceId,
          'resource': 'user_status',
          'user_dn': userDn,
          'enabled': enabled,
        },
      );

  Future<void> setGroupMembership({
    required int serviceId,
    required String groupDn,
    required String userDn,
    required String operation,
  }) => client.request(
    'PUT',
    'adds.php',
    body: {
      'service_id': serviceId,
      'resource': 'group_membership',
      'group_dn': groupDn,
      'user_dn': userDn,
      'operation': operation,
    },
  );

  Future<void> _write(
    String resource,
    int serviceId,
    Map<String, dynamic> payload,
  ) => client.request(
    'POST',
    'adds.php',
    body: {'service_id': serviceId, 'resource': resource, ...payload},
  );
}
