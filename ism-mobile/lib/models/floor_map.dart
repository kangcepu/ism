class FloorMapSummary {
  const FloorMapSummary({this.markers = 0, this.cctv = 0, this.switches = 0, this.linkedDevices = 0, this.online = 0, this.attention = 0, this.offline = 0});
  final int markers, cctv, switches, linkedDevices, online, attention, offline;
  factory FloorMapSummary.fromJson(Map<String, dynamic>? json) => FloorMapSummary(
    markers: (json?['markers'] as num?)?.toInt() ?? 0, cctv: (json?['cctv'] as num?)?.toInt() ?? 0,
    switches: (json?['switches'] as num?)?.toInt() ?? 0, linkedDevices: (json?['linked_devices'] as num?)?.toInt() ?? 0,
    online: (json?['online'] as num?)?.toInt() ?? 0, attention: (json?['attention'] as num?)?.toInt() ?? 0, offline: (json?['offline'] as num?)?.toInt() ?? 0);
}

class FloorMapArea {
  const FloorMapArea({required this.id, required this.name, this.description, this.backgroundPath, required this.canvasWidth, required this.canvasHeight, required this.summary, this.markers = const [], this.cables = const []});
  final int id, canvasWidth, canvasHeight; final String name; final String? description, backgroundPath; final FloorMapSummary summary; final List<FloorMapMarker> markers; final List<FloorMapCable> cables;
  factory FloorMapArea.fromJson(Map<String, dynamic> json) => FloorMapArea(
    id: (json['id'] as num?)?.toInt() ?? 0, name: json['name']?.toString() ?? 'Area', description: json['description']?.toString(), backgroundPath: json['background_path']?.toString(),
    canvasWidth: (json['canvas_width'] as num?)?.toInt() ?? 1600, canvasHeight: (json['canvas_height'] as num?)?.toInt() ?? 900, summary: FloorMapSummary.fromJson((json['summary'] as Map?)?.cast<String,dynamic>()),
    markers: ((json['markers'] as List?) ?? const []).whereType<Map>().map((x)=>FloorMapMarker.fromJson(x.cast<String,dynamic>())).toList(),
    cables: ((json['cables'] as List?) ?? const []).whereType<Map>().map((x)=>FloorMapCable.fromJson(x.cast<String,dynamic>())).toList());
}

class FloorMapMarker {
  const FloorMapMarker({required this.id, required this.type, required this.x, required this.y, required this.label, this.notes, this.monitor});
  final String id, type, label; final double x,y; final String? notes; final Map<String,dynamic>? monitor;
  factory FloorMapMarker.fromJson(Map<String,dynamic> json) => FloorMapMarker(id: json['id']?.toString()??'', type: json['type']?.toString()??'switch', x:(json['x'] as num?)?.toDouble()??0, y:(json['y'] as num?)?.toDouble()??0, label:json['label']?.toString()??'', notes:json['notes']?.toString(), monitor:(json['monitor'] as Map?)?.cast<String,dynamic>());
}

class FloorMapCable { const FloorMapCable({required this.type, required this.points}); final String type; final List<Map<String,double>> points;
  factory FloorMapCable.fromJson(Map<String,dynamic> json) => FloorMapCable(type: json['type']?.toString()??'fo', points:((json['points'] as List?)??const[]).whereType<Map>().map((p)=>{'x':(p['x'] as num?)?.toDouble()??0,'y':(p['y'] as num?)?.toDouble()??0}).toList()); }
