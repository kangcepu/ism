ALTER TABLE "MonitorSample" ALTER COLUMN "status" DROP NOT NULL;
DROP INDEX IF EXISTS "NetworkMonitor_host_key";
CREATE INDEX IF NOT EXISTS "NetworkMonitor_host_idx" ON "NetworkMonitor" ("host");
CREATE UNIQUE INDEX IF NOT EXISTS "NetworkMonitor_active_host_key" ON "NetworkMonitor" ("host") WHERE "deletedAt" IS NULL;
ALTER TABLE "NetworkMonitor" ALTER COLUMN "latencyMs" TYPE DECIMAL(10,2);
ALTER TABLE "MonitorSample" ALTER COLUMN "latencyMs" TYPE DECIMAL(10,2), ALTER COLUMN "trafficInBps" TYPE DECIMAL(16,2), ALTER COLUMN "trafficOutBps" TYPE DECIMAL(16,2), ALTER COLUMN "temperature" TYPE DECIMAL(6,2);
