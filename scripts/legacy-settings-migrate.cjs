const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
dotenv.config({ path: path.join(root, ".env"), quiet: true });
const { PrismaClient } = require("@prisma/client");
const sourceRoot = process.env.LEGACY_ROOT || "/mnt/www/webapp/it_inventory";
const mapping = {
  alerts_temp_enabled: ["alerts", "enabled"],
  alerts_temp_threshold_c: ["alerts", "threshold"],
  alerts_temp_hysteresis_c: ["alerts", "hysteresis"],
  alerts_notification_emails: ["alerts", "recipients"],
  smtp_host: ["smtp", "host"],
  smtp_port: ["smtp", "port"],
  smtp_username: ["smtp", "username"],
  smtp_password: ["smtp", "password"],
  smtp_encryption: ["smtp", "encryption"],
  smtp_from_email: ["smtp", "from_email"],
  smtp_from_name: ["smtp", "from_name"],
  asset_sync_enabled: ["asset_sync", "enabled"],
  asset_sync_url: ["asset_sync", "url"],
  asset_sync_key: ["asset_sync", "api_key"],
  asset_sync_key_header: ["asset_sync", "key_header"],
  asset_sync_timeout_ms: ["asset_sync", "timeout_ms"],
  asset_sync_default_location_id: ["asset_sync", "default_location_id"],
  ollama_base_url: ["ollama", "base_url"],
  ollama_default_model: ["ollama", "model"],
};
function encrypt(value) {
  const key = crypto
    .createHash("sha256")
    .update(process.env.ENCRYPTION_KEY || "development-only-key")
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
async function main() {
  const text = fs.readFileSync(
    path.join(sourceRoot, "api/config/database.local.php"),
    "utf8",
  );
  const get = (key) =>
    text.match(new RegExp(`["']${key}["']\\s*=>\\s*["']([^"']*)`))?.[1];
  const source = await mysql.createConnection({
    host: get("host"),
    user: get("username"),
    password: get("password"),
    database: get("db_name"),
    connectTimeout: 10000,
  });
  const db = new PrismaClient();
  try {
    const [rows] = await source.query(
      "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?)",
      [Object.keys(mapping)],
    );
    const checkpoint = await db.integrationResource.findFirst({
      where: {
        domain: "legacy-migration",
        name: "it-inventory-legacy-v1",
        deletedAt: null,
      },
      select: { config: true },
    });
    const locations = checkpoint?.config?.mappings?.locations || {};
    const counts = { migrated: 0, preserved: 0 };
    await db.$transaction(async (tx) => {
      for (const row of rows) {
        const [group, key] = mapping[row.setting_key];
        let value = row.setting_value;
        if (
          ["alerts_temp_enabled", "asset_sync_enabled"].includes(
            row.setting_key,
          ) &&
          value !== null
        )
          value = /^(1|true|yes|on)$/i.test(value) ? "true" : "false";
        if (row.setting_key === "asset_sync_default_location_id" && value) {
          if (!locations[value])
            throw Error(
              "Lokasi default Asset Sync belum memiliki mapping migrasi.",
            );
          value = String(locations[value]);
        }
        const isSecret =
          row.setting_key === "smtp_password" ||
          row.setting_key === "asset_sync_key";
        const inserted = await tx.appSetting.createMany({
          data: [
            {
              group,
              key,
              isSecret,
              value: isSecret ? null : value,
              encryptedValue: isSecret && value ? encrypt(value) : null,
            },
          ],
          skipDuplicates: true,
        });
        if (inserted.count) counts.migrated++;
        else counts.preserved++;
      }
    });
    console.log(JSON.stringify(counts));
  } finally {
    await source.end();
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
