import '../core/api_client.dart';
import '../models/floor_map.dart';

class FloorMapsService {
  FloorMapsService(this.client); final ApiClient client; String? _etag;
  Future<List<FloorMapArea>?> list() async { final result=await client.get('floor_maps.php', headers: _etag==null?null:{'If-None-Match':_etag!}); if(result.notModified)return null; _etag=result.headers['etag']; return ((result.data['areas'] as List?)??const[]).whereType<Map>().map((x)=>FloorMapArea.fromJson(x.cast<String,dynamic>())).toList(); }
  Future<FloorMapArea> detail(int id) async { final result=await client.get('floor_maps.php',query:{'id':'$id'}); return FloorMapArea.fromJson((result.data['area'] as Map).cast<String,dynamic>()); }
}
