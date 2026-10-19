import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { CryptoService } from "../../common/crypto.service";
import { PrismaService } from "../../database/prisma.service";

export type Employee = {
  fullname: string;
  employeeCode: string;
  company: string;
};
type SearchResult = {
  employees: Employee[];
  enabled: boolean;
  source: string;
  cached: boolean;
  stale: boolean;
  partial: boolean;
};
type Config = {
  enabled: boolean;
  url: string;
  paths: string[];
  method: "GET" | "POST";
  key: string;
  header: string;
  prefix: string;
  queryParam: string;
  resultPath: string;
  fieldName: string;
  fieldCode: string;
  fieldCompany: string;
  timeout: number;
  verifyTls: boolean;
  cacheTtl: number;
};

const defaultPaths = [
  "/api/v1/q/employee-uc",
  "/api/v1/q/employee-ru",
  "/api/v1/q/employee",
];
const nameKeys = [
  "fullname",
  "full_name",
  "name",
  "employee_name",
  "employeename",
  "nama",
  "nama_lengkap",
  "namalengkap",
  "nama_karyawan",
  "namakaryawan",
  "emp_name",
  "displayname",
  "display_name",
];
const codeKeys = [
  "employeecode",
  "employee_code",
  "emp_code",
  "empcode",
  "nik",
  "nip",
  "no_induk",
  "noinduk",
  "id_karyawan",
  "idkaryawan",
  "employee_id",
  "employeeid",
  "badge",
  "badge_no",
  "badgeno",
  "staff_id",
  "staffid",
  "code",
];
const companyKeys = [
  "company",
  "company_name",
  "companyname",
  "company_code",
  "companycode",
  "perusahaan",
  "nama_perusahaan",
  "namaperusahaan",
  "org",
  "organization",
  "business_unit",
  "businessunit",
  "bu",
  "entity",
];
const envelopes = [
  "data",
  "results",
  "result",
  "items",
  "rows",
  "records",
  "employees",
  "list",
  "payload",
  "content",
];
const normalized = (value: string) => value.trim().toLocaleLowerCase();
function dig(value: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (item, key) =>
        item && typeof item === "object"
          ? (item as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}
function field(
  record: Record<string, unknown>,
  path: string,
  keys: string[],
): string {
  const lookup = path
    ? [dig(record, path)]
    : keys.map(
        (key) =>
          Object.entries(record).find(
            ([name]) => name.toLowerCase() === key,
          )?.[1],
      );
  const value = lookup.find(
    (item) =>
      (typeof item === "string" && item.trim()) || typeof item === "number",
  );
  return value === undefined ? "" : String(value).trim();
}
function records(value: unknown, path: string): unknown[] {
  if (path) {
    const item = dig(value, path);
    return Array.isArray(item)
      ? item
      : item && typeof item === "object"
        ? [item]
        : [];
  }
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of envelopes) {
    const item = (value as Record<string, unknown>)[key];
    if (Array.isArray(item)) return item;
    if (item && typeof item === "object") {
      for (const nested of envelopes) {
        const list = (item as Record<string, unknown>)[nested];
        if (Array.isArray(list)) return list;
      }
      return [item];
    }
  }
  return [value];
}
function toEmployees(value: unknown, config: Config): Employee[] {
  return records(value, config.resultPath).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const fullname = field(row, config.fieldName, nameKeys).slice(0, 190);
    return fullname
      ? [
          {
            fullname,
            employeeCode: field(row, config.fieldCode, codeKeys).slice(0, 64),
            company: field(row, config.fieldCompany, companyKeys).slice(0, 120),
          },
        ]
      : [];
  });
}
function buildUrl(config: Config, path: string, query: string, limit: number) {
  const base = new URL(config.url);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw new Error("Invalid URL");
  const expanded = path
    .replaceAll("{q}", encodeURIComponent(query))
    .replaceAll("{limit}", String(limit));
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(expanded))
    throw new Error("Invalid path");
  const url = path
    ? new URL(
        `${base.toString().replace(/\/$/, "")}/${expanded.replace(/^\/+/, "")}`,
      )
    : new URL(base);
  if (url.origin !== base.origin || url.username || url.password)
    throw new Error("Invalid path");
  if (config.method === "GET" && !path.includes("{q}"))
    url.searchParams.set(config.queryParam, query);
  return url;
}
function requestJson(
  config: Config,
  path: string,
  query: string,
  limit: number,
): Promise<unknown> {
  const url = buildUrl(config, path, query, limit);
  const headers: Record<string, string> = { accept: "application/json" };
  if (config.key)
    headers[config.header] = [config.prefix, config.key]
      .filter(Boolean)
      .join(" ");
  const body =
    config.method === "POST"
      ? JSON.stringify({ [config.queryParam]: query, q: query, limit })
      : undefined;
  if (body) headers["content-type"] = "application/json";
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: config.method,
        headers,
        ...(url.protocol === "https:"
          ? { rejectUnauthorized: config.verifyTls }
          : {}),
      },
      (response) => {
        if (
          !response.statusCode ||
          response.statusCode < 200 ||
          response.statusCode >= 300
        ) {
          response.resume();
          reject(new Error("HR request failed"));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 8 * 1024 * 1024) {
            response.destroy();
            reject(new Error("HR response too large"));
          } else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            const payload: unknown = JSON.parse(
              Buffer.concat(chunks).toString("utf8"),
            );
            if (
              payload &&
              typeof payload === "object" &&
              "success" in payload &&
              payload.success === false
            )
              throw new Error("HR request failed");
            resolve(payload);
          } catch {
            reject(new Error("Invalid HR response"));
          }
        });
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error("HR timeout")),
      config.timeout,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end(body);
  });
}

