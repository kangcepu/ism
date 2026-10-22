import '../core/api_client.dart';
import '../models/monitor_device.dart';
import '../models/switch_metrics.dart';

class MonitoringService {
  MonitoringService(this.client);
  final ApiClient client;

  Future<MonitoringSnapshot?> fetchSnapshot() async {
    final response = await client.get('mobile/monitoring/overview');
    final overview = response.data;
    final devices = _maps(
      overview['devices'],
    ).map((device) => MonitorDevice.fromJson(_device(device))).toList();
    final summary = _map(overview['summary']);
    final temperatureAlerts = devices
        .where((device) => device.temperatureAlert)
        .length;
    return MonitoringSnapshot(
      devices: devices,
      summary: MonitoringSummary.fromJson({
        'total': summary['total'],
        'online': summary['online'],
        'degraded': devices
            .where((device) => device.status == 'degraded')
            .length,
        'offline': devices.where((device) => device.status == 'offline').length,
        'unknown': summary['unknown'],
        'temperature_alerts': temperatureAlerts,
        'traffic_in_bps': summary['trafficInBps'],
        'traffic_out_bps': summary['trafficOutBps'],
        'vlan_traffic': overview['vlans'],
      }),
    );
  }

  Future<DeviceDetailBundle> fetchDeviceDetail(int id) async {
    final responses = await Future.wait([
      client.get('mobile/monitoring/$id/overview'),
      client.get('mobile/monitoring/$id/ports'),
      client.get('mobile/monitoring/$id/sensors'),
    ]);
    final source = responses[0].data;
    final device = MonitorDevice.fromJson(_device(source));
    final ports = _maps(
      responses[1].data,
    ).map((value) => PortMetric.fromJson(value)).toList();
    final sensors = _maps(
      responses[2].data,
    ).map((value) => SensorMetric.fromJson(value)).toList();
    final temperature = _map(source['temperature']);
    return DeviceDetailBundle(
      device: device,
      summary: {'temperature_c': temperature['celsius']},
      ports: ports,
      sensors: sensors,
      cacheStale: source['statusFresh'] != true,
    );
  }

  Future<MonitorDevice> createDevice(Map<String, dynamic> payload) async {
    final response = await client.request(
      'POST',
      'mobile/monitoring',
      body: _payload(payload),
    );
    return _readDevice(response.data);
  }

  Future<MonitorDevice> updateDevice(Map<String, dynamic> payload) async {
    final id = payload['id'];
    final response = await client.request(
      'PATCH',
      'mobile/monitoring/$id',
      body: _payload(payload),
    );
    return _readDevice(response.data);
  }

  Future<void> deleteDevice(int id) =>
      client.request('DELETE', 'mobile/monitoring/$id');

  MonitorDevice _readDevice(Map<String, dynamic> source) =>
      MonitorDevice.fromJson(_device(source));

  Map<String, dynamic> _payload(Map<String, dynamic> value) => {
    'name': value['name'],
    'host': value['host'],
    'location': value['location'],
    'deviceType': value['device_type'],
    'timeoutMs': value['timeout_ms'],
    'customPorts': (value['custom_ports']?.toString() ?? '')
        .split(',')
        .map((entry) => int.tryParse(entry.trim()))
        .whereType<int>()
        .toList(),
    'notes': value['notes'],
    'snmpEnabled': value['snmp_enabled'],
    'snmpCommunity': value['snmp_community'],
    'httpEnabled': value['http_check_enabled'],
    'httpUrl': value['http_check_url'],
  };

  Map<String, dynamic> _device(Map<String, dynamic> source) {
    final traffic = _map(source['traffic']);
    final temperature = _map(source['temperature']);
    return {
      'id': source['id'],
      'name': source['name'],
      'device_type': source['deviceType'],
      'host': source['host'],
      'location': source['location'],
      'status': source['lastStatus'],
      'latency_ms': source['latencyMs'],
      'last_check_at': source['lastCheckedAt'],
      'message': source['lastMessage'],
      'is_stale': source['statusFresh'] != true,
      'snmp': {'enabled': source['snmpEnabled'] == true},
      'services': {'open_ports': source['openPorts']},
      'traffic': {
        'in_bps': traffic['inBps'],
        'out_bps': traffic['outBps'],
        'updated_at': traffic['checkedAt'],
      },
      'temperature': {
        'chassis_c': temperature['celsius'],
        'checked_at': temperature['checkedAt'],
        'alert_active': (temperature['celsius'] as num? ?? 0) >= 55,
      },
      'vlan_traffic': _maps(source['vlans'])
          .map(
            (vlan) => {
              'id': vlan['id'],
              'label': 'VLAN${vlan['id']}',
              'name': vlan['name'],
              'in_bps': vlan['inBps'],
              'out_bps': vlan['outBps'],
              'interface_count': vlan['interfaceCount'],
              'available': vlan['available'],
              'estimated': vlan['estimated'],
            },
          )
          .toList(),
      'configuration': {
        'timeout_ms': source['timeoutMs'],
        'custom_ports': source['customPorts'],
        'notes': source['notes'],
        'http_check_enabled': source['httpEnabled'],
        'http_check_url': source['httpUrl'],
      },
    };
  }

  Map<String, dynamic> _map(dynamic value) =>
      value is Map ? value.cast<String, dynamic>() : const {};

  List<Map<String, dynamic>> _maps(dynamic value) => value is List
      ? value
            .whereType<Map>()
            .map((entry) => entry.cast<String, dynamic>())
            .toList()
      : const [];
}
