class AddsDirectoryService {
  const AddsDirectoryService({
    required this.id,
    required this.name,
    required this.host,
    required this.port,
    required this.baseDn,
    required this.domainName,
    required this.useSsl,
    required this.useTls,
    required this.isActive,
  });

  final int id;
  final String name;
  final String host;
  final int port;
  final String baseDn;
  final String domainName;
  final bool useSsl;
  final bool useTls;
  final bool isActive;

  factory AddsDirectoryService.fromJson(Map<String, dynamic> json) =>
      AddsDirectoryService(
        id: (json['id'] as num?)?.toInt() ?? 0,
        name: json['service_name']?.toString() ?? '-',
        host: json['host']?.toString() ?? '-',
        port: (json['port'] as num?)?.toInt() ?? 389,
        baseDn: json['base_dn']?.toString() ?? '',
        domainName: json['domain_name']?.toString() ?? '',
        useSsl: json['use_ssl'] == 1 || json['use_ssl'] == true,
        useTls: json['use_tls'] == 1 || json['use_tls'] == true,
        isActive: json['is_active'] == 1 || json['is_active'] == true,
      );

  String get securityLabel => useSsl ? 'LDAPS' : (useTls ? 'STARTTLS' : 'LDAP');
}

class AddsOu {
  const AddsOu({required this.name, required this.dn});
  final String name;
  final String dn;

  factory AddsOu.fromJson(Map<String, dynamic> json) => AddsOu(
    name: json['name']?.toString() ?? '-',
    dn: json['dn']?.toString() ?? '',
  );
}

class AddsDirectoryUser {
  const AddsDirectoryUser({
    required this.dn,
    required this.name,
    required this.username,
    required this.enabled,
    this.email,
  });
  final String dn;
  final String name;
  final String username;
  final bool enabled;
  final String? email;

  factory AddsDirectoryUser.fromJson(Map<String, dynamic> json) =>
      AddsDirectoryUser(
        dn: json['dn']?.toString() ?? '',
        name: json['name']?.toString() ?? '-',
        username: json['username']?.toString() ?? '-',
        enabled: json['enabled'] == true || json['enabled'] == 1,
        email: json['email']?.toString(),
      );
}

class AddsGroup {
  const AddsGroup({required this.name, required this.dn, this.description});
  final String name;
  final String dn;
  final String? description;

  factory AddsGroup.fromJson(Map<String, dynamic> json) => AddsGroup(
    name: json['name']?.toString() ?? '-',
    dn: json['dn']?.toString() ?? '',
    description: json['description']?.toString(),
  );
}

class AddsComputer {
  const AddsComputer({
    required this.dn,
    required this.name,
    required this.enabled,
    this.dnsHostName,
    this.operatingSystem,
    this.operatingSystemVersion,
  });

  final String dn;
  final String name;
  final bool enabled;
  final String? dnsHostName;
  final String? operatingSystem;
  final String? operatingSystemVersion;

  factory AddsComputer.fromJson(Map<String, dynamic> json) => AddsComputer(
    dn: json['dn']?.toString() ?? '',
    name: json['name']?.toString() ?? '-',
    enabled: json['enabled'] == true || json['enabled'] == 1,
    dnsHostName: json['dns_host_name']?.toString(),
    operatingSystem: json['operating_system']?.toString(),
    operatingSystemVersion: json['operating_system_version']?.toString(),
  );
}
