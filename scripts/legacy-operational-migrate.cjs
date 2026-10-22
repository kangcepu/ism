const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const { PrismaClient } = require("@prisma/client");

const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
dotenv.config({ path: path.join(root, ".env"), quiet: true });
const sourceRoot = process.env.LEGACY_ROOT || "/mnt/www/webapp/it_inventory";
const checkpointName = "it-inventory-operational-v1";
const tables = [
  "ai_assistant_audit_logs",
  "ai_assistant_qa_memory",
  "audit_logs",
  "it_support_reports",
  "mobile_app_releases",
  "mobile_api_tokens",
];

const date = (value) => {
  if (!value || String(value).startsWith("0000-00-00"))
    return new Date("1970-01-01T00:00:00Z");
  const text = String(value);
  return new Date(text.length === 10 ? `${text}T00:00:00+07:00` : `${text.replace(" ", "T")}+07:00`);
};

const json = (value, fallback = null) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const hash = async (file) => {
  const digest = crypto.createHash("sha256");
  const handle = fs.createReadStream(file);
  for await (const chunk of handle) digest.update(chunk);
  return digest.digest("hex");
};

async function sourceConfig() {
  const text = await fsp.readFile(
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
  if (Object.values(config).some((value) => value == null))
    throw Error("Konfigurasi database PHP lama tidak lengkap.");
  return config;
}

async function readSource() {
  const source = await mysql.createConnection({
    ...(await sourceConfig()),
    charset: "utf8mb4",
    dateStrings: true,
  });
  try {
    const data = {};
    for (const table of tables)
      data[table] = (await source.query(`SELECT * FROM \`${table}\``))[0];
    return data;
  } finally {
    await source.end();
  }
}

async function legacyUserMap(db) {
  const checkpoint = await db.integrationResource.findFirst({
    where: {
      domain: "legacy-migration",
      name: "it-inventory-legacy-v1",
      deletedAt: null,
    },
    select: { config: true },
  });
  if (!checkpoint?.config?.mappings?.users)
    throw Error("Migrasi inti legacy belum tersedia.");
  return checkpoint.config.mappings.users;
}

async function stageReleases(releases) {
  const destination = path.join(root, "apps/api/uploads/releases");
  await fsp.mkdir(destination, { recursive: true });
  const staged = [];
  for (const release of releases) {
    const name = path.basename(String(release.file_name));
    const source = path.join(
      sourceRoot,
      "api/uploads/mobile-releases",
      name,
    );
    const target = path.join(destination, name);
    const expected = String(release.sha256 || "").toLowerCase();
    if (!fs.existsSync(source)) throw Error(`File APK legacy tidak ditemukan: ${name}`);
    if ((await hash(source)) !== expected) throw Error(`Checksum APK legacy tidak valid: ${name}`);
    if (fs.existsSync(target)) {
      if ((await hash(target)) !== expected)
        throw Error(`Nama file APK bertabrakan: ${name}`);
    } else await fsp.copyFile(source, target);
    staged.push({ name, size: Number(release.file_size), checksum: expected });
  }
  return staged;
}

function reportStatus(status) {
  const value = String(status || "OPEN").toUpperCase();
  if (value === "DONE") return "DONE";
  if (value === "ON PROGRESS") return "IN_PROGRESS";
  return "OPEN";
}

async function main() {
  if (!process.env.DATABASE_URL) throw Error("DATABASE_URL belum dikonfigurasi.");
  const db = new PrismaClient();
  try {
    const exists = await db.integrationResource.findFirst({
      where: { domain: "legacy-migration", name: checkpointName, deletedAt: null },
      select: { id: true },
    });
    if (exists) throw Error("Migrasi operasional legacy sudah dijalankan.");
    const [data, users] = await Promise.all([readSource(), legacyUserMap(db)]);
    const releases = await stageReleases(data.mobile_app_releases);
    const defaultUser = await db.user.findFirst({ select: { id: true }, orderBy: { id: "asc" } });
    if (!defaultUser) throw Error("Pengguna tujuan tidak tersedia.");
    const userId = (id) => Number(users[id] || defaultUser.id);
    await db.$transaction(async (tx) => {
      for (const row of data.ai_assistant_qa_memory) {
        const normalizedQuestion = String(row.normalized_question || "").trim();
        const fingerprint = String(row.data_fingerprint || "").trim();
        if (!normalizedQuestion || !fingerprint) continue;
        await tx.aiMemory.upsert({
          where: { normalizedQuestion_fingerprint: { normalizedQuestion, fingerprint } },
          update: {
            answer: String(row.answer_text || ""),
            model: String(row.model_name || "legacy"),
            useCount: Number(row.use_count || 1),
            lastUsedAt: date(row.last_used_at),
          },
          create: {
            normalizedQuestion,
            fingerprint,
            answer: String(row.answer_text || ""),
            model: String(row.model_name || "legacy"),
            useCount: Number(row.use_count || 1),
            lastUsedAt: date(row.last_used_at),
            createdAt: date(row.created_at),
          },
        });
      }
      await tx.auditLog.createMany({
        data: [
          ...data.audit_logs.map((row) => ({
            actorId: row.actor_user_id ? userId(row.actor_user_id) : null,
            actorName: row.actor_name || row.actor_username || null,
            source: String(row.source || "legacy"),
            action: String(row.action || "legacy.import"),
            resource: String(row.resource || "legacy"),
            resourceId: row.resource_id ? String(row.resource_id) : null,
            method: String(row.request_method || "GET"),
            route: String(row.route || "legacy"),
            statusCode: Number(row.status_code || 200),
            ip: row.ip_address || null,
            userAgent: row.user_agent || null,
            metadata: json(row.metadata_json),
            createdAt: date(row.created_at),
          })),
          ...data.ai_assistant_audit_logs.map((row) => ({
            actorId: row.actor_user_id ? userId(row.actor_user_id) : null,
            actorName: row.actor_username || null,
            source: String(row.source || "ai"),
            action: String(row.action || "ai.query"),
            resource: "ai-assistant",
            resourceId: String(row.id),
            method: "POST",
            route: "/legacy/ai-assistant",
            statusCode: 200,
            ip: null,
            userAgent: null,
            metadata: { prompt: row.prompt || null, tools: json(row.tools_json, []), result: json(row.result_json) },
            createdAt: date(row.created_at),
          })),
        ],
      });
      await tx.itSupportReport.createMany({
        data: data.it_support_reports.map((row) => ({
          date: date(row.tanggal),
          reporter: String(row.pelapor || "-"),
          department: String(row.departemen || "-"),
          location: String(row.lokasi || "-"),
          category: String(row.kategori || "-"),
          analysis: String(row.analisis || "-"),
          resolution: row.penyelesaian || row.solusi || null,
          status: reportStatus(row.status),
          createdAt: date(row.created_at),
          updatedAt: date(row.updated_at),
        })),
      });
      await tx.mobileToken.createMany({
        data: data.mobile_api_tokens.map((row) => ({
          tokenHash: String(row.token_hash),
          deviceName: String(row.device_name || "Perangkat legacy"),
          userId: userId(row.user_id),
          expiresAt: date(row.expires_at),
          lastUsedAt: row.last_used_at ? date(row.last_used_at) : null,
          revokedAt: row.revoked_at ? date(row.revoked_at) : null,
          createdAt: date(row.created_at),
        })),
        skipDuplicates: true,
      });
      await tx.mobileRelease.createMany({
        data: data.mobile_app_releases.map((row) => ({
          platform: String(row.platform || "android"),
          versionName: String(row.version_name),
          versionCode: Number(row.version_code),
          notes: row.release_notes || null,
          forceUpdate: Boolean(row.force_update),
          storedName: path.basename(String(row.file_name)),
          originalName: String(row.original_file_name || row.file_name),
          size: Number(row.file_size),
          checksum: String(row.sha256),
          active: Boolean(row.is_active),
          createdBy: userId(row.created_by),
          publishedAt: row.published_at ? date(row.published_at) : null,
        })),
      });
      await tx.integrationResource.create({
        data: {
          domain: "legacy-migration",
          name: checkpointName,
          config: {
            aiAuditLogs: data.ai_assistant_audit_logs.length,
            aiMemories: data.ai_assistant_qa_memory.length,
            auditLogs: data.audit_logs.length,
            supportReports: data.it_support_reports.length,
            mobileReleases: releases,
            mobileTokens: data.mobile_api_tokens.length,
          },
        },
      });
    });
    console.log(JSON.stringify({
      aiAuditLogs: data.ai_assistant_audit_logs.length,
      aiMemories: data.ai_assistant_qa_memory.length,
      auditLogs: data.audit_logs.length,
      supportReports: data.it_support_reports.length,
      mobileReleases: releases.length,
      mobileTokens: data.mobile_api_tokens.length,
    }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(`Migrasi operasional gagal: ${error.message}`);
  process.exitCode = 1;
});
