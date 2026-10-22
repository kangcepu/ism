import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:is_mobile/core/api_client.dart';
import 'package:is_mobile/services/monitoring_service.dart';

http.Response apiResponse(
  Map<String, dynamic> data, {
  Map<String, dynamic>? meta,
}) {
  final body = <String, dynamic>{'success': true, 'data': data};
  if (meta != null) body['meta'] = meta;
  return http.Response(
    jsonEncode(body),
    200,
    headers: {'content-type': 'application/json'},
  );
}

Map<String, dynamic> deviceJson() => {
  'id': 3,
  'name': '02. SW UCF SERVER 02',
  'device_type': 'cisco_switch',
  'host': '200.200.200.25',
  'status': 'online',
  'is_stale': false,
  'snmp': {'enabled': true},
  'services': {'open_ports': <int>[]},
  'traffic': <String, dynamic>{},
  'temperature': {'scope': 'chassis', 'chassis_c': 26},
};

void main() {
  test('device detail merges every port pagination page', () async {
    final requestedPages = <int>[];
    final client = ApiClient(
      client: MockClient((request) async {
        final resource = request.url.queryParameters['resource'];
        if (resource == 'ports') {
          final page = int.parse(request.url.queryParameters['page']!);
          requestedPages.add(page);
          return apiResponse(
            {
              'ports': List.generate(
                page == 1 ? 100 : 17,
                (index) => {
                  'index': ((page - 1) * 100) + index + 1,
                  'label': 'Gi1/0/${((page - 1) * 100) + index + 1}',
                  'oper_status': 'up',
                },
              ),
            },
            meta: {
              'pagination': {
                'page': page,
                'per_page': 100,
                'total': 117,
                'total_pages': 2,
              },
            },
          );
        }
        if (resource == 'sensors') {
          return apiResponse({'sensors': <dynamic>[]});
        }
        return apiResponse({
          'device': deviceJson(),
          'switch_summary': <String, dynamic>{},
          'cache': {'stale': false},
        });
      }),
    );

    final detail = await MonitoringService(client).fetchDeviceDetail(3);

    expect(detail.ports, hasLength(117));
    expect(detail.ports.last.index, 117);
    expect(requestedPages, containsAll(<int>[1, 2]));
    client.close();
  });
}
