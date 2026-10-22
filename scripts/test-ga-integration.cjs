for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {}
}
const { Client } = require("pg");
const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const schema = `ism_test_${randomBytes(6).toString("hex")}`;
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("schema", schema);
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  GA_TEST_DATABASE_URL: url.toString(),
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
      throw new Error(`Test schema could not be created: ${migrate.stderr}`);
    const test = spawnSync(
      "npx",
      ["jest", "--runInBand", "ga-workflows.test.js"],
      { cwd: "apps/api", env, encoding: "utf8" },
    );
    process.stdout.write(test.stdout);
    process.stderr.write(test.stderr);
    if (test.status !== 0) process.exitCode = test.status || 1;
  } finally {
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
