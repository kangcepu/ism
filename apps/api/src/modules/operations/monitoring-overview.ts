import { Prisma } from "@prisma/client";

type MonitorInput = {
  id: number;
  name: string;
  host: string;
  deviceType: string;
  location: string | null;
  timeoutMs: number;
  customPorts: number[];
  snmpEnabled: boolean;
  lastStatus: string;
  latencyMs: Prisma.Decimal | null;
  lastMessage: string | null;
  lastCheckedAt: Date | null;
  snapshot: Prisma.JsonValue | null;
};
type ObjectValue = Record<string, unknown>;
type VlanMetric = {
  id: number;
  name: string;
  inBps: number | null;
  outBps: number | null;
  interfaceCount: number;
  estimated: boolean;
  available: boolean;
};

const vlanNames = new Map([
  [1, "PC"],
  [40, "Management Switch"],
  [50, "Guest WiFi"],
  [70, "CCTV"],
  [80, "Voice"],
]);
const object = (value: unknown): ObjectValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const number = (value: unknown): number | null => {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  )
    return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;
const legacyDate = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw || raw.startsWith("0000-00-00")) return null;
  const dateString = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? raw.replace(" ", "T") + "+07:00"
    : raw;
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const recent = (value: string | null, now: number, age = 90000) => {
  if (!value) return false;
  const elapsed = now - new Date(value).getTime();
  return Number.isFinite(elapsed) && elapsed >= -30000 && elapsed <= age;
};
const parseArray = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
const ports = (value: unknown): number[] => {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [
    ...new Set(
      values
        .map(number)
        .filter(
          (n): n is number =>
            n !== null && Number.isInteger(n) && n > 0 && n <= 65535,
        ),
    ),
  ];
};
function vlanMetrics(value: unknown): VlanMetric[] {
  return (parseArray(value) || []).flatMap((item) => {
    const metric = object(item);
    const id = number(metric.id);
    if (id === null || !vlanNames.has(id)) return [];
    const inBps = number(metric.in_bps);
    const outBps = number(metric.out_bps);
    return [
      {
        id,
        name: vlanNames.get(id)!,
        inBps,
        outBps,
        interfaceCount: Math.max(0, number(metric.interface_count) || 0),
        estimated: metric.estimated === true,
        available:
          metric.available === true && (inBps !== null || outBps !== null),
      },
    ];
  });
}

