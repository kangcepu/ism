import 'monitor_device.dart';

class PortMetric {
  const PortMetric({
    required this.index,
    required this.label,
    required this.status,
    this.alias,
    this.portClass,
    this.speedMbps,
    this.inBps,
    this.outBps,
    this.utilization,
  });

  final dynamic index;
  final String label;
  final String status;
  final String? alias;
  final String? portClass;
  final double? speedMbps;
  final double? inBps;
  final double? outBps;
  final double? utilization;

  factory PortMetric.fromJson(Map<String, dynamic> json) => PortMetric(
    index: json['index'],
    label: json['label']?.toString() ?? 'Port ${json['index'] ?? '-'}',
    status: json['oper_status']?.toString() ?? 'unknown',
    alias: json['alias']?.toString(),
    portClass: json['port_class']?.toString(),
    speedMbps: (json['speed_mbps'] as num?)?.toDouble(),
    inBps: (json['in_bps'] as num?)?.toDouble(),
    outBps: (json['out_bps'] as num?)?.toDouble(),
    utilization: (json['utilization_pct'] as num?)?.toDouble(),
  );
}

class SensorMetric {
  const SensorMetric({
    required this.name,
    required this.type,
    required this.status,
    this.scope,
    this.value,
    this.display,
  });

  final String name;
  final String type;
  final String status;
  final String? scope;
  final double? value;
  final String? display;

  factory SensorMetric.fromJson(Map<String, dynamic> json) => SensorMetric(
    name: json['name']?.toString() ?? 'Sensor',
    type: json['type']?.toString() ?? 'other',
    status: json['status']?.toString() ?? 'unknown',
    scope: json['scope']?.toString(),
    value: (json['value'] as num?)?.toDouble(),
    display: json['display']?.toString(),
  );
}

class DeviceDetailBundle {
  const DeviceDetailBundle({
    required this.device,
    required this.summary,
    required this.ports,
    required this.sensors,
    required this.cacheStale,
  });

  final MonitorDevice device;
  final Map<String, dynamic> summary;
  final List<PortMetric> ports;
  final List<SensorMetric> sensors;
  final bool cacheStale;
}
