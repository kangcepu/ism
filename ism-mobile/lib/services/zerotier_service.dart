import '../core/api_client.dart';
import '../models/zerotier_network.dart';

class ZeroTierService {
  ZeroTierService(this.client);
  final ApiClient client;
  String? _summaryEtag;

  Future<List<ZeroTierNetwork>> fetchNetworks() async {
    final response = await client.get('zerotier.php');
    final list = (response.data['networks'] as List?) ?? const [];
    return list
        .map(
          (value) =>
              ZeroTierNetwork.fromJson((value as Map).cast<String, dynamic>()),
        )
        .toList();
  }

  /// Used only by the dashboard poller.  A 304 response skips JSON parsing
  /// and prevents a needless UI rebuild on devices with limited CPU/RAM.
  Future<List<ZeroTierNetwork>?> fetchNetworksIfChanged() async {
    final response = await client.get(
      'zerotier.php',
      headers: _summaryEtag == null ? null : {'If-None-Match': _summaryEtag!},
    );
    if (response.notModified) return null;
    _summaryEtag = response.headers['etag'];
    final list = (response.data['networks'] as List?) ?? const [];
    return list
        .map(
          (value) =>
              ZeroTierNetwork.fromJson((value as Map).cast<String, dynamic>()),
        )
        .toList();
  }

  Future<ZeroTierNetwork> createNetwork(Map<String, dynamic> payload) async {
    final response = await client.request(
      'POST',
      'zerotier.php',
      body: payload,
    );
    return ZeroTierNetwork.fromJson(
      (response.data['network'] as Map).cast<String, dynamic>(),
    );
  }

  Future<ZeroTierNetwork> updateNetwork(Map<String, dynamic> payload) async {
    final response = await client.request('PUT', 'zerotier.php', body: payload);
    return ZeroTierNetwork.fromJson(
      (response.data['network'] as Map).cast<String, dynamic>(),
    );
  }

  Future<void> deleteNetwork(int id) async {
    await client.request('DELETE', 'zerotier.php', body: {'id': id});
  }

  Future<List<ZeroTierMember>> fetchMembers(String networkId) async {
    final response = await client.get(
      'zerotier.php',
      query: {'network_id': networkId, 'resource': 'members'},
    );
    final list = (response.data['members'] as List?) ?? const [];
    return list
        .map(
          (value) =>
              ZeroTierMember.fromJson((value as Map).cast<String, dynamic>()),
        )
        .toList();
  }

  Future<ZeroTierMember> setMemberAuthorized(
    String networkId,
    String memberId,
    bool authorized,
  ) async {
    final response = await client.request(
      'PUT',
      'zerotier.php',
      query: {'network_id': networkId, 'member_id': memberId},
      body: {'authorized': authorized},
    );
    return ZeroTierMember.fromJson(
      (response.data['member'] as Map).cast<String, dynamic>(),
    );
  }

  Future<ZeroTierMember> renameMember(
    String networkId,
    String memberId,
    String name,
  ) async {
    final response = await client.request(
      'PUT',
      'zerotier.php',
      query: {'network_id': networkId, 'member_id': memberId},
      body: {'name': name},
    );
    return ZeroTierMember.fromJson(
      (response.data['member'] as Map).cast<String, dynamic>(),
    );
  }

  Future<void> deleteMember(String networkId, String memberId) async {
    await client.request(
      'DELETE',
      'zerotier.php',
      query: {'network_id': networkId, 'member_id': memberId},
    );
  }
}
