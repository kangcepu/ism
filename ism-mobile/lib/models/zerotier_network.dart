import '../core/formatters.dart';

class ZeroTierNetworkSummary {
  const ZeroTierNetworkSummary({
    this.reachable = false,
    this.memberCount,
    this.authorizedCount,
    this.onlineCount,
    this.message,
  });

  final bool reachable;
  final int? memberCount;
  final int? authorizedCount;
  final int? onlineCount;
  final String? message;

  factory ZeroTierNetworkSummary.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const ZeroTierNetworkSummary();
    return ZeroTierNetworkSummary(
      reachable: json['reachable'] == true,
      memberCount: (json['member_count'] as num?)?.toInt(),
      authorizedCount: (json['authorized_count'] as num?)?.toInt(),
      onlineCount: (json['online_count'] as num?)?.toInt(),
      message: json['message']?.toString(),
    );
  }
}

class ZeroTierNetwork {
  const ZeroTierNetwork({
    required this.id,
    required this.networkId,
    required this.label,
    this.notes,
    this.summary = const ZeroTierNetworkSummary(),
  });

  final int id;
  final String networkId;
  final String label;
  final String? notes;
  final ZeroTierNetworkSummary summary;

  factory ZeroTierNetwork.fromJson(Map<String, dynamic> json) =>
      ZeroTierNetwork(
        id: (json['id'] as num).toInt(),
        networkId: json['network_id']?.toString() ?? '',
        label: json['label']?.toString() ?? '',
        notes: json['notes']?.toString(),
        summary: ZeroTierNetworkSummary.fromJson(
          (json['summary'] as Map?)?.cast<String, dynamic>(),
        ),
      );
}

class ZeroTierMember {
  const ZeroTierMember({
    required this.id,
    required this.name,
    required this.description,
    required this.authorized,
    required this.online,
    this.lastOnlineAt,
    this.ipAssignments = const [],
    this.physicalAddress,
    this.clientVersion,
    this.version,
  });

  final String id;
  final String name;
  final String description;
  final bool authorized;
  final bool online;
  final DateTime? lastOnlineAt;
  final List<String> ipAssignments;
  final String? physicalAddress;
  final String? clientVersion;
  final String? version;

  String get displayName => name.isNotEmpty ? name : id;

  factory ZeroTierMember.fromJson(Map<String, dynamic> json) =>
      ZeroTierMember(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        description: json['description']?.toString() ?? '',
        authorized: json['authorized'] == true,
        online: json['online'] == true,
        lastOnlineAt: parseDate(json['last_online_at']),
        ipAssignments: ((json['ip_assignments'] as List?) ?? const [])
            .map((value) => value.toString())
            .toList(),
        physicalAddress: json['physical_address']?.toString(),
        clientVersion: json['client_version']?.toString(),
        version: json['version']?.toString(),
      );
}
