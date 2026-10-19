const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const mysql = require("mysql2/promise");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const dotenv = require("dotenv");

const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
dotenv.config({ path: path.join(root, ".env"), quiet: true });
const { PrismaClient } = require("@prisma/client");
const sourceRoot = process.env.LEGACY_ROOT || "/mnt/www/webapp/it_inventory";
const uploadRoot = path.resolve(
  root,
  "apps/api",
  process.env.UPLOAD_ROOT || "uploads",
);
const checkpointName = "it-inventory-legacy-v1";
const tables = [
  "users",
  "categories",
  "locations",
  "items",
  "custom_fields",
  "item_custom_data",
  "item_history",
  "item_photos",
  "item_external_sync_data",
  "app_settings",
  "adds_services",
  "floor_map_editor_state",
  "floor_map_editor_blue_iris_default",
  "floor_map_areas",
  "floor_map_permissions",
  "floor_map_permission_groups",
  "floor_map_permission_group_members",
  "asset_map_positions",
  "asset_map_rooms",
  "asset_map_room_items",
];
const secretKey = /password|secret|token|community|pass$/i;
const stamp = (value) =>
  value && !String(value).startsWith("0000-00-00")
    ? new Date(
        String(value).replace(" ", "T") +
          (String(value).length === 10 ? "T00:00:00+07:00" : "+07:00"),
      )
    : null;
const requiredDate = (value) =>
  stamp(value) || new Date("1970-01-01T00:00:00Z");