export function buildMonitoringOverview(
  monitors: MonitorInput[],
  now = Date.now(),
) {
  const devices = monitors.map((monitor) => {
    const snapshot = object(monitor.snapshot);
    const legacy = object(snapshot.legacy);
    const summary = object(snapshot.summary);
    const live = object(snapshot.live);
    const statusFresh =
      recent(monitor.lastCheckedAt?.toISOString() || null, now) &&
      !!live.checkedAt;
    const legacyVlans = parseArray(legacy.last_vlan_traffic_json);
    const hasLegacyTraffic =
      number(legacy.last_traffic_in_bps) !== null ||
      number(legacy.last_traffic_out_bps) !== null;
    const legacyTemperature = number(legacy.last_temperature_c);
    const summaryTemperature = number(summary.temperature_c);
    const inBps = hasLegacyTraffic
      ? number(legacy.last_traffic_in_bps)
      : number(summary.traffic_in_bps_total);
    const outBps = hasLegacyTraffic
      ? number(legacy.last_traffic_out_bps)
      : number(summary.traffic_out_bps_total);
    const trafficCheckedAt = legacyDate(
      hasLegacyTraffic ? legacy.last_snmp_at : snapshot.updated_at,
    );
    const trafficFresh =
      live.snmpAvailable === true && recent(trafficCheckedAt, now);
    const vlanCheckedAt = legacyDate(
      legacyVlans ? legacy.last_vlan_traffic_at : snapshot.updated_at,
    );
    const temperature = summaryTemperature ?? legacyTemperature;
    const temperatureCheckedAt = legacyDate(
      summaryTemperature !== null
        ? live.snmpAttemptAt || snapshot.updated_at
        : legacy.last_temp_checked_at || snapshot.updated_at,
    );
    return {
      id: monitor.id,
      name: monitor.name,
      host: monitor.host,
      deviceType: monitor.deviceType,
      location: monitor.location,
      timeoutMs: monitor.timeoutMs,
      customPorts: monitor.customPorts,
      snmpEnabled: monitor.snmpEnabled,
      lastStatus: statusFresh ? monitor.lastStatus : "unknown",
      statusFresh,
      latencyMs: number(monitor.latencyMs),
      lastMessage: monitor.lastMessage,
      lastCheckedAt: monitor.lastCheckedAt,
      singlePortProbe: [
        "TCP reachability berhasil",
        "Host tidak dapat dijangkau",
      ].includes(monitor.lastMessage || ""),
      openPorts: ports(legacy.last_open_ports),
      openPortsCheckedAt: legacyDate(legacy.last_check_at),
      traffic: {
        inBps,
        outBps,
        scope: text(legacy.last_traffic_scope) || text(summary.traffic_scope),
        interfaceLabel: text(legacy.snmp_interface_label),
        message: text(legacy.last_snmp_message),
        checkedAt: trafficCheckedAt,
        fresh: trafficFresh,
      },
      temperature: {
        celsius: temperature,
        checkedAt: temperatureCheckedAt,
        fresh:
          live.snmpAvailable === true &&
          recent(temperatureCheckedAt, now, 180000),
      },
      vlans: vlanMetrics(legacyVlans ?? summary.vlan_traffic),
      vlanCheckedAt,
      vlanFresh: live.snmpAvailable === true && recent(vlanCheckedAt, now),
      cachedPorts: Array.isArray(snapshot.ports) ? snapshot.ports.length : 0,
      cachedSensors: Array.isArray(snapshot.sensors)
        ? snapshot.sensors.length
        : 0,
      detailCachedAt: legacyDate(snapshot.updated_at),
    };
  });
  const sumAvailable = (values: (number | null)[]) => {
    const available = values.filter((value): value is number => value !== null);
    return available.length
      ? available.reduce((total, value) => total + value, 0)
      : null;
  };
  const latency = devices
    .filter((device) => device.lastStatus === "online")
    .map((device) => device.latencyMs)
    .filter((value): value is number => value !== null);
  const vlans = [...vlanNames].map(([id, name]) => {
    const metrics = devices.flatMap((device) =>
      device.vlanFresh ? device.vlans.filter((metric) => metric.id === id) : [],
    );
    return {
      id,
      name,
      inBps: sumAvailable(metrics.map((metric) => metric.inBps)),
      outBps: sumAvailable(metrics.map((metric) => metric.outBps)),
      interfaceCount: metrics.reduce(
        (total, metric) => total + metric.interfaceCount,
        0,
      ),
      estimated: metrics.some((metric) => metric.estimated),
      available: metrics.some((metric) => metric.available),
    };
  });
  const trafficDates = devices
    .filter((device) => device.traffic.fresh)
    .map((device) => device.traffic.checkedAt)
    .filter((value): value is string => value !== null)
    .sort();
  const vlanDates = devices
    .filter((device) => device.vlanFresh)
    .map((device) => device.vlanCheckedAt)
    .filter((value): value is string => value !== null)
    .sort();
  return {
    devices,
    summary: {
      total: devices.length,
      online: devices.filter((device) => device.lastStatus === "online").length,
      attention: devices.filter(
        (device) =>
          device.lastStatus === "offline" || device.lastStatus === "degraded",
      ).length,
      unknown: devices.filter((device) => device.lastStatus === "unknown")
        .length,
      singlePortProbes: devices.filter((device) => device.singlePortProbe)
        .length,
      averageLatencyMs: latency.length
        ? latency.reduce((total, value) => total + value, 0) / latency.length
        : null,
      trafficInBps: sumAvailable(
        devices
          .filter((device) => device.traffic.fresh)
          .map((device) => device.traffic.inBps),
      ),
      trafficOutBps: sumAvailable(
        devices
          .filter((device) => device.traffic.fresh)
          .map((device) => device.traffic.outBps),
      ),
      trafficSources: devices.filter(
        (device) =>
          device.traffic.fresh &&
          (device.traffic.inBps !== null || device.traffic.outBps !== null),
      ).length,
      trafficOldestAt: trafficDates[0] || null,
      trafficNewestAt: trafficDates.at(-1) || null,
      vlanOldestAt: vlanDates[0] || null,
      vlanNewestAt: vlanDates.at(-1) || null,
    },
    vlans,
  };
}

