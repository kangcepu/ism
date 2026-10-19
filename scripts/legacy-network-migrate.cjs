const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { spawnSync } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const { Client } = require("pg");
const copyFrom = require("pg-copy-streams").from;

const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
dotenv.config({ path: path.join(root, ".env"), quiet: true });
const sourceRoot = process.env.LEGACY_ROOT || "/mnt/www/webapp/it_inventory";
const checkpoint = "it-inventory-network-v1";
const tables = [
  "zerotier_accounts",
  "zerotier_networks",
  "network_monitors",
  "network_monitor_events",
  "floor_map_marker_secrets",
  "floor_map_unifi_controller",
  "floor_map_editor_state",
  "asset_map_positions",
  "asset_map_rooms",
  "asset_map_room_items",
  "app_settings",
];
const secretKey = /password|secret|token|community|pass$/i;
const validStatus = new Set(["online", "offline", "degraded", "unknown"]);
const date = (v) =>
  v && !String(v).startsWith("0000-00-00")
    ? new Date(String(v).replace(" ", "T") + "+07:00")
    : null;
const dateRequired = (v) => date(v) || new Date("1970-01-01T00:00:00Z");
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
function encrypt(value) {
  const key = crypto
    .createHash("sha256")
    .update(process.env.ENCRYPTION_KEY)
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
function decrypt(value) {
  const raw = Buffer.from(value, "base64");
  const key = crypto
    .createHash("sha256")
    .update(process.env.ENCRYPTION_KEY)
    .digest();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    raw.subarray(0, 12),
  );
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !secretKey.test(key))
      .map(([key, item]) => [key, redact(item)]),
  );
}
function json(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw Error("JSON sumber tidak valid.");
  }
}
function ports(value) {
  if (!value) return [];
  let data;
  try {
    data = JSON.parse(value);
  } catch {
    data = String(value).split(",");
  }
  if (!Array.isArray(data)) return [];
  return [
    ...new Set(
      data
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0 && n <= 65535),
    ),
  ].sort((a, b) => a - b);
}
async function sourceConnection() {
  const text = await fsp.readFile(
    path.join(sourceRoot, "api/config/database.local.php"),
    "utf8",
  );
  const get = (key) =>
    text.match(new RegExp(`["']${key}["']\\s*=>\\s*["']([^"']*)`))?.[1];
  const c = await mysql.createConnection({
    host: get("host"),
    user: get("username"),
    password: get("password"),
    database: get("db_name"),
    charset: "utf8mb4",
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 10000,
  });
  await c.query("SET SESSION time_zone = '+07:00'");
  await c.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await c.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
  return c;
}
async function targetConnection() {
  const url = new URL(process.env.DATABASE_URL);
  const schema = url.searchParams.get("schema") || "public";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema))
    throw Error("Schema tujuan tidak valid.");
  url.searchParams.delete("schema");
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(`SET search_path TO "${schema}"`);
  await db.query("SET TIME ZONE 'UTC'");
  return db;
}
function backupPostgres(dir) {
  const u = new URL(process.env.DATABASE_URL);
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
  };
  const target = path.join(dir, "target-before.dump");
  const result = spawnSync(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-acl", "--file", target],
    { env, encoding: "utf8", timeout: 180000 },
  );
  if (result.status !== 0) throw Error("Backup PostgreSQL gagal.");
  fs.chmodSync(target, 0o600);
}
function legacyUnifiPassword(row) {
  if (!row?.credentials_cipher) return null;
  const keyfile = fs.readFileSync(
    path.join(sourceRoot, "api/config/.floor-map-unifi-key.php"),
    "utf8",
  );
  const key = keyfile.match(/return\s+'([a-f0-9]{64})'/)?.[1];
  if (!key) throw Error("Kunci UniFi lama tidak tersedia.");
  const raw = Buffer.from(row.credentials_cipher, "base64");
  const d = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    raw.subarray(0, 12),
  );
  d.setAuthTag(raw.subarray(12, 28));
  d.setAAD(Buffer.from("floor-map-unifi-v1:credentials"));
  const result = JSON.parse(
    Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8"),
  );
  return result.password || null;
}
async function readSmall(c) {
  const data = {};
  for (const table of tables)
    data[table] = (await c.query(`SELECT * FROM \`${table}\``))[0];
  data.switches = json(
    await fsp.readFile(
      path.join(
        sourceRoot,
        "new_map/MAP/denah_cctv_backbone/switch ui/switches.json",
      ),
      "utf8",
    ),
  );
  data.caches = {};
  for (const row of data.network_monitors) {
    const filename = path.join(
      sourceRoot,
      `api/cache/network_switch_details_${Number(row.id)}.json`,
    );
    try {
      data.caches[row.id] = json(await fsp.readFile(filename, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return data;
}
async function summarize(db, c, data) {
  const [history] = await c.query(
    "SELECT COUNT(*) AS n, MIN(id) AS min_id, MAX(id) AS max_id, SUM(status IS NULL) AS null_status FROM network_monitor_history",
  );
  const check = await db.query(
    'SELECT id FROM "IntegrationResource" WHERE domain=$1 AND name=$2 AND "deletedAt" IS NULL',
    ["legacy-migration", checkpoint],
  );
  const prior = await db.query(
    'SELECT config FROM "IntegrationResource" WHERE domain=$1 AND name=$2 AND "deletedAt" IS NULL',
    ["legacy-migration", "it-inventory-legacy-v1"],
  );
  if (!prior.rows.length)
    throw Error("Migrasi aset dan denah sebelumnya tidak ditemukan.");
  const floor = await db.query(
    'SELECT state FROM "FloorMapState" WHERE key=$1',
    ["default"],
  );
  if (!floor.rows.length) throw Error("State denah tujuan tidak ditemukan.");
  const markers = floor.rows[0].state.markers || [];
  const sourceMap = json(
    data.floor_map_editor_state.find((r) => r.state_key === "default")
      ?.state_json,
  );
  const markerIds = new Set(markers.map((m) => String(m.id)));
  const oldMarkers = sourceMap.markers || [];
  const related = data.floor_map_marker_secrets.filter((r) =>
    markerIds.has(String(r.marker_id)),
  );
  const dataMonitors = new Set(data.network_monitors.map((r) => Number(r.id)));
  const unmatchedEvents = data.network_monitor_events.filter(
    (r) => !dataMonitors.has(Number(r.monitor_id)),
  ).length;
  const badStatus =
    data.network_monitors.filter(
      (r) => r.last_status && !validStatus.has(r.last_status),
    ).length +
    data.network_monitor_events.filter(
      (r) =>
        !validStatus.has(r.new_status) ||
        (r.previous_status && !validStatus.has(r.previous_status)),
    ).length;
  const problems = [];
  if (unmatchedEvents || badStatus)
    problems.push("Referensi atau status monitoring lama tidak valid.");

  const priorMappings = prior.rows[0].config.mappings;
  const expectedRooms = Object.values(priorMappings.rooms || {}).map(Number);
  const roomMatches = expectedRooms.length
    ? (
        await db.query(
          'SELECT count(*)::int AS n FROM "MapAssetRoom" WHERE id=ANY($1::int[])',
          [expectedRooms],
        )
      ).rows[0].n
    : 0;
  const priorItems = data.asset_map_room_items
    .map((r) => Number(priorMappings.assets[r.item_id]))
    .filter(Boolean);
  const roomItemCount = priorItems.length
    ? (
        await db.query(
          'SELECT count(*)::int AS n FROM "MapAssetRoomItem" WHERE "assetId"=ANY($1::int[])',
          [priorItems],
        )
      ).rows[0].n
    : 0;
  if (
    roomMatches !== expectedRooms.length ||
    roomItemCount !== priorItems.length
  )
    problems.push(
      "Relasi ruangan aset sebelumnya berubah; perlu diperiksa sebelum melanjutkan.",
    );
  return {
    alreadyMigrated: Boolean(check.rows.length),
    source: {
      accounts: data.zerotier_accounts.length,
      legacyZeroTierToken: Boolean(
        data.app_settings.find(
          (r) =>
            r.setting_group === "zerotier" &&
            r.setting_key === "zerotier_api_token",
        )?.setting_value,
      ),
      networks: data.zerotier_networks.length,
      monitors: data.network_monitors.length,
      history: Number(history[0].n),
      historyWithoutStatus: Number(history[0].null_status || 0),
      events: data.network_monitor_events.length,
      switchDevices: (data.switches.devices || []).length,
      switchDetailCaches: Object.keys(data.caches).length,
      orphanMarkerSecrets:
        data.floor_map_marker_secrets.length - related.length,
      matchingMarkerSecrets: related.length,
      unifi: data.floor_map_unifi_controller.length,
      markers: oldMarkers.length,
      cables: (sourceMap.cables || []).length,
      assetRooms: data.asset_map_rooms.length,
      assetRoomItems: data.asset_map_room_items.length,
    },
    previousMap: {
      matchedMarkers: oldMarkers.filter((m) => markerIds.has(String(m.id)))
        .length,
      newOrMissingMarkers: oldMarkers.filter(
        (m) => !markerIds.has(String(m.id)),
      ).length,
      matchedRooms: roomMatches,
      matchedRoomItems: roomItemCount,
    },
    problems,
  };
}
async function initialFloorState(db) {
  const prior = (
    await db.query(
      'SELECT config FROM "IntegrationResource" WHERE domain=$1 AND name=$2 AND "deletedAt" IS NULL',
      ["legacy-migration", "it-inventory-legacy-v1"],
    )
  ).rows[0]?.config;
  if (!prior?.completedAt)
    throw Error("Checkpoint migrasi awal tidak lengkap.");
  const directory = path.join(root, ".migration-backups");
  const candidates = [];
  for (const name of await fsp.readdir(directory)) {
    if (!name.startsWith("legacy-")) continue;
    const filename = path.join(directory, name, "source-snapshot.json");
    try {
      const stat = await fsp.stat(filename);
      const difference = Math.abs(
        stat.mtimeMs - new Date(prior.completedAt).getTime(),
      );
      if (difference < 1800000) candidates.push({ filename, difference });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  candidates.sort((a, b) => a.difference - b.difference);
  if (!candidates.length)
    throw Error(
      "Backup migrasi awal tidak ditemukan untuk membandingkan denah.",
    );
  const original = json(await fsp.readFile(candidates[0].filename, "utf8"));
  const row = original.floor_map_editor_state?.find(
    (r) => r.state_key === "default",
  );
  if (!row)
    throw Error("State denah tidak ditemukan pada backup migrasi awal.");
  return json(row.state_json);
}
function plain(value, key = "") {
  if (
    typeof value === "string" &&
    secretKey.test(key) &&
    value.startsWith("enc:v1:")
  )
    return decrypt(value.slice(7));
  if (Array.isArray(value)) return value.map((x) => plain(x));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, plain(v, k)]),
    );
  return value;
}
function protectedValue(value, key = "") {
  if (typeof value === "string" && value && secretKey.test(key))
    return value.startsWith("enc:v1:") ? value : `enc:v1:${encrypt(value)}`;
  if (Array.isArray(value)) return value.map((x) => protectedValue(x));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, protectedValue(v, k)]),
    );
  return value;
}
function mergeFloorState(base, source, target) {
  let applied = 0,
    conflicts = 0;
  function mergeObject(original, currentSource, destination) {
    for (const key of new Set([
      ...Object.keys(original),
      ...Object.keys(currentSource),
    ])) {
      if (key === "id") continue;
      const before = original[key],
        after = currentSource[key],
        present = destination[key];
      if (isDeepStrictEqual(before, after)) continue;
      if (isDeepStrictEqual(plain(present, key), plain(after, key))) continue;
      if (!isDeepStrictEqual(plain(present, key), plain(before, key))) {
        conflicts++;
        continue;
      }
      if (!(key in currentSource)) delete destination[key];
      else destination[key] = protectedValue(after, key);
      applied++;
    }
  }
  for (const group of ["markers", "cables"]) {
    const baseline = new Map((base[group] || []).map((x) => [String(x.id), x]));
    const existing = new Map(
      (target[group] || []).map((x) => [String(x.id), x]),
    );
    if (!Array.isArray(target[group])) target[group] = [];
    for (const item of source[group] || []) {
      const id = String(item.id),
        old = baseline.get(id),
        current = existing.get(id);
      if (!old && !current) {
        target[group].push(protectedValue(item));
        applied++;
      } else if (old && current) mergeObject(old, item, current);
      else if (
        !old &&
        current &&
        !isDeepStrictEqual(plain(current), plain(item))
      )
        conflicts++;
      else if (old && !current && !isDeepStrictEqual(old, item)) conflicts++;
    }
    const ids = new Set((source[group] || []).map((x) => String(x.id)));
    for (const [id, old] of baseline)
      if (!ids.has(id) && existing.has(id)) conflicts++;
  }
  const baseRoot = { ...base },
    sourceRootState = { ...source };
  delete baseRoot.markers;
  delete baseRoot.cables;
  delete sourceRootState.markers;
  delete sourceRootState.cables;
  mergeObject(baseRoot, sourceRootState, target);
  return { applied, conflicts };
}
function copyValue(value) {
  if (value === null || value === undefined) return "\\N";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}
