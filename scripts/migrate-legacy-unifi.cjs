const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
for (const file of ['.env.local', '.env']) {
  const envPath = path.join(root, file);
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}
const apiEnv = path.join(root, 'apps/api/.env');
if (fs.existsSync(apiEnv)) {
  const databaseUrl = fs.readFileSync(apiEnv, 'utf8').match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
  if (databaseUrl) process.env.DATABASE_URL = databaseUrl.replace(/^['"]|['"]$/g, '');
}
const legacyRoot = process.env.LEGACY_ROOT || '/mnt/www/webapp/it_inventory';
function config() {
  const text = fs.readFileSync(path.join(legacyRoot, 'api/config/database.local.php'), 'utf8');
  const value = (key) => text.match(new RegExp(`["']${key}["']\\s*=>\\s*["']([^"']*)`))?.[1];
  const result = { host: value('host'), user: value('username'), password: value('password'), database: value('db_name') };
  if (Object.values(result).some((item) => item == null)) throw new Error('Konfigurasi database PHP lama tidak lengkap.');
  return result;
}
function legacyKey() {
  if (process.env.IT_INVENTORY_UNIFI_SECRET) return crypto.createHash('sha256').update(process.env.IT_INVENTORY_UNIFI_SECRET).digest();
  const keyFile = path.join(legacyRoot, 'api/config/.floor-map-unifi-key.php');
  const text = fs.readFileSync(keyFile, 'utf8');
  const hex = text.match(/return\s+'([a-f0-9]{64})'/i)?.[1];
  if (!hex) throw new Error('Kunci UniFi PHP lama tidak valid.');
  return Buffer.from(hex, 'hex');
}
function decrypt(ciphertext) {
  const raw = Buffer.from(ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', legacyKey(), raw.subarray(0, 12));
  decipher.setAAD(Buffer.from('floor-map-unifi-v1:credentials'));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
function encrypt(value) {
  const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || 'development-only-key').digest();
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
(async () => {
  const source = await mysql.createConnection(config());
  const [rows] = await source.query('SELECT controller_url, site_name, allow_self_signed, credentials_cipher FROM floor_map_unifi_controller WHERE id = 1 LIMIT 1');
  await source.end();
  const row = rows[0];
  if (!row) throw new Error('Konfigurasi UniFi legacy tidak ditemukan.');
  if (!row.credentials_cipher) throw new Error('Password UniFi lama tidak tersimpan.');
  const credentials = JSON.parse(decrypt(row.credentials_cipher));
  const prisma = new PrismaClient();
  try {
    await prisma.integrationResource.upsert({ where: { domain_name: { domain: 'unifi', name: row.controller_url } }, create: { domain: 'unifi', name: row.controller_url, config: { site: row.site_name || 'default', username: credentials.username, allowSelfSigned: Boolean(row.allow_self_signed) }, secret: encrypt(credentials.password), active: true }, update: { config: { site: row.site_name || 'default', username: credentials.username, allowSelfSigned: Boolean(row.allow_self_signed) }, secret: encrypt(credentials.password), active: true, deletedAt: null } });
  } finally { await prisma.$disconnect(); }
  console.log('Konfigurasi UniFi legacy berhasil dimigrasikan.');
})().catch((error) => { console.error(error.message); process.exit(1); });
