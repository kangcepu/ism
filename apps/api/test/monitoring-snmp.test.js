const {
  counterRate,
} = require("../dist/src/modules/operations/monitoring-snmp");
const {
  buildMonitoringOverview,
  buildTopUsers,
} = require("../dist/src/modules/operations/monitoring-overview");

test("calculates rates using 64-bit counters, 32-bit wraps and rejects resets or stale intervals", () => {
  expect(counterRate(9007199254741993n, 9007199254740993n, 10, 64)).toBe(800);
  expect(counterRate(100n, 4294967196n, 10, 32)).toBe(160);
  expect(counterRate(10n, 100n, 10, 64)).toBeNull();
  expect(counterRate(10n, 100n, 10, 32)).toBeNull();
  expect(counterRate(100n, 50n, 181, 64)).toBeNull();
  expect(counterRate(100n, null, 10, 64)).toBeNull();
});

test("excludes expired or failed polling from live totals and marks status unknown", () => {
  const now = Date.now();
  const time = new Date(now - 1000).toISOString();
  const row = {
    id: 1,
    name: "Switch",
    host: "127.0.0.1",
    deviceType: "cisco_switch",
    location: null,
    timeoutMs: 1000,
    customPorts: [],
    snmpEnabled: true,
    lastStatus: "online",
    latencyMs: 2,
    lastMessage: "ok",
    lastCheckedAt: new Date(time),
    snapshot: {
      updated_at: time,
      live: { checkedAt: time, snmpAvailable: true },
      legacy: {
        last_snmp_at: time,
        last_traffic_in_bps: 100,
        last_traffic_out_bps: 200,
      },
      ports: [
        {
          label: "Gi1",
          alias: "VLAN1",
          is_physical: true,
          oper_state: "up",
          in_bps: 100,
        },
      ],
    },
  };
  const live = buildMonitoringOverview([row], now);
  expect(live.summary).toMatchObject({
    online: 1,
    trafficInBps: 100,
    trafficOutBps: 200,
  });
  const expired = buildMonitoringOverview([row], now + 91000);
  expect(expired.summary).toMatchObject({
    online: 0,
    unknown: 1,
    trafficInBps: null,
  });
  const failed = buildMonitoringOverview(
    [
      {
        ...row,
        snapshot: {
          ...row.snapshot,
          live: { checkedAt: time, snmpAvailable: false },
        },
      },
    ],
    now,
  );
  expect(failed.summary).toMatchObject({ online: 1, trafficSources: 0 });
  const old = buildTopUsers([
    { ...row, snapshot: { ...row.snapshot, live: { snmpAvailable: false } } },
  ]);
  expect(old.users[0].inBps).toBeNull();
});