async function stageHistory(c, dest, validMonitors) {
  let count = 0,
    nullStatus = 0,
    min = null,
    max = null;
  const digest = crypto.createHash("sha256");
  const transform = new Transform({
    writableObjectMode: true,
    transform(row, _, cb) {
      try {
        if (!validMonitors.has(Number(row.monitor_id)))
          throw Error("Riwayat memiliki monitor yang tidak ditemukan.");
        if (row.status !== null && !validStatus.has(row.status))
          throw Error("Status riwayat tidak dikenal.");
        const timestamp = date(row.recorded_at);
        if (!timestamp || Number.isNaN(timestamp.getTime()))
          throw Error("Tanggal riwayat tidak valid.");
        const id = BigInt(row.id);
        min = min === null || id < min ? id : min;
        max = max === null || id > max ? id : max;
        count++;
        if (row.status === null) nullStatus++;
        const line =
          [
            row.id,
            row.monitor_id,
            row.status,
            row.latency_ms,
            row.traffic_in_bps,
            row.traffic_out_bps,
            row.temperature_c,
            timestamp.toISOString(),
          ]
            .map(copyValue)
            .join("\t") + "\n";
        digest.update(line);
        cb(null, line);
      } catch (error) {
        cb(error);
      }
    },
  });
  const stream = c.connection
    .query(
      "SELECT id,monitor_id,status,latency_ms,traffic_in_bps,traffic_out_bps,temperature_c,recorded_at FROM network_monitor_history ORDER BY id",
    )
    .stream({ highWaterMark: 1000 });
  await pipeline(
    stream,
    transform,
    zlib.createGzip({ level: 4 }),
    fs.createWriteStream(dest, { mode: 0o600, flags: "wx" }),
  );
  return {
    count,
    nullStatus,
    min: String(min ?? 0n),
    max: String(max ?? 0n),
    sha256: digest.digest("hex"),
  };
}
function nextIdMap(rows, targets) {
  const used = new Set(targets.map((r) => Number(r.id))),
    reserved = new Set([...used, ...rows.map((r) => Number(r.id))]);
  let next = Math.max(0, ...reserved) + 1;
  const map = {};
  for (const r of rows) {
    let id = Number(r.id);
    if (used.has(id)) {
      while (reserved.has(next)) next++;
      id = next++;
      reserved.add(id);
    }
    used.add(id);
    map[r.id] = id;
  }
  return map;
}
function uniqueName(name, id, used) {
  const base = String(name || `Legacy ${id}`);
  let value = base,
    i = 0;
  while (used.has(value.toLowerCase()))
    value = `${base} (legacy ${id}${i++ ? `-${i}` : ""})`;
  used.add(value.toLowerCase());
  return value;
}
async function insertResource(
  db,
  domain,
  name,
  config,
  secret,
  active,
  deletedAt,
  createdAt,
  updatedAt,
  externalId = null,
) {
  return (
    await db.query(
      'INSERT INTO "IntegrationResource" (domain,name,config,secret,active,"deletedAt","createdAt","updatedAt","externalId") VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9) RETURNING id',
      [
        domain,
        name,
        JSON.stringify(config),
        secret,
        active,
        deletedAt,
        createdAt,
        updatedAt,
        externalId,
      ],
    )
  ).rows[0].id;
}
async function migrate(db, data, summary, stage, backupDir, baselineFloor) {
  let phase = "menyiapkan schema";
  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [checkpoint]);
    const repeat = await db.query(
      'SELECT id FROM "IntegrationResource" WHERE domain=$1 AND name=$2 AND "deletedAt" IS NULL',
      ["legacy-migration", checkpoint],
    );
    if (repeat.rows.length) throw Error("Migrasi sudah dijalankan.");
    await db.query(
      'ALTER TABLE "MonitorSample" ALTER COLUMN status DROP NOT NULL',
    );
    await db.query(
      'ALTER TABLE "NetworkMonitor" ALTER COLUMN "latencyMs" TYPE DECIMAL(10,2)',
    );
    await db.query(
      'ALTER TABLE "MonitorSample" ALTER COLUMN "latencyMs" TYPE DECIMAL(10,2), ALTER COLUMN "trafficInBps" TYPE DECIMAL(16,2), ALTER COLUMN "trafficOutBps" TYPE DECIMAL(16,2), ALTER COLUMN "temperature" TYPE DECIMAL(6,2)',
    );
    await db.query('DROP INDEX IF EXISTS "NetworkMonitor_host_key"');
    await db.query(
      'CREATE INDEX IF NOT EXISTS "NetworkMonitor_host_idx" ON "NetworkMonitor" ("host")',
    );
    await db.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "NetworkMonitor_active_host_key" ON "NetworkMonitor" ("host") WHERE "deletedAt" IS NULL',
    );
    const targets = (
      await db.query('SELECT id,host,"deletedAt" FROM "NetworkMonitor"')
    ).rows;
    const monitorMap = nextIdMap(data.network_monitors, targets);
    const hosts = new Map(
      targets.filter((r) => !r.deletedAt).map((r) => [r.host, r.id]),
    );
    let matched = 0;
    phase = "menyimpan monitor";
    for (const row of data.network_monitors) {
      const host = String(row.host || "").trim();
      if (!host) throw Error(`Host monitor #${row.id} kosong.`);
      if (!Number(row.is_deleted) && hosts.has(host)) {
        monitorMap[row.id] = hosts.get(host);
        matched++;
        continue;
      }
      if (!Number(row.is_deleted)) hosts.set(host, monitorMap[row.id]);
      const cache = redact(data.caches[row.id]?.data || {});
      const legacy = {};
      for (const [key, value] of Object.entries(row))
        if (
          (key.startsWith("last_") || key.startsWith("snmp_interface_")) &&
          !secretKey.test(key)
        )
          legacy[key] = value;
      const snapshot = { ...cache, legacy };
      await db.query(
        'INSERT INTO "NetworkMonitor" (id,name,"deviceType",host,location,"timeoutMs","customPorts",notes,"snmpEnabled","snmpVersion","snmpPort","snmpCommunityEncrypted","httpEnabled","httpUrl","lastStatus","latencyMs","lastMessage","lastCheckedAt",snapshot,"deletedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::int[],$8,$9,$10,$11,$12,$13,$14,$15::"MonitorStatus",$16,$17,$18,$19::jsonb,$20,$21,$22)',
        [
          monitorMap[row.id],
          row.name,
          row.device_type,
          host,
          row.location || null,
          Number(row.timeout_ms) || 3000,
          ports(row.custom_ports),
          row.notes || null,
          Boolean(row.snmp_enabled),
          row.snmp_version || null,
          Number(row.snmp_port) || 161,
          row.snmp_community ? encrypt(String(row.snmp_community)) : null,
          Boolean(row.http_check_enabled),
          row.http_check_url || null,
          row.last_status || "unknown",
          row.last_latency_ms,
          row.last_message || null,
          date(row.last_check_at),
          JSON.stringify(snapshot),
          Number(row.is_deleted) ? dateRequired(row.updated_at) : null,
          dateRequired(row.created_at),
          dateRequired(row.updated_at),
        ],
      );
    }
    await db.query(
      "SELECT setval(pg_get_serial_sequence('\"NetworkMonitor\"','id'),GREATEST(COALESCE((SELECT MAX(id) FROM \"NetworkMonitor\"),0),1),true)",
    );
    const existingResources = (
      await db.query('SELECT domain,name FROM "IntegrationResource"')
    ).rows;
    const usedNames = (domain) =>
      new Set(
        existingResources
          .filter((r) => r.domain === domain)
          .map((r) => r.name.toLowerCase()),
      );
    const accounts = {},
      networks = {},
      switches = {},
      orphanSecrets = {};
    const usedAccounts = usedNames("zerotier-account"),
      usedNetworks = usedNames("zerotier-network"),
      usedSwitches = usedNames("switch-device"),
      usedSecrets = usedNames("legacy-floor-secret");
    phase = "menyimpan akun ZeroTier";
    for (const row of data.zerotier_accounts) {
      const name = uniqueName(row.label, row.id, usedAccounts);
      accounts[row.id] = await insertResource(
        db,
        "zerotier-account",
        name,
        { notes: row.notes || "", legacyId: Number(row.id) },
        row.api_token ? encrypt(String(row.api_token)) : null,
        !Number(row.is_deleted),
        Number(row.is_deleted) ? dateRequired(row.updated_at) : null,
        dateRequired(row.created_at),
        dateRequired(row.updated_at),
      );
    }
    const legacyToken = data.app_settings.find(
      (r) =>
        r.setting_group === "zerotier" &&
        r.setting_key === "zerotier_api_token",
    );
    if (legacyToken?.setting_value) {
      const existing = await db.query(
        'SELECT value,"encryptedValue","isSecret" FROM "AppSetting" WHERE "group"=$1 AND key=$2',
        ["zerotier", "token"],
      );
      if (existing.rows.length) {
        const saved =
          existing.rows[0].isSecret && existing.rows[0].encryptedValue
            ? decrypt(existing.rows[0].encryptedValue)
            : existing.rows[0].value;
        if (saved !== legacyToken.setting_value)
          throw Error("Token ZeroTier tujuan berbeda; tidak akan ditimpa.");
      } else
        await db.query(
          'INSERT INTO "AppSetting" ("group",key,value,"encryptedValue","isSecret","updatedAt") VALUES ($1,$2,NULL,$3,true,$4)',
          [
            "zerotier",
            "token",
            encrypt(legacyToken.setting_value),
            dateRequired(legacyToken.updated_at),
          ],
        );
    }
    phase = "menyimpan network ZeroTier";
    for (const row of data.zerotier_networks) {
      if (row.account_id && !accounts[row.account_id])
        throw Error(`Akun ZeroTier network #${row.id} tidak ditemukan.`);
      const name = uniqueName(row.label, row.id, usedNetworks);
      networks[row.id] = await insertResource(
        db,
        "zerotier-network",
        name,
        {
          notes: row.notes || "",
          accountId: row.account_id ? accounts[row.account_id] : null,
          legacyId: Number(row.id),
        },
        null,
        !Number(row.is_deleted),
        Number(row.is_deleted) ? dateRequired(row.updated_at) : null,
        dateRequired(row.created_at),
        dateRequired(row.updated_at),
        String(row.network_id).toLowerCase(),
      );
    }
    phase = "menyimpan switch";
    for (const [index, row] of (data.switches.devices || []).entries()) {
      const name = uniqueName(row.name, index + 1, usedSwitches);
      switches[String(row.id)] = await insertResource(
        db,
        "switch-device",
        name,
        redact({ ...row, legacyId: String(row.id) }),
        null,
        true,
        null,
        new Date(),
        new Date(),
      );
    }
    const current = (
      await db.query(
        'SELECT state FROM "FloorMapState" WHERE key=$1 FOR UPDATE',
        ["default"],
      )
    ).rows[0].state;
    const oldState = json(
      data.floor_map_editor_state.find((r) => r.state_key === "default")
        ?.state_json,
    );
    const oldMarkers = new Map(
      (oldState.markers || []).map((m) => [String(m.id), m]),
    );
    const floorChanges = mergeFloorState(baselineFloor, oldState, current);
    let remappedMarkerLinks = 0;
    for (const marker of current.markers || []) {
      const previous = oldMarkers.get(String(marker.id));
      if (
        previous?.monitor_id &&
        String(marker.monitor_id) === String(previous.monitor_id) &&
        monitorMap[previous.monitor_id] &&
        String(marker.monitor_id) !== String(monitorMap[previous.monitor_id])
      ) {
        marker.monitor_id = monitorMap[previous.monitor_id];
        remappedMarkerLinks++;
      }
    }
    const markerById = new Map(
      (current.markers || []).map((m) => [String(m.id), m]),
    );
    let merged = 0,
      conflicts = 0;
    phase = "menyimpan rahasia denah";
    for (const row of data.floor_map_marker_secrets) {
      const marker = markerById.get(String(row.marker_id)),
        values = json(row.secret_json);
      if (!marker) {
        const name = uniqueName(
          String(row.marker_id),
          row.marker_id,
          usedSecrets,
        );
        orphanSecrets[row.marker_id] = await insertResource(
          db,
          "legacy-floor-secret",
          name,
          { legacyMarkerId: String(row.marker_id) },
          encrypt(JSON.stringify(values)),
          false,
          null,
          dateRequired(row.created_at),
          dateRequired(row.updated_at),
        );
        continue;
      }
      for (const [key, value] of Object.entries(values)) {
        if (typeof value !== "string" || !value) continue;
        if (marker[key]) {
          const old =
            typeof marker[key] === "string" && marker[key].startsWith("enc:v1:")
              ? decrypt(marker[key].slice(7))
              : marker[key];
          if (old !== value) conflicts++;
          continue;
        }
        marker[key] = secretKey.test(key) ? `enc:v1:${encrypt(value)}` : value;
        merged++;
      }
    }
    if (merged || remappedMarkerLinks || floorChanges.applied)
      await db.query(
        'UPDATE "FloorMapState" SET state=$1::jsonb WHERE key=$2',
        [JSON.stringify(current), "default"],
      );
    let unifi = null;
    const row = data.floor_map_unifi_controller[0];
    if (row) {
      const previous = await db.query(
        'SELECT id FROM "IntegrationResource" WHERE domain=$1 AND "deletedAt" IS NULL LIMIT 1',
        ["unifi"],
      );
      if (!previous.rows.length) {
        const password = legacyUnifiPassword(row);
        unifi = await insertResource(
          db,
          "unifi",
          row.controller_url,
          {
            site: row.site_name || "default",
            username: row.username || "",
            allowSelfSigned: Boolean(row.allow_self_signed),
            legacyId: Number(row.id),
          },
          password ? encrypt(password) : null,
          false,
          null,
          dateRequired(row.updated_at),
          dateRequired(row.updated_at),
        );
      }
    }
    phase = "menyalin riwayat";
    await db.query(
      "CREATE TEMP TABLE legacy_history (old_id bigint, monitor_id int, status text, latency_ms numeric(10,2), traffic_in_bps numeric(16,2), traffic_out_bps numeric(16,2), temperature numeric(6,2), recorded_at timestamptz) ON COMMIT DROP",
    );
    const copy = db.query(
      copyFrom(
        "COPY legacy_history (old_id,monitor_id,status,latency_ms,traffic_in_bps,traffic_out_bps,temperature,recorded_at) FROM STDIN",
      ),
    );
    await pipeline(
      fs.createReadStream(path.join(backupDir, "monitor-history.copy.gz")),
      zlib.createGunzip(),
      copy,
    );
    const staged = await db.query(
      "SELECT count(*)::bigint AS count, count(*) FILTER (WHERE status IS NULL)::bigint AS null_status FROM legacy_history",
    );
    if (
      Number(staged.rows[0].count) !== stage.count ||
      Number(staged.rows[0].null_status) !== stage.nullStatus
    )
      throw Error("Jumlah riwayat staging tidak cocok.");
    await db.query(
      "CREATE TEMP TABLE legacy_monitor_ids (old_id int PRIMARY KEY, new_id int NOT NULL) ON COMMIT DROP",
    );
    for (const [old, id] of Object.entries(monitorMap))
      await db.query("INSERT INTO legacy_monitor_ids VALUES ($1,$2)", [
        Number(old),
        id,
      ]);
    const offset = (
      await db.query(
        'SELECT COALESCE(MAX(id),0)::text AS value FROM "MonitorSample"',
      )
    ).rows[0].value;
    const inserted = await db.query(
      'INSERT INTO "MonitorSample" (id,"monitorId",status,"latencyMs","trafficInBps","trafficOutBps",temperature,"createdAt") SELECT h.old_id+$1::bigint,m.new_id,h.status::"MonitorStatus",h.latency_ms,h.traffic_in_bps,h.traffic_out_bps,h.temperature,h.recorded_at FROM legacy_history h JOIN legacy_monitor_ids m ON m.old_id=h.monitor_id',
      [offset],
    );
    if (inserted.rowCount !== stage.count)
      throw Error("Sebagian riwayat tidak dapat dipetakan.");
    phase = "menyimpan event";
    const eventMap = {};
    const eventOffset = BigInt(
      (
        await db.query(
          'SELECT COALESCE(MAX(id),0)::text AS value FROM "MonitorEvent"',
        )
      ).rows[0].value,
    );
    for (const e of data.network_monitor_events) {
      const id = eventOffset + BigInt(e.id);
      eventMap[e.id] = id.toString();
      await db.query(
        'INSERT INTO "MonitorEvent" (id,"monitorId","previousStatus","newStatus",message,"startedAt","endedAt","durationSeconds") VALUES ($1,$2,$3::"MonitorStatus",$4::"MonitorStatus",$5,$6,$7,$8)',
        [
          id.toString(),
          monitorMap[e.monitor_id],
          e.previous_status || null,
          e.new_status,
          e.message || null,
          dateRequired(e.started_at),
          date(e.ended_at),
          e.duration_seconds,
        ],
      );
    }
    for (const table of ["MonitorSample", "MonitorEvent"])
      await db.query(
        `SELECT setval(pg_get_serial_sequence('"${table}"','id'),GREATEST(COALESCE((SELECT MAX(id) FROM "${table}"),0),1),true)`,
      );
    phase = "memverifikasi isi riwayat";
    const check = await db.query(
      'SELECT count(*)::bigint AS count,count(*) FILTER (WHERE s.status IS NULL)::bigint AS null_status FROM "MonitorSample" s JOIN legacy_history h ON s.id=h.old_id+$1::bigint JOIN legacy_monitor_ids m ON m.old_id=h.monitor_id AND m.new_id=s."monitorId" WHERE s.status IS NOT DISTINCT FROM h.status::"MonitorStatus" AND s."latencyMs" IS NOT DISTINCT FROM h.latency_ms AND s."trafficInBps" IS NOT DISTINCT FROM h.traffic_in_bps AND s."trafficOutBps" IS NOT DISTINCT FROM h.traffic_out_bps AND s.temperature IS NOT DISTINCT FROM h.temperature AND s."createdAt"=h.recorded_at',
      [offset],
    );
    if (
      Number(check.rows[0].count) !== stage.count ||
      Number(check.rows[0].null_status) !== stage.nullStatus
    )
      throw Error("Isi riwayat setelah migrasi tidak cocok.");
    const config = {
      source: summary.source,
      mappings: {
        monitors: monitorMap,
        accounts,
        networks,
        switches,
        orphanSecrets,
        events: eventMap,
        unifi,
      },
      history: { ...stage, offset },
      matchedExistingMonitors: matched,
      floorChanges,
      markerSecretsMerged: merged,
      remappedMarkerLinks,
      markerSecretConflicts: conflicts,
      completedAt: new Date().toISOString(),
    };
    await insertResource(
      db,
      "legacy-migration",
      checkpoint,
      config,
      null,
      true,
      null,
      new Date(),
      new Date(),
    );
    await db.query("COMMIT");
    return config;
  } catch (error) {
    await db.query("ROLLBACK");
    error.phase = phase;
    throw error;
  }
}
async function verify(db) {
  const result = await db.query(
    'SELECT config FROM "IntegrationResource" WHERE domain=$1 AND name=$2 AND "deletedAt" IS NULL',
    ["legacy-migration", checkpoint],
  );
  if (!result.rows.length) throw Error("Migrasi jaringan belum dijalankan.");
  const c = result.rows[0].config,
    m = c.mappings;
  const rows = {};
  for (const [key, table] of [
    ["monitors", "NetworkMonitor"],
    ["accounts", "IntegrationResource"],
    ["networks", "IntegrationResource"],
    ["switches", "IntegrationResource"],
    ["orphanSecrets", "IntegrationResource"],
  ]) {
    const ids = [...new Set(Object.values(m[key]).map(Number))];
    const n = ids.length
      ? (
          await db.query(
            `SELECT count(*)::int AS n FROM "${table}" WHERE id=ANY($1::int[])`,
            [ids],
          )
        ).rows[0].n
      : 0;
    rows[key] = { expected: ids.length, found: n };
  }
  const eventIds = Object.values(m.events);
  const e = eventIds.length
    ? (
        await db.query(
          'SELECT count(*)::int n FROM "MonitorEvent" WHERE id=ANY($1::bigint[])',
          [eventIds],
        )
      ).rows[0].n
    : 0;
  rows.events = { expected: eventIds.length, found: e };
  const min = (BigInt(c.history.offset) + BigInt(c.history.min)).toString(),
    max = (BigInt(c.history.offset) + BigInt(c.history.max)).toString();
  const h = (
    await db.query(
      'SELECT count(*)::bigint AS count,count(*) FILTER (WHERE status IS NULL)::bigint AS null_status FROM "MonitorSample" WHERE id BETWEEN $1::bigint AND $2::bigint',
      [min, max],
    )
  ).rows[0];
  rows.history = {
    expected: c.history.count,
    found: Number(h.count),
    expectedNullStatus: c.history.nullStatus,
    foundNullStatus: Number(h.null_status),
  };
  const ok =
    Object.values(rows).every((v) => v.expected === v.found) &&
    rows.history.expectedNullStatus === rows.history.foundNullStatus;
  return {
    ok,
    rows,
    floorChanges: c.floorChanges,
    markerSecretsMerged: c.markerSecretsMerged,
    markerSecretConflicts: c.markerSecretConflicts,
    unifiImported: Boolean(m.unifi),
  };
}
async function main() {
  const mode = process.argv[2] || "analyze";
  if (!["analyze", "dry-run", "execute", "verify"].includes(mode))
    throw Error("Gunakan analyze, dry-run, execute, atau verify.");
  if (
    !process.env.DATABASE_URL ||
    !process.env.ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY === "development-only-key"
  )
    throw Error("DATABASE_URL dan ENCRYPTION_KEY harus dikonfigurasi.");
  const db = await targetConnection();
  let c;
  try {
    if (mode === "verify") {
      const result = await verify(db);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
      return;
    }
    c = await sourceConnection();
    const data = await readSmall(c);
    const summary = await summarize(db, c, data);
    console.log(JSON.stringify(summary, null, 2));
    if (mode !== "execute") {
      if (summary.problems.length) process.exitCode = 1;
      await c.query("COMMIT");
      return;
    }
    if (summary.alreadyMigrated || summary.problems.length)
      throw Error(
        "Migrasi dibatalkan: sudah berjalan atau ada masalah pada dry-run.",
      );
    const baselineFloor = await initialFloorState(db);
    const backupRoot =
      process.env.MIGRATION_BACKUP_ROOT ||
      path.join(root, ".migration-backups");
    await fsp.mkdir(backupRoot, { recursive: true, mode: 0o700 });
    await fsp.chmod(backupRoot, 0o700);
    const backupDir = await fsp.mkdtemp(path.join(backupRoot, "network-"));
    await fsp.chmod(backupDir, 0o700);
    backupPostgres(backupDir);
    await fsp.writeFile(
      path.join(backupDir, "source-snapshot.json"),
      JSON.stringify(data),
      { mode: 0o600, flag: "wx" },
    );
    console.log("Mencadangkan riwayat monitoring ke file terkompresi.");
    const stage = await stageHistory(
      c,
      path.join(backupDir, "monitor-history.copy.gz"),
      new Set(data.network_monitors.map((r) => Number(r.id))),
    );
    if (stage.count !== summary.source.history)
      throw Error("Jumlah riwayat berubah dalam snapshot sumber.");
    await c.query("COMMIT");
    await c.end();
    c = null;
    console.log(
      `Menyimpan ${stage.count} riwayat monitoring ke database tujuan.`,
    );
    await migrate(db, data, summary, stage, backupDir, baselineFloor);
    const result = await verify(db);
    console.log(JSON.stringify({ backupDir, verification: result }, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    if (c) await c.end().catch(() => {});
    await db.end();
  }
}
main().catch((error) => {
  console.error(
    "Migrasi gagal:",
    error.code
      ? `${error.code}${error.phase ? ` pada tahap ${error.phase}` : ""}`
      : error.message,
  );
  process.exitCode = 1;
});