const deleted = (row) =>
  Number(row.is_deleted)
    ? requiredDate(row.updated_at || row.created_at)
    : null;
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
function encrypt(value) {
  const key = crypto
    .createHash("sha256")
    .update(process.env.ENCRYPTION_KEY)
    .digest();
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64");
}
function protect(value) {
  if (Array.isArray(value)) return value.map(protect);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      secretKey.test(key) && typeof item === "string" && item
        ? `enc:v1:${encrypt(item)}`
        : protect(item),
    ]),
  );
}
async function sourceConfig() {
  const text = await fs.readFile(
    path.join(sourceRoot, "api/config/database.local.php"),
    "utf8",
  );
  const get = (key) =>
    text.match(new RegExp(`["']${key}["']\\s*=>\\s*["']([^"']*)`))?.[1];
  const config = {
    host: get("host"),
    user: get("username"),
    password: get("password"),
    database: get("db_name"),
  };
  if (Object.values(config).some((x) => x == null))
    throw Error("Konfigurasi database lama tidak lengkap.");
  return config;
}
async function readSource(config) {
  const connection = await mysql.createConnection({
    ...config,
    charset: "utf8mb4",
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 10000,
    multipleStatements: false,
  });
  try {
    await connection.query("SET SESSION time_zone = '+07:00'");
    await connection.query(
      "SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ",
    );
    await connection.query(
      "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY",
    );
    const [existing] = await connection.query(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE()",
    );
    const present = new Set(existing.map((row) => row.TABLE_NAME));
    const data = {};
    for (const table of tables)
      data[table] = present.has(table)
        ? (await connection.query(`SELECT * FROM \`${table}\``))[0]
        : [];
    await connection.query("COMMIT");
    return data;
  } finally {
    await connection.end();
  }
}
function key(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("en-US");
}
function mapping(source, target, sourceName, targetName) {
  const map = {},
    toCreate = [],
    ids = new Set(target.map((row) => Number(row.id))),
    reserved = new Set([...ids, ...source.map((row) => Number(row.id))]);
  const names = new Map(target.map((row) => [targetName(row), row]));
  let next = Math.max(0, ...reserved) + 1,
    collisions = 0,
    matched = 0;
  for (const row of source) {
    const natural = sourceName(row);
    if (natural && names.has(natural)) {
      map[row.id] = Number(names.get(natural).id);
      matched++;
      continue;
    }
    let id = Number(row.id);
    if (ids.has(id)) {
      while (reserved.has(next)) next++;
      id = next++;
      reserved.add(id);
      collisions++;
    }
    if (ids.has(id)) throw Error("ID sumber duplikat.");
    ids.add(id);
    map[row.id] = id;
    toCreate.push(row);
    if (natural) names.set(natural, { id });
  }
  return { map, toCreate, collisions, matched };
}
function idMap(source, target) {
  return mapping(
    source,
    target,
    () => "",
    () => "",
  );
}
async function plan(db, data) {
  const checkpoint = await db.integrationResource.findFirst({
    where: {
      domain: "legacy-migration",
      name: checkpointName,
      deletedAt: null,
    },
  });
  const [
    users,
    categories,
    locations,
    assets,
    fields,
    history,
    photos,
    integrations,
    areas,
    groups,
    rooms,
  ] = await Promise.all([
    db.user.findMany({ select: { id: true, username: true } }),
    db.category.findMany({ select: { id: true, name: true, itemType: true } }),
    db.location.findMany({ select: { id: true, name: true } }),
    db.asset.findMany({ select: { id: true, code: true } }),
    db.customField.findMany({ select: { id: true, fieldName: true } }),
    db.assetHistory.findMany({ select: { id: true } }),
    db.assetPhoto.findMany({ select: { id: true } }),
    db.integrationResource.findMany({
      select: { id: true, domain: true, name: true },
    }),
    db.floorMapArea.findMany({ select: { id: true, slug: true } }),
    db.floorMapGroup.findMany({ select: { id: true, name: true } }),
    db.mapAssetRoom.findMany({ select: { id: true } }),
  ]);
  const uniqueAdds = data.adds_services.map((row) => ({
    ...row,
    targetName: row.service_name,
  }));
  const names = new Set(
    integrations
      .filter((row) => row.domain === "adds")
      .map((row) => key(row.name)),
  );
  for (const row of uniqueAdds) {
    let name = row.service_name;
    if (names.has(key(name))) name = `${name} (legacy ${row.id})`;
    row.targetName = name;
    names.add(key(name));
  }
  const maps = {
    users: mapping(
      data.users,
      users,
      (r) => key(r.username),
      (r) => key(r.username),
    ),
    categories: mapping(
      data.categories,
      categories,
      (r) => `${key(r.name)}|${key(r.item_type || "other")}`,
      (r) => `${key(r.name)}|${key(r.itemType)}`,
    ),
    locations: mapping(
      data.locations,
      locations,
      (r) => key(r.name),
      (r) => key(r.name),
    ),
    assets: mapping(
      data.items,
      assets,
      (r) => key(r.code),
      (r) => key(r.code),
    ),
    fields: mapping(
      data.custom_fields,
      fields,
      (r) => key(r.field_name),
      (r) => key(r.fieldName),
    ),
    history: idMap(data.item_history, history),
    photos: idMap(data.item_photos, photos),
    adds: idMap(uniqueAdds, integrations),
    areas: mapping(
      data.floor_map_areas,
      areas,
      (r) => key(r.slug),
      (r) => key(r.slug),
    ),
    groups: mapping(
      data.floor_map_permission_groups,
      groups,
      (r) => key(r.name),
      (r) => key(r.name),
    ),
    rooms: idMap(data.asset_map_rooms, rooms),
  };
  const problems = [];
  for (const row of data.items) {
    if (
      !maps.categories.map[row.category_id] ||
      !maps.locations.map[row.location_id]
    )
      problems.push(
        `Aset #${row.id} memiliki referensi kategori/lokasi yang hilang.`,
      );
    if (
      !["available", "in_use", "maintenance", "retired", "disposed"].includes(
        row.status,
      )
    )
      problems.push(`Aset #${row.id} memiliki status tidak dikenal.`);
    if (
      row.condition_grade &&
      !["new", "good", "fair", "poor", "broken"].includes(row.condition_grade)
    )
      problems.push(`Aset #${row.id} memiliki kondisi tidak dikenal.`);
  }
  for (const row of [
    ...data.item_history,
    ...data.item_photos,
    ...data.item_custom_data,
  ])
    if (!maps.assets.map[row.item_id])
      problems.push(`Referensi aset #${row.item_id} tidak ditemukan.`);
  for (const row of data.floor_map_permission_group_members)
    if (!maps.users.map[row.user_id] || !maps.groups.map[row.group_id])
      problems.push("Anggota grup floor map memiliki referensi yang hilang.");
  for (const row of data.asset_map_room_items)
    if (!maps.assets.map[row.item_id] || !maps.rooms.map[row.room_id])
      problems.push("Isi room memiliki referensi yang hilang.");
  const currentState = await db.floorMapState.findUnique({
    where: { key: "default" },
  });
  if (currentState && data.floor_map_editor_state.length)
    problems.push("State floor map tujuan sudah terisi; tidak akan ditimpa.");
  const result = {
    checkpoint,
    maps,
    problems,
    missingAreaBackgrounds: data.floor_map_areas
      .filter(
        (r) =>
          r.background_file &&
          !fsSync.existsSync(
            path.join(
              sourceRoot,
              "api/uploads/floor-maps",
              path.basename(r.background_file),
            ),
          ),
      )
      .map((r) => Number(r.id)),
    sourceCounts: Object.fromEntries(
      tables.map((table) => [table, data[table].length]),
    ),
  };
  return result;
}
function report(plan) {
  return {
    alreadyMigrated: Boolean(plan.checkpoint),
    sourceCounts: plan.sourceCounts,
    mappings: Object.fromEntries(
      Object.entries(plan.maps).map(([name, value]) => [
        name,
        {
          create: value.toCreate.length,
          existing: value.matched,
          idConflicts: value.collisions,
        },
      ]),
    ),
    problems: plan.problems,
    missingAreaBackgrounds: plan.missingAreaBackgrounds,
  };
}
function settingsMap(data) {
  const mapping = {
    storage_s3_endpoint: ["storage", "endpoint"],
    storage_s3_region: ["storage", "region"],
    storage_s3_bucket: ["storage", "bucket"],
    storage_s3_access_key: ["storage", "access_key"],
    storage_s3_secret_key: ["storage", "secret_key"],
    adds_default_service_id: ["adds", "default_service"],
    adds_auto_sync_enabled: ["adds", "auto_sync"],
    adds_sync_interval_minutes: ["adds", "interval"],
    adds_auto_create_users: ["adds", "auto_create_users"],
    adds_default_email_domain: ["adds", "default_email_domain"],
    adds_account_suffix: ["adds", "account_suffix"],
    adds_notes: ["adds", "notes"],
  };
  return data.app_settings
    .filter((row) => mapping[row.setting_key])
    .map((row) => ({
      ...row,
      group: mapping[row.setting_key][0],
      key: mapping[row.setting_key][1],
    }));
}
function json(value, fallback) {
  if (!value) return fallback;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw Error("JSON state floor map tidak valid.");
  }
}
async function stageFiles(data, directory) {
  const files = [];
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  async function stage(buffer, relative, metadata) {
    const digest = hash(buffer),
      name = `${files.length}-${crypto.randomUUID()}`;
    await fs.writeFile(path.join(directory, name), buffer, {
      mode: 0o600,
      flag: "wx",
    });
    files.push({
      source: metadata,
      relative,
      size: buffer.length,
      sha256: digest,
      staged: name,
    });
    return { digest, index: files.length - 1 };
  }
  for (const folder of ["floor-map-assets", "floor-map-icons"]) {
    const source = path.join(sourceRoot, folder);
    for (const entry of await fs.readdir(source, { withFileTypes: true })) {
      if (
        !entry.isFile() ||
        !/^(page-(?:[1-9]|[1-9][0-9])\.png|backround\.vsd|background_meta\.json|icon-[a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp)|cctv-reference-[a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp))$/i.test(
          entry.name,
        )
      )
        continue;
      await stage(
        await fs.readFile(path.join(source, entry.name)),
        `${folder}/${entry.name}`,
        { kind: folder, name: entry.name },
      );
    }
  }
  for (const area of data.floor_map_areas) {
    if (!area.background_file) continue;
    const filename = path.basename(area.background_file);
    if (
      filename !== area.background_file ||
      !/\.(png|jpg|jpeg|webp)$/i.test(filename)
    )
      throw Error(`Nama background area #${area.id} tidak aman.`);
    const source = path.join(sourceRoot, "api/uploads/floor-maps", filename);
    if (fsSync.existsSync(source))
      await stage(await fs.readFile(source), `floor-maps/${filename}`, {
        kind: "floor-area",
        id: Number(area.id),
      });
  }
  const storage = Object.fromEntries(
    data.app_settings
      .filter((row) => row.setting_group === "storage")
      .map((row) => [row.setting_key, row.setting_value]),
  );
  const s3 = new S3Client({
    endpoint: storage.storage_s3_endpoint,
    region: storage.storage_s3_region || "us-east-1",
    credentials: {
      accessKeyId: storage.storage_s3_access_key,
      secretAccessKey: storage.storage_s3_secret_key,
    },
    forcePathStyle: true,
    requestHandler: { connectionTimeout: 10000, requestTimeout: 30000 },
    maxAttempts: 2,
  });
  try {
    for (const photo of data.item_photos) {
      const filename = path.basename(photo.file_name);
      if (filename !== photo.file_name)
        throw Error(`Nama file foto #${photo.id} tidak aman.`);
      let buffer;
      if (photo.storage === "s3") {
        const result = await s3.send(
          new GetObjectCommand({
            Bucket: storage.storage_s3_bucket,
            Key: `item-photos/${filename}`,
          }),
        );
        buffer = Buffer.from(await result.Body.transformToByteArray());
      } else if (photo.storage === "local")
        buffer = await fs.readFile(
          path.join(sourceRoot, "api/uploads/assets", filename),
        );
      else throw Error(`Storage foto #${photo.id} tidak didukung.`);
      if (buffer.length !== Number(photo.file_size))
        throw Error(`Ukuran foto #${photo.id} tidak cocok.`);
      const ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
      }[photo.mime_type];
      if (!ext) throw Error(`Tipe foto #${photo.id} tidak didukung.`);
      const relative = `assets/legacy-${photo.id}-${hash(buffer).slice(0, 20)}${ext}`;
      const file = await stage(buffer, relative, {
        kind: "asset-photo",
        id: Number(photo.id),
        storage: photo.storage,
      });
      photo.targetFilename = path.basename(relative);
      photo.fileManifestIndex = file.index;
    }
  } finally {
    s3.destroy();
  }
  return files;
}
async function publishFiles(files, directory) {
  const created = [];
  try {
    for (const file of files) {
      const destination = path.join(uploadRoot, file.relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      try {
        await fs.copyFile(
          path.join(directory, file.staged),
          destination,
          fsSync.constants.COPYFILE_EXCL,
        );
        created.push(destination);
        file.status = "copied";
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const current = await fs.readFile(destination);
        if (hash(current) !== file.sha256)
          throw Error(`File tujuan bentrok: ${file.relative}`);
        file.status = "already-present";
      }
    }
    return created;
  } catch (error) {
    for (const file of created) await fs.unlink(file).catch(() => {});
    throw error;
  }
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
  const result = spawnSync(
    "pg_dump",
    [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--file",
      path.join(dir, "target-before.dump"),
    ],
    { env, encoding: "utf8", timeout: 120000 },
  );
  if (result.status !== 0)
    throw Error(
      `Backup PostgreSQL gagal: ${result.stderr.replace(/password[^\n]*/gi, "[redacted]").trim()}`,
    );
  fsSync.chmodSync(path.join(dir, "target-before.dump"), 0o600);
}
function rowsInBatches(rows, size = 300) {
  const result = [];
  for (let i = 0; i < rows.length; i += size)
    result.push(rows.slice(i, i + size));
  return result;
}
async function insertMany(model, rows) {
  for (const batch of rowsInBatches(rows))
    if (batch.length) await model.createMany({ data: batch });
}
async function execute(db, data, plan, files, backupDir) {
  const m = Object.fromEntries(
    Object.entries(plan.maps).map(([name, x]) => [name, x.map]),
  );
  const created = await publishFiles(files, path.join(backupDir, "staged"));
  try {
    await db.$transaction(
      async (tx) => {
        await insertMany(
          tx.user,
          plan.maps.users.toCreate.map((r) => ({
            id: m.users[r.id],
            username: r.username,
            passwordHash: r.password,
            fullname: r.full_name || r.username,
            email: r.email || null,
            role: r.role === "admin" ? "admin" : "user",
            deletedAt: deleted(r),
            createdAt: requiredDate(r.created_at),
            updatedAt: requiredDate(r.updated_at),
          })),
        );
        await insertMany(
          tx.category,
          plan.maps.categories.toCreate.map((r) => ({
            id: m.categories[r.id],
            name: r.name,
            itemType: r.item_type || "other",
            description: r.description || null,
            deletedAt: deleted(r),
            createdAt: requiredDate(r.created_at),
            updatedAt: requiredDate(r.updated_at),
          })),
        );
        await insertMany(
          tx.location,
          plan.maps.locations.toCreate.map((r) => ({
            id: m.locations[r.id],
            name: r.name,
            description: r.address || null,
            deletedAt: deleted(r),
            createdAt: requiredDate(r.created_at),
            updatedAt: requiredDate(r.updated_at),
          })),
        );
        await insertMany(
          tx.customField,
          plan.maps.fields.toCreate.map((r) => ({
            id: m.fields[r.id],
            fieldName: r.field_name,
            fieldLabel: r.field_label,
            fieldType: r.field_type,
            isRequired: Boolean(r.is_required),
            deletedAt: Number(r.is_active) ? null : requiredDate(r.updated_at),
            createdAt: requiredDate(r.created_at),
            updatedAt: requiredDate(r.updated_at),
          })),
        );
        await insertMany(
          tx.asset,
          plan.maps.assets.toCreate.map((r) => ({
            id: m.assets[r.id],
            code: r.code,
            name: r.name,
            categoryId: m.categories[r.category_id],
            locationId: m.locations[r.location_id],
            macAddress: r.mac_address || null,
            serialNumber: r.serial_number || null,
            description: r.description || null,
            purchaseDate: stamp(r.purchase_date),
            price: r.price,
            status: r.status,
            condition: r.condition_grade || null,
            assignedUserId: r.assigned_to
              ? m.users[r.assigned_to] || null
              : null,
            assignedSource:
              r.assignee_source === "hr"
                ? "hr"
                : r.assigned_to || r.assignee_source === "local"
                  ? "local"
                  : null,
            assigneeName: r.assignee_name || r.user_name || null,
            assigneeCode: r.assignee_code || null,
            assigneeCompany: r.assignee_company || null,
            assignedAt: stamp(r.assigned_at),
            assignedById: r.assigned_by ? m.users[r.assigned_by] || null : null,
            assignmentNote: r.assignment_note || null,
            expectedReturnAt: stamp(r.expected_return_at),
            retiredAt: stamp(r.retired_at),
            retiredReason: r.retired_reason || null,
            externalSource: r.external_source || null,
            externalId:
              r.external_asset_id == null ? null : String(r.external_asset_id),
            externalHidden: Boolean(r.external_sync_hidden_at),
            deletedAt: deleted(r),
            createdAt: requiredDate(r.created_at),
            updatedAt: requiredDate(r.updated_at),
          })),
        );
        const createdAssets = new Set(
          plan.maps.assets.toCreate.map((row) => Number(row.id)),
        );
        await insertMany(
          tx.assetCustomData,
          data.item_custom_data
            .filter((r) => createdAssets.has(Number(r.item_id)))
            .map((r) => ({
              assetId: m.assets[r.item_id],
              fieldName: r.field_name,
              value: r.field_value,
              updatedAt: requiredDate(r.updated_at),
            })),
        );
        const external = data.item_external_sync_data
          .filter((r) => createdAssets.has(Number(r.item_id)))
          .map((r) => ({
            assetId: m.assets[r.item_id],
            fieldName: "legacy_external_snapshot",
            value: JSON.stringify(r),
            updatedAt: requiredDate(r.synced_at),
          }));
        await insertMany(tx.assetCustomData, external);
        const validStatus = (value) =>
          [
            "available",
            "in_use",
            "maintenance",
            "retired",
            "disposed",
          ].includes(value)
            ? value
            : null;
        await insertMany(
          tx.assetHistory,
          plan.maps.history.toCreate.map((r) => ({
            id: m.history[r.id],
            assetId: m.assets[r.item_id],
            eventType: r.event_type || r.action || "legacy",
            actorId: r.actor_user_id ? m.users[r.actor_user_id] || null : null,
            statusFrom: validStatus(r.status_from),
            statusTo: validStatus(r.status_to),
            assigneeSnapshot: {
              name: r.user_name,
              code: r.assignee_code,
              assignedUserId: r.assigned_user_id
                ? m.users[r.assigned_user_id] || null
                : null,
            },
            locationSnapshot: {
              legacyLocationId: r.location_id,
              locationId: r.location_id
                ? m.locations[r.location_id] || null
                : null,
            },
            note: r.notes || null,
            metadata: { legacyAction: r.action, legacyActorName: r.actor_name },
            createdAt: requiredDate(r.created_at),
          })),
        );
        await insertMany(
          tx.assetPhoto,
          plan.maps.photos.toCreate.map((r) => ({
            id: m.photos[r.id],
            assetId: m.assets[r.item_id],
            internalName: r.targetFilename,
            originalName: r.original_file_name,
            mimeType: r.mime_type,
            size: Number(r.file_size),
            storage: "local",
            createdAt: requiredDate(r.created_at),
          })),
        );
        await insertMany(
          tx.integrationResource,
          plan.maps.adds.toCreate.map((r) => ({
            id: m.adds[r.id],
            domain: "adds",
            name: r.targetName,
            config: {
              url: `${Number(r.use_ssl) ? "ldaps" : "ldap"}://${r.host}:${r.port}`,
              baseDn: r.base_dn,
              bindDn: r.bind_dn || "",
              startTls: Boolean(r.use_tls),
              domain: r.domain_name,
              netbios: r.netbios_name,
              searchFilter: r.search_filter,
              syncEnabled: Boolean(r.sync_enabled),
              priority: Number(r.priority_order),
              description: r.description,
              legacyId: Number(r.id),
            },
            secret: r.bind_password ? encrypt(r.bind_password) : null,
            active: Boolean(r.is_active),
            deletedAt: deleted(r),
            createdAt: requiredDate(r.created_at),
            updatedAt: requiredDate(r.updated_at),
          })),
        );
        await tx.$queryRawUnsafe(
          `SELECT setval(pg_get_serial_sequence('"IntegrationResource"','id'), GREATEST(COALESCE((SELECT MAX(id) FROM "IntegrationResource"),0),1), true)`,
        );
        for (const r of settingsMap(data)) {
          const existing = await tx.appSetting.findUnique({
            where: { group_key: { group: r.group, key: r.key } },
          });
          if (existing) continue;
          const sensitive =
            r.group === "storage" &&
            ["access_key", "secret_key"].includes(r.key);
          let value = r.setting_value;
          if (
            r.group === "adds" &&
            ["auto_sync", "auto_create_users"].includes(r.key)
          )
            value = value === "1" ? "true" : "false";
          if (r.group === "adds" && r.key === "default_service" && value)
            value = String(m.adds[value] || "");
          await tx.appSetting.create({
            data: {
              group: r.group,
              key: r.key,
              value: sensitive ? null : value,
              encryptedValue: sensitive && value ? encrypt(value) : null,
              isSecret: sensitive,
              updatedAt: requiredDate(r.updated_at),
            },
          });
        }
        if (data.floor_map_editor_state.length) {
          const row = data.floor_map_editor_state.find(
            (r) => r.state_key === "default",
          );
          if (row) {
            const state = json(row.state_json, {});
            state.coordinateSpace = "pixels";
            const meta = json(
              await fs.readFile(
                path.join(sourceRoot, "floor-map-assets/background_meta.json"),
                "utf8",
              ),
              {},
            );
            state.pageNames = { ...meta.page_names, ...state.pageNames };
            await tx.floorMapState.create({
              data: {
                key: "default",
                state: protect(state),
                updatedBy: row.updated_by
                  ? m.users[row.updated_by] || null
                  : null,
                updatedAt: requiredDate(row.updated_at),
              },
            });
          }
        }
        await insertMany(
          tx.floorMapArea,
          plan.maps.areas.toCreate.map((r) => ({
            id: m.areas[r.id],
            name: r.name,
            slug: r.slug,
            description: r.description || null,
            background: r.background_file || null,
            canvasWidth: Number(r.canvas_width),
            canvasHeight: Number(r.canvas_height),
            state: protect(json(r.map_state_json, {})),
            sortOrder: Number(r.sort_order),
            deletedAt: deleted(r),
            createdAt: requiredDate(r.created_at),
            updatedAt: requiredDate(r.updated_at),
          })),
        );
        await insertMany(
          tx.floorMapPermission,
          data.floor_map_permissions.map((r) => ({
            userId: m.users[r.user_id],
            access: r.access_level,
            updatedAt: requiredDate(r.updated_at),
          })),
        );
        await insertMany(
          tx.floorMapGroup,
          plan.maps.groups.toCreate.map((r) => ({
            id: m.groups[r.id],
            name: r.name,
            access: r.access_level,
          })),
        );
        await insertMany(
          tx.floorMapGroupMember,
          data.floor_map_permission_group_members.map((r) => ({
            groupId: m.groups[r.group_id],
            userId: m.users[r.user_id],
          })),
        );
        await insertMany(
          tx.mapAssetRoom,
          plan.maps.rooms.toCreate.map((r) => ({
            id: m.rooms[r.id],
            name: r.name,
            x: Number(r.x),
            y: Number(r.y),
            createdAt: requiredDate(r.created_at),
            updatedAt: requiredDate(r.updated_at),
          })),
        );
        await insertMany(
          tx.mapAssetPosition,
          data.asset_map_positions.map((r) => ({
            assetId: m.assets[r.item_id],
            x: Number(r.x),
            y: Number(r.y),
            placedBy: m.users[r.placed_by] || m.users[data.users[0]?.id],
            updatedAt: requiredDate(r.updated_at),
          })),
        );
        await insertMany(
          tx.mapAssetRoomItem,
          data.asset_map_room_items.map((r) => ({
            roomId: m.rooms[r.room_id],
            assetId: m.assets[r.item_id],
            addedAt: requiredDate(r.created_at),
          })),
        );
        const defaultBlueIris = data.floor_map_editor_blue_iris_default[0];
        if (defaultBlueIris)
          await tx.integrationResource.create({
            data: {
              domain: "legacy-floor-map",
              name: "blue-iris-default",
              config: {
                server: defaultBlueIris.server,
                username: defaultBlueIris.username,
              },
              secret: defaultBlueIris.password
                ? encrypt(defaultBlueIris.password)
                : null,
            },
          });
        await tx.integrationResource.create({
          data: {
            domain: "legacy-migration",
            name: checkpointName,
            config: {
              mappings: m,
              sourceCounts: plan.sourceCounts,
              completedAt: new Date().toISOString(),
              fileManifest: files.map(
                ({ source, relative, size, sha256, status }) => ({
                  source,
                  relative,
                  size,
                  sha256,
                  status,
                }),
              ),
            },
          },
        });
        for (const table of [
          "User",
          "Category",
          "Location",
          "CustomField",
          "Asset",
          "AssetHistory",
          "AssetPhoto",
          "IntegrationResource",
          "FloorMapArea",
          "FloorMapPermission",
          "FloorMapGroup",
          "MapAssetRoom",
        ])
          await tx.$queryRawUnsafe(
            `SELECT setval(pg_get_serial_sequence('"${table}"','id'), GREATEST(COALESCE((SELECT MAX(id) FROM "${table}"),0),1), true)`,
          );
      },
      { timeout: 120000, maxWait: 10000 },
    );
  } catch (error) {
    for (const file of created) await fs.unlink(file).catch(() => {});
    throw error;
  }
}
async function verify(db, checkpoint) {
  const config = checkpoint.config,
    m = config.mappings;
  const result = {};
  for (const [name, model] of [
    ["users", db.user],
    ["categories", db.category],
    ["locations", db.location],
    ["assets", db.asset],
    ["fields", db.customField],
    ["history", db.assetHistory],
    ["photos", db.assetPhoto],
    ["adds", db.integrationResource],
    ["areas", db.floorMapArea],
    ["groups", db.floorMapGroup],
    ["rooms", db.mapAssetRoom],
  ]) {
    const ids = [...new Set(Object.values(m[name]).map(Number))];
    const count = ids.length
      ? await model.count({ where: { id: { in: ids } } })
      : 0;
    result[name] = { expected: ids.length, found: count };
  }
  const errors = [];
  for (const file of config.fileManifest) {
    try {
      const buffer = await fs.readFile(path.join(uploadRoot, file.relative));
      if (buffer.length !== file.size || hash(buffer) !== file.sha256)
        errors.push(file.relative);
    } catch {
      errors.push(file.relative);
    }
  }
  return {
    rows: result,
    files: config.fileManifest.length,
    fileErrors: errors,
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
  const db = new PrismaClient();
  try {
    if (mode === "verify") {
      const checkpoint = await db.integrationResource.findFirst({
        where: {
          domain: "legacy-migration",
          name: checkpointName,
          deletedAt: null,
        },
      });
      if (!checkpoint) throw Error("Migrasi belum dijalankan.");
      const result = await verify(db, checkpoint);
      console.log(JSON.stringify(result, null, 2));
      if (
        result.fileErrors.length ||
        Object.values(result.rows).some((r) => r.expected !== r.found)
      )
        process.exitCode = 1;
      return;
    }
    const data = await readSource(await sourceConfig());
    const proposed = await plan(db, data);
    console.log(JSON.stringify(report(proposed), null, 2));
    if (mode !== "execute") {
      if (proposed.problems.length) process.exitCode = 1;
      return;
    }
    if (proposed.checkpoint)
      throw Error(
        "Migrasi sudah dijalankan. Gunakan verify; data tidak ditimpa.",
      );
    if (proposed.problems.length)
      throw Error("Migrasi dibatalkan karena masalah pada dry-run.");
    const backupRoot =
      process.env.MIGRATION_BACKUP_ROOT ||
      path.join(root, ".migration-backups");
    await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
    await fs.chmod(backupRoot, 0o700);
    const backupDir = await fs.mkdtemp(path.join(backupRoot, "legacy-"));
    await fs.chmod(backupDir, 0o700);
    backupPostgres(backupDir);
    await fs.writeFile(
      path.join(backupDir, "source-snapshot.json"),
      JSON.stringify(data),
      { mode: 0o600, flag: "wx" },
    );
    const files = await stageFiles(data, path.join(backupDir, "staged"));
    await fs.writeFile(
      path.join(backupDir, "file-manifest.json"),
      JSON.stringify(
        files.map(({ source, relative, size, sha256 }) => ({
          source,
          relative,
          size,
          sha256,
        })),
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    await execute(db, data, proposed, files, backupDir);
    const checkpoint = await db.integrationResource.findFirstOrThrow({
      where: { domain: "legacy-migration", name: checkpointName },
    });
    const result = await verify(db, checkpoint);
    console.log(JSON.stringify({ backupDir, verification: result }, null, 2));
    if (
      result.fileErrors.length ||
      Object.values(result.rows).some((r) => r.expected !== r.found)
    )
      process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    "Migrasi gagal:",
    error.name?.startsWith("Prisma")
      ? `Database error ${error.code || "unknown"}`
      : error.message,
  );
  process.exitCode = 1;
});
