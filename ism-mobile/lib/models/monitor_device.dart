import '../core/formatters.dart';
import '../core/app_config.dart';

class MonitorDevice {
  const MonitorDevice({
    required this.id,
    required this.name,
    required this.deviceType,
    required this.host,
    required this.status,
    required this.snmpEnabled,
    required this.isStale,
    this.location,
    this.latencyMs,
    this.lastCheckAt,
    this.message,
    this.openPorts = const [],
    this.trafficInBps,
    this.trafficOutBps,
    this.trafficUpdatedAt,
    this.chassisTemperature,
    this.temperatureCheckedAt,
    this.temperatureAlert = false,
    this.httpCheckEnabled = false,
    this.httpCheckHealthy,
    this.httpCheckUrl,
    this.httpStatusCode,
    this.httpResponseMs,
    this.httpCheckedAt,
    this.httpMessage,
    this.vlanTraffic = const [],
    this.configuration = const {},
  });

  final int id;
  final String name;
  final String deviceType;
  final String host;
  final String? location;
  final String status;
  final double? latencyMs;
  final DateTime? lastCheckAt;
  final String? message;
  final bool isStale;
  final bool snmpEnabled;
  final List<int> openPorts;
  final double? trafficInBps;
  final double? trafficOutBps;
  final DateTime? trafficUpdatedAt;
  final double? chassisTemperature;
  final DateTime? temperatureCheckedAt;
  final bool temperatureAlert;
  final bool httpCheckEnabled;
  final bool? httpCheckHealthy;
  final String? httpCheckUrl;
  final int? httpStatusCode;
  final double? httpResponseMs;
  final DateTime? httpCheckedAt;
  final String? httpMessage;
  final List<VlanTrafficMetric> vlanTraffic;
  final Map<String, dynamic> configuration;

  double get totalTrafficBps => (trafficInBps ?? 0) + (trafficOutBps ?? 0);
  bool get needsAttention =>
      status == 'offline' ||
      status == 'degraded' ||
      (chassisTemperature != null &&
          chassisTemperature! >= AppConfig.chassisAlertThreshold);

  factory MonitorDevice.fromJson(Map<String, dynamic> json) {
    final traffic =
        (json['traffic'] as Map?)?.cast<String, dynamic>() ?? const {};
    final temperature =
        (json['temperature'] as Map?)?.cast<String, dynamic>() ?? const {};
    final services =
        (json['services'] as Map?)?.cast<String, dynamic>() ?? const {};
    final snmp = (json['snmp'] as Map?)?.cast<String, dynamic>() ?? const {};
    final httpCheck =
        (json['http_check'] as Map?)?.cast<String, dynamic>() ?? const {};
    return MonitorDevice(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: json['name']?.toString() ?? 'Perangkat tanpa nama',
      deviceType: json['device_type']?.toString() ?? 'unknown',
      host: json['host']?.toString() ?? '-',
      location: json['location']?.toString(),
      status: json['status']?.toString() ?? 'unknown',
      latencyMs: (json['latency_ms'] as num?)?.toDouble(),
      lastCheckAt: parseDate(json['last_check_at']),
      message: json['message']?.toString(),
      isStale: json['is_stale'] == true,
      snmpEnabled: snmp['enabled'] == true,
      openPorts: ((services['open_ports'] as List?) ?? const [])
          .map((value) => (value as num).toInt())
          .toList(),
      trafficInBps: (traffic['in_bps'] as num?)?.toDouble(),
      trafficOutBps: (traffic['out_bps'] as num?)?.toDouble(),
      trafficUpdatedAt: parseDate(traffic['updated_at']),
      chassisTemperature: (temperature['chassis_c'] as num?)?.toDouble(),
      temperatureCheckedAt: parseDate(temperature['checked_at']),
      temperatureAlert: temperature['alert_active'] == true,
      httpCheckEnabled: httpCheck['enabled'] == true,
      httpCheckHealthy: httpCheck['healthy'] as bool?,
      httpCheckUrl: httpCheck['url']?.toString(),
      httpStatusCode: (httpCheck['status_code'] as num?)?.toInt(),
      httpResponseMs: (httpCheck['response_ms'] as num?)?.toDouble(),
      httpCheckedAt: parseDate(httpCheck['checked_at']),
      httpMessage: httpCheck['message']?.toString(),
      vlanTraffic: ((json['vlan_traffic'] as List?) ?? const [])
          .whereType<Map>()
          .map(
            (value) =>
                VlanTrafficMetric.fromJson(value.cast<String, dynamic>()),
          )
          .toList(),
      configuration:
          (json['configuration'] as Map?)?.cast<String, dynamic>() ?? const {},
    );
  }
}

class VlanTrafficMetric {
  const VlanTrafficMetric({
    required this.id,
    required this.label,
    required this.name,
    this.inBps,
    this.outBps,
    this.interfaceCount = 0,
    this.available = false,
    this.estimated = false,
  });

  final int id;
  final String label;
  final String name;
  final double? inBps;
  final double? outBps;
  final int interfaceCount;
  final bool available;
  final bool estimated;

  factory VlanTrafficMetric.fromJson(Map<String, dynamic> json) =>
      VlanTrafficMetric(
        id: (json['id'] as num?)?.toInt() ?? 0,
        label: json['label']?.toString() ?? 'VLAN ${json['id'] ?? '-'}',
        name: json['name']?.toString() ?? '-',
        inBps: (json['in_bps'] as num?)?.toDouble(),
        outBps: (json['out_bps'] as num?)?.toDouble(),
        interfaceCount: (json['interface_count'] as num?)?.toInt() ?? 0,
        available: json['available'] == true,
        estimated: json['estimated'] == true,
      );
}

class MonitoringSummary {
  const MonitoringSummary({
    this.total = 0,
    this.online = 0,
    this.degraded = 0,
    this.offline = 0,
    this.unknown = 0,
    this.temperatureAlerts = 0,
    this.trafficInBps = 0,
    this.trafficOutBps = 0,
    this.vlanTraffic = const [],
  });

  final int total;
  final int online;
  final int degraded;
  final int offline;
  final int unknown;
  final int temperatureAlerts;
  final double trafficInBps;
  final double trafficOutBps;
  final List<VlanTrafficMetric> vlanTraffic;

  int get attention => degraded + offline + temperatureAlerts;

  factory MonitoringSummary.fromJson(Map<String, dynamic>? json) =>
      MonitoringSummary(
        total: (json?['total'] as num?)?.toInt() ?? 0,
        online: (json?['online'] as num?)?.toInt() ?? 0,
        degraded: (json?['degraded'] as num?)?.toInt() ?? 0,
        offline: (json?['offline'] as num?)?.toInt() ?? 0,
        unknown: (json?['unknown'] as num?)?.toInt() ?? 0,
        temperatureAlerts: (json?['temperature_alerts'] as num?)?.toInt() ?? 0,
        trafficInBps: (json?['traffic_in_bps'] as num?)?.toDouble() ?? 0,
        trafficOutBps: (json?['traffic_out_bps'] as num?)?.toDouble() ?? 0,
        vlanTraffic: ((json?['vlan_traffic'] as List?) ?? const [])
            .whereType<Map>()
            .map(
              (value) =>
                  VlanTrafficMetric.fromJson(value.cast<String, dynamic>()),
            )
            .toList(),
      );
}

class MonitoringSnapshot {
  const MonitoringSnapshot({required this.devices, required this.summary});
  final List<MonitorDevice> devices;
  final MonitoringSummary summary;
}
