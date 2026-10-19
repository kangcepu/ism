import { execFile } from "node:child_process";
import { connect, isIP } from "node:net";
import { promisify } from "node:util";
import { BadRequestException } from "@nestjs/common";

const execFileAsync = promisify(execFile);
const defaults: Record<string, number[]> = {
  cisco_switch: [22, 80, 443, 23],
  juniper_switch: [22, 80, 443],
  mikrotik: [8291, 22, 80, 443],
  huawei_switch: [22, 80, 443, 23],
  hp_switch: [22, 80, 443, 23],
  dell_server: [22, 80, 443, 3389],
  linux_server: [22, 80, 443],
  generic_snmp: [22, 80, 443, 161],
  vm: [22, 3389],
  server: [22, 80, 443, 3389],
};

export function classifyProbe(ping: boolean | null, openPorts: number[]) {
  if (ping === true && openPorts.length)
    return {
      status: "online" as const,
      message: "Ping dan layanan TCP merespons",
    };
  if (ping === true)
    return {
      status: "online" as const,
      message: "Ping merespons, tetapi port layanan tidak terbuka",
    };
  if (openPorts.length)
    return {
      status: "degraded" as const,
      message:
        ping === null
          ? "Port layanan terbuka; ping tidak tersedia"
          : "Ping gagal, tetapi port layanan terbuka",
    };
  if (ping === null)
    return {
      status: "unknown" as const,
      message: "Ping tidak tersedia dan port layanan tidak merespons",
    };
  return {
    status: "offline" as const,
    message: "Ping dan port layanan tidak merespons",
  };
}

async function ping(
  host: string,
  timeoutMs: number,
): Promise<{ reachable: boolean | null; latencyMs: number | null }> {
  try {
    const { stdout } = await execFileAsync(
      "ping",
      [
        "-c",
        "1",
        "-W",
        String(Math.max(1, Math.ceil(timeoutMs / 1000))),
        "--",
        host,
      ],
      { timeout: timeoutMs + 1500, maxBuffer: 8192, windowsHide: true },
    );
    const match = stdout.match(/time[=<]([0-9.]+)\s*ms/i);
    return { reachable: true, latencyMs: match ? Number(match[1]) : null };
  } catch (error) {
    const failure = error as { code?: string | number; killed?: boolean };
    return {
      reachable:
        failure.code === "ENOENT" ||
        failure.code === "EACCES" ||
        (typeof failure.code === "number" && failure.code !== 1)
          ? null
          : false,
      latencyMs: null,
    };
  }
}

function testPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: timeoutMs });
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

export async function runMonitoringProbe(
  host: string,
  deviceType: string,
  customPorts: number[],
  timeoutMs: number,
) {
  const safeHost = host.trim();
  if (
    !isIP(safeHost) &&
    !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(safeHost)
  )
    throw new BadRequestException("Host monitor tidak valid.");
  const timeout = Math.max(250, Math.min(10000, timeoutMs));
  const ports = [
    ...new Set([...(defaults[deviceType] || [22, 80, 443]), ...customPorts]),
  ].filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);
  const pingResult = ping(safeHost, timeout);
  const openPorts: number[] = [];
  for (let index = 0; index < ports.length; index += 16) {
    const batch = ports.slice(index, index + 16);
    const results = await Promise.all(
      batch.map((port) => testPort(safeHost, port, timeout)),
    );
    batch.forEach((port, offset) => {
      if (results[offset]) openPorts.push(port);
    });
  }
  const result = await pingResult;
  return {
    ...classifyProbe(result.reachable, openPorts),
    pingReachable: result.reachable,
    latencyMs: result.latencyMs,
    openPorts,
    checkedAt: new Date(),
  };
}
