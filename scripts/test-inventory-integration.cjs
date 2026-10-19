for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}
const { Client } = require("pg");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const schema = `ism_test_${randomBytes(6).toString("hex")}`;
const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ism-test-uploads-"));
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("schema", schema);
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  INVENTORY_TEST_DATABASE_URL: url.toString(),
  UPLOAD_ROOT: uploadRoot,
};
const client = new Client({ connectionString: process.env.DATABASE_URL });
(async () => {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  try {
    const migrate = spawnSync(
      "npx",
      [
        "prisma",
        "db",
        "push",
        "--schema",
        "apps/api/prisma/schema.prisma",
        "--skip-generate",
      ],
      { env, encoding: "utf8" },
    );
    if (migrate.status !== 0)
      throw new Error("Test schema could not be created.");
    await client.query(`SET search_path TO "${schema}"`);
    const sql = fs.readFileSync(
      "apps/api/prisma/migrations/202610190010_inventory_cctv/migration.sql",
      "utf8",
    );
    await client.query(
      sql.slice(
        sql.indexOf('CREATE FUNCTION "reject_inventory_ledger_change"'),
      ),
    );
    const test = spawnSync(
      "npx",
      ["jest", "--runInBand", "inventory-ledger.test.js"],
      { cwd: "apps/api", env, encoding: "utf8" },
    );
    process.stdout.write(test.stdout);
    process.stderr.write(test.stderr);
    if (test.status !== 0) process.exitCode = test.status || 1;
  } finally {
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  console.error(error.message);
  process.exitCode = 1;
});
