const { Prisma } = require("@prisma/client");
const {
  buildMonitoringOverview,
} = require("../dist/src/modules/operations/monitoring-overview");

const monitor = (id, snapshot, overrides = {}) => ({
  id,
  name: `Device ${id}`,
  host: `192.0.2.${id}`,
  deviceType: "cisco_switch",
  location: null,
  timeoutMs: 1500,
  customPorts: [],
  snmpEnabled: true,
  lastStatus: "online",
  latencyMs: new Prisma.Decimal("4.5"),
  lastMessage: null,
  lastCheckedAt: new Date("2026-10-19T01:00:00Z"),
  snapshot,
  ...overrides,
});

test("uses migrated telemetry and preserves its separate timestamps and missing values", () => {
  const data = buildMonitoringOverview([
    monitor(1, {
      updated_at: "2026-09-24 07:15:36",
      summary: {
        traffic_in_bps_total: 900,
        traffic_out_bps_total: 999,
        temperature_c: 30,
      },
      legacy: {
        last_traffic_in_bps: "0",
        last_traffic_out_bps: null,
        last_snmp_at: "2026-10-19 08:08:10",
        last_temperature_c: "37.00",
        last_temp_checked_at: "2026-10-19 08:00:00",
        last_open_ports: "22,23,22,invalid",
        last_check_at: "2026-10-19 07:59:00",
        last_vlan_traffic_at: "2026-10-19 08:07:00",
        last_vlan_traffic_json: JSON.stringify([
          {
            id: 50,
            in_bps: 12,
            out_bps: null,
            interface_count: 4,
            estimated: true,
            available: true,
          },
        ]),
        snmp_community: "must-not-leak",
      },
      ports: [{ label: "one" }],
      sensors: [],
    }),
    monitor(
      2,
      {
        summary: {
          traffic_in_bps_total: 100,
          traffic_out_bps_total: 200,
          temperature_c: 28,
          vlan_traffic: [
            {
              id: 50,
              in_bps: 8,
              out_bps: 10,
              interface_count: 2,
              available: true,
            },
          ],
        },
        updated_at: "2026-09-24 08:00:00",
        legacy: { last_vlan_traffic_json: "invalid" },
      },
      { lastStatus: "offline", latencyMs: new Prisma.Decimal("100") },
    ),
    monitor(3, null, { lastStatus: "unknown", latencyMs: null }),
  ]);
  expect(data.devices[0].traffic).toMatchObject({
    inBps: 0,
    outBps: null,
    checkedAt: "2026-10-19T01:08:10.000Z",
  });
  expect(data.devices[0].temperature).toEqual({
    celsius: 37,
    checkedAt: "2026-10-19T01:00:00.000Z",
    fresh: false,
  });
  expect(data.devices[0].openPorts).toEqual([22, 23]);
  expect(data.devices[0].detailCachedAt).toBe("2026-09-24T00:15:36.000Z");
  expect(data.summary).toMatchObject({
    total: 3,
    online: 0,
    attention: 0,
    unknown: 3,
    averageLatencyMs: null,
    trafficInBps: null,
    trafficOutBps: null,
    trafficSources: 0,
  });
  expect(data.vlans.find((vlan) => vlan.id === 50)).toMatchObject({
    inBps: null,
    outBps: null,
    interfaceCount: 0,
    estimated: false,
    available: false,
  });
  expect(data.vlans.find((vlan) => vlan.id === 80)).toMatchObject({
    inBps: null,
    outBps: null,
    available: false,
  });
  expect(JSON.stringify(data)).not.toContain("must-not-leak");
});

test("reports unavailable values instead of inventing zero traffic or latency", () => {
  const data = buildMonitoringOverview([
    monitor(1, null, { lastStatus: "offline", latencyMs: null }),
  ]);
  expect(data.summary).toMatchObject({
    averageLatencyMs: null,
    trafficInBps: null,
    trafficOutBps: null,
    trafficSources: 0,
    trafficOldestAt: null,
  });
  expect(data.devices[0].traffic.checkedAt).toBeNull();
  expect(data.devices[0].temperature.celsius).toBeNull();
});

test("top users use cached active physical edge ports and preserve VLAN estimation", () => {
  const {
    buildTopUsers,
  } = require("../dist/src/modules/operations/monitoring-overview");
  const checkedAt = new Date().toISOString();
  const data = buildTopUsers([
    monitor(1, {
      updated_at: checkedAt,
      live: { snmpAvailable: true },
      ports: [
        {
          label: "Gi1/0/1",
          alias: "PC_VLAN1",
          is_physical: true,
          oper_state: "up",
          in_bps: 100,
          out_bps: 20,
        },
        {
          label: "Gi1/0/2",
          alias: "TRUNK_AP VLAN50",
          is_physical: true,
          is_uplink: true,
          oper_state: "up",
          in_bps: 300,
          out_bps: 50,
        },
        {
          label: "Gi1/0/3",
          alias: "uplink",
          is_physical: true,
          is_uplink: true,
          oper_state: "up",
          in_bps: 100000,
        },
        {
          label: "Gi1/0/4",
          alias: "VLAN70",
          is_physical: true,
          oper_state: "down",
          in_bps: 100000,
        },
        {
          label: "Vlan1",
          alias: "VLAN1",
          is_physical: false,
          oper_state: "up",
          in_bps: 100000,
        },
      ],
    }),
    monitor(2, null),
  ]);
  expect(data.pageInfo.total).toBe(2);
  expect(data.sourceDevices).toBe(1);
  expect(data.missingDevices).toBe(1);
  expect(data.users[0]).toMatchObject({
    user: "TRUNK_AP VLAN50",
    vlanId: 50,
    vlanEstimated: true,
    totalBps: 350,
    checkedAt,
  });
  expect(data.users[1]).toMatchObject({ vlanId: 1, vlanEstimated: false });
  const filtered = buildTopUsers(
    [
      monitor(1, {
        ports: [
          {
            label: "Gi1/0/1",
            alias: "PC_VLAN1",
            is_physical: true,
            oper_state: "up",
            in_bps: 100,
          },
        ],
      }),
    ],
    { vlan: 1, query: "pc_vlan", perPage: 1, page: 5 },
  );
  expect(filtered.pageInfo).toEqual({
    page: 1,
    perPage: 1,
    total: 1,
    pages: 1,
  });
});