@Injectable()
export class HrDirectoryService {
  private readonly cache = new Map<
    string,
    { result: SearchResult; expires: number }
  >();
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
  ) {}
  private async config(): Promise<Config> {
    const rows = await this.db.appSetting.findMany({ where: { group: "hr" } });
    const settings = Object.fromEntries(
      rows.map((row) => [
        row.key,
        row.isSecret && row.encryptedValue
          ? this.crypto.decrypt(row.encryptedValue)
          : row.value || "",
      ]),
    );
    const get = (key: string, legacy: string, fallback = "") =>
      settings[key] ?? settings[legacy] ?? fallback;
    const url = get("url", "hr_api_base_url").trim();
    const path = get("search_path", "hr_api_search_path").trim();
    let paths = path
      ? path
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    if (!paths.length && url) {
      try {
        paths = new URL(url).pathname === "/" ? defaultPaths : [""];
      } catch {
        paths = [""];
      }
    }
    const number = (
      value: string,
      fallback: number,
      min: number,
      max: number,
    ) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && value !== ""
        ? Math.min(max, Math.max(min, parsed))
        : fallback;
    };
    return {
      enabled: ["true", "1", "yes", "on"].includes(
        get("enabled", "hr_api_enabled").toLowerCase(),
      ),
      url,
      paths: paths.slice(0, 6),
      method:
        get("method", "hr_api_http_method", "GET").toUpperCase() === "POST"
          ? "POST"
          : "GET",
      key: get("api_key", "hr_api_key"),
      header:
        get("key_header", "hr_api_key_header", "Authorization") ||
        "Authorization",
      prefix: get("key_prefix", "hr_api_key_prefix", "Bearer"),
      queryParam:
        get("query_param", "hr_api_query_param", "keyword") || "keyword",
      resultPath: get("result_path", "hr_api_result_path"),
      fieldName: get("field_name", "hr_api_field_name"),
      fieldCode: get("field_code", "hr_api_field_code"),
      fieldCompany: get("field_company", "hr_api_field_company"),
      timeout: number(
        get("timeout_ms", "hr_api_timeout_ms"),
        5000,
        1000,
        60000,
      ),
      verifyTls: !["false", "0"].includes(
        get("verify_tls", "hr_api_verify_tls", "true").toLowerCase(),
      ),
      cacheTtl:
        number(
          get("cache_ttl_seconds", "hr_api_cache_ttl", "300"),
          300,
          0,
          3600,
        ) * 1000,
    };
  }
  async search(
    query: string,
    limit = 20,
    fresh = false,
  ): Promise<SearchResult> {
    const config = await this.config();
    if (!config.enabled)
      return {
        employees: [],
        enabled: false,
        source: "disabled",
        cached: false,
        stale: false,
        partial: false,
      };
    if (!config.url)
      throw new ServiceUnavailableException(
        "URL HR Directory belum dikonfigurasi.",
      );
    const q = query.trim();
    if (!q)
      return {
        employees: [],
        enabled: true,
        source: "hr",
        cached: false,
        stale: false,
        partial: false,
      };
    const count = Math.max(1, Math.min(100, limit));
    const key = createHash("sha256")
      .update(JSON.stringify([config, normalized(q), count]))
      .digest("hex");
    const cached = this.cache.get(key);
    if (!fresh && cached && cached.expires > Date.now())
      return { ...cached.result, cached: true };
    const results = await Promise.allSettled(
      config.paths.map((path) =>
        Promise.resolve().then(() => requestJson(config, path, q, count)),
      ),
    );
    const successes = results.filter(
      (item): item is PromiseFulfilledResult<unknown> =>
        item.status === "fulfilled",
    );
    if (!successes.length) {
      if (cached) return { ...cached.result, cached: true, stale: true };
      throw new ServiceUnavailableException(
        "HR Directory tidak dapat dihubungi. Periksa koneksi dan konfigurasi.",
      );
    }
    const tokens = normalized(q).split(/\s+/);
    const seen = new Set<string>();
    const employees = successes
      .flatMap((item) => toEmployees(item.value, config))
      .filter((employee) => {
        if (
          !tokens.every((token) =>
            normalized(
              `${employee.fullname} ${employee.employeeCode}`,
            ).includes(token),
          )
        )
          return false;
        const identity = normalized(
          `${employee.employeeCode || employee.fullname}|${employee.company}`,
        );
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .slice(0, count);
    const result: SearchResult = {
      employees,
      enabled: true,
      source: "hr",
      cached: false,
      stale: false,
      partial: successes.length !== results.length,
    };
    if (!result.partial && config.cacheTtl > 0) {
      if (this.cache.size >= 200)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { result, expires: Date.now() + config.cacheTtl });
    }
    return result;
  }
}