export function classifyVlan(label: string, alias: string) {
  if (
    !label.trim() ||
    !alias.trim() ||
    !/^(ethernet|eth|e\d|gi|gigabit|te|tengig|tw|forty|fo|hu|hundred|ge-|xe-|et-|fe-|qsfp|fc|fiber)/i.test(
      label,
    )
  )
    return { id: null, estimated: false };
  if (
    /(\b(ap|accesspoint|access-point)\b|trunk[_ -]?ap|ap[a-z0-9_-]*[_ -]?trunk)/i.test(
      alias,
    ) &&
    /(guest[_ -]?(?:vlan[_ -]?)?50|vlan[_ -]?50)/i.test(alias)
  )
    return { id: 50, estimated: true };
  if (
    /trunk|uplink|peer|core|port-channel|all[_ -]?vlan|tag(?:ged)?[_ -]?\d/i.test(
      alias,
    )
  )
    return { id: null, estimated: false };
  const match = alias.match(
    /(?:access|native|user|pc)?[_ -]*vlan[_ -]?(1|40|50|70|80)(?!\d)/i,
  );
  if (match) return { id: Number(match[1]), estimated: false };
  if (/\bcctv\b/i.test(alias)) return { id: 70, estimated: false };
  if (/\bguest\b/i.test(alias)) return { id: 50, estimated: false };
  if (/\bvoice\b/i.test(alias)) return { id: 80, estimated: false };
  return { id: null, estimated: false };
}

export function buildTopUsers(
  monitors: MonitorInput[],
  options: {
    query?: string;
    vlan?: number;
    page?: number;
    perPage?: number;
    deviceId?: number;
  } = {},
) {
  let sourceDevices = 0;
  let missingDevices = 0;
  const entries = monitors
    .flatMap((monitor) => {
      if (
        !monitor.snmpEnabled ||
        (options.deviceId !== undefined && monitor.id !== options.deviceId)
      )
        return [];
      const snapshot = object(monitor.snapshot);
      const checkedAt = legacyDate(snapshot.updated_at);
      const fresh =
        object(snapshot.live).snmpAvailable === true &&
        recent(checkedAt, Date.now());
      if (!Array.isArray(snapshot.ports) || !snapshot.ports.length) {
        missingDevices++;
        return [];
      }
      sourceDevices++;
      return snapshot.ports.flatMap((value) => {
        const port = object(value);
        if (
          !port.is_physical ||
          port.is_management ||
          port.is_aggregate ||
          port.oper_state !== "up"
        )
          return [];
        const label = text(port.label) || "";
        const alias = text(port.alias)?.trim() || "";
        const classification = classifyVlan(label, alias);
        if (port.is_uplink && !classification.estimated) return [];
        if (options.vlan !== undefined && classification.id !== options.vlan)
          return [];
        const user = alias || `Port ${label}`;
        const query = options.query?.trim().toLowerCase() || "";
        if (
          query &&
          !`${user} ${monitor.name} ${monitor.host} ${monitor.location || ""}`
            .toLowerCase()
            .includes(query)
        )
          return [];
        const inBps = fresh ? number(port.in_bps) : null;
        const outBps = fresh ? number(port.out_bps) : null;
        return [
          {
            deviceId: monitor.id,
            deviceName: monitor.name,
            location: monitor.location,
            user,
            port: label,
            vlanId: classification.id,
            vlanEstimated: classification.estimated,
            inBps,
            outBps,
            totalBps:
              inBps === null && outBps === null
                ? null
                : (inBps || 0) + (outBps || 0),
            checkedAt,
          },
        ];
      });
    })
    .sort((a, b) => (b.totalBps ?? -1) - (a.totalBps ?? -1));
  const perPage = Math.max(1, Math.min(200, Math.floor(options.perPage || 25)));
  const pages = Math.max(1, Math.ceil(entries.length / perPage));
  const page = Math.max(1, Math.min(pages, Math.floor(options.page || 1)));
  return {
    users: entries.slice((page - 1) * perPage, page * perPage),
    pageInfo: { page, perPage, total: entries.length, pages },
    sourceDevices,
    missingDevices,
  };
}
