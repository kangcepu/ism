import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Attribute, Change, Client, EqualityFilter } from "ldapts";
import { AdminOnly } from "../../common/auth.decorators";
import { CryptoService } from "../../common/crypto.service";
import { PrismaService } from "../../database/prisma.service";
import { IntegrationDto } from "./platform.dto";
import {
  DirectoryMemberDto,
  DirectoryObjectDto,
  DirectoryPasswordDto,
  DirectoryStatusDto,
  DirectoryUserDto,
} from "./adds.dto";

type ParsedRdn = {
  keys(): IterableIterator<string>;
  getValue(key: string): string;
};
type ParsedDn = { length: number; rdnAt(index: number): ParsedRdn };
const { DN, RDN } = require("@ldapjs/dn") as {
  DN: {
    fromString(value: string): ParsedDn;
  };
  RDN: new (value: Record<string, string>) => { toString(): string };
};
type Config = {
  url: string;
  baseDn: string;
  bindDn: string;
  startTls: boolean;
  domain: string;
  netbios: string;
  tlsCa: string;
};
const selection = {
  id: true,
  name: true,
  config: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;
function validateConfig(input: Record<string, unknown>): Config {
  const url = String(input.url || "").trim();
  const baseDn = String(input.baseDn || "").trim();
  const bindDn = String(input.bindDn || "").trim();
  const startTls = input.startTls === true;
  const tlsCa = String(input.tlsCa || "").trim();
  if (
    tlsCa &&
    (tlsCa.length > 32000 ||
      !/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/.test(
        tlsCa,
      ))
  )
    throw new BadRequestException("Sertifikat CA harus berformat PEM.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException("URL LDAP tidak valid.");
  }
  if (
    !["ldap:", "ldaps:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash ||
    (startTls && parsed.protocol === "ldaps:")
  )
    throw new BadRequestException(
      "Gunakan URL LDAP/LDAPS yang valid; STARTTLS tidak dapat digabung dengan LDAPS.",
    );
  if (!bindDn || !baseDn)
    throw new BadRequestException("Base DN dan bind DN wajib diisi.");
  try {
    if (!DN.fromString(baseDn).length) throw new Error();
  } catch {
    throw new BadRequestException("Base DN tidak valid.");
  }
  return {
    url,
    baseDn,
    bindDn,
    startTls,
    domain: String(input.domain || "").trim(),
    netbios: String(input.netbios || "").trim(),
    tlsCa,
  };
}
function withinBase(base: string, target: string) {
  try {
    const root = DN.fromString(base);
    const selected = DN.fromString(target);
    if (!root.length || selected.length < root.length) return false;
    const normalized = (rdn: ParsedRdn) =>
      [...rdn.keys()]
        .map((key) => [
          key.toLowerCase(),
          rdn.getValue(key).normalize("NFKC").toLowerCase(),
        ])
        .sort((a, b) => a[0].localeCompare(b[0]));
    for (let i = 0; i < root.length; i++) {
      if (
        JSON.stringify(normalized(root.rdnAt(i))) !==
        JSON.stringify(
          normalized(selected.rdnAt(i + selected.length - root.length)),
        )
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
@Controller("adds/services")
@AdminOnly()
export class AddsController {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
  ) {}
  private async service(id: number) {
    const service = await this.db.integrationResource.findFirst({
      where: { id, domain: "adds", deletedAt: null },
    });
    if (!service) throw new NotFoundException("Service ADDS tidak ditemukan.");
    return service;
  }
  @Get() async list() {
    const services = await this.db.integrationResource.findMany({
      where: { domain: "adds", deletedAt: null },
      select: { ...selection, secret: true },
      orderBy: { name: "asc" },
    });
    return services.map((service) => {
      const config = (service.config || {}) as Record<string, unknown>;
      return {
        id: service.id,
        name: service.name,
        active: service.active,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
        config: {
          url: config.url || "",
          baseDn: config.baseDn || "",
          bindDn: config.bindDn || "",
          startTls:
            config.startTls === true ||
            /^ldap:\/\//i.test(String(config.url || "")),
          domain: config.domain || "",
          netbios: config.netbios || "",
          tlsCa: config.tlsCa || "",
          hasPassword: Boolean(service.secret),
        },
      };
    });
  }
  @Post() create(@Body() dto: IntegrationDto) {
    const config = validateConfig(dto.config);
    if (!dto.secret)
      throw new BadRequestException("Bind password wajib diisi.");
    return this.db.integrationResource.create({
      data: {
        domain: "adds",
        name: dto.name,
        config,
        active: dto.active ?? true,
        secret: this.crypto.encrypt(dto.secret),
      },
      select: selection,
    });
  }
  @Patch(":id") async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: IntegrationDto,
  ) {
    const service = await this.service(id);
    const config = validateConfig({
      ...(service.config as Record<string, unknown>),
      ...dto.config,
    });
    return this.db.integrationResource.update({
      where: { id },
      data: {
        name: dto.name,
        config: {
          ...Object.fromEntries(
            Object.entries(service.config as Record<string, unknown>).filter(
              ([key]) => !/password|secret|token/i.test(key),
            ),
          ),
          ...config,
        },
        active: dto.active,
        ...(dto.secret ? { secret: this.crypto.encrypt(dto.secret) } : {}),
      },
      select: selection,
    });
  }
  @Delete(":id") async remove(@Param("id", ParseIntPipe) id: number) {
    await this.service(id);
    await this.db.integrationResource.update({
      where: { id },
      data: { deletedAt: new Date(), secret: null },
    });
    return { deleted: true };
  }
  private async connect<T>(
    id: number,
    fn: (client: Client, config: Config) => Promise<T>,
    target?: string,
  ): Promise<T> {
    const service = await this.service(id);
    if (!service.active || !service.secret)
      throw new BadRequestException(
        "Service ADDS tidak aktif atau bind password belum tersedia.",
      );
    const config = validateConfig(service.config as Record<string, unknown>);
    if (target && !withinBase(config.baseDn, target))
      throw new BadRequestException("DN berada di luar Base DN.");
    const client = new Client({
      url: config.url,
      timeout: 10000,
      connectTimeout: 10000,
      ...(config.tlsCa ? { tlsOptions: { ca: config.tlsCa } } : {}),
    });
    try {
      if (new URL(config.url).protocol === "ldap:")
        await client.startTLS(config.tlsCa ? { ca: config.tlsCa } : undefined);
      const bind = /[@\\=]/.test(config.bindDn)
        ? config.bindDn
        : config.domain
          ? `${config.bindDn}@${config.domain}`
          : config.netbios
            ? `${config.netbios}\\${config.bindDn}`
            : config.bindDn;
      await client.bind(bind, this.crypto.decrypt(service.secret));
      return await fn(client, config);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const failure = error as {
        code?: string;
        message?: string;
        cause?: { code?: string };
      };
      const code = failure?.code || failure?.cause?.code || "";
      if (["ENOTFOUND", "EAI_AGAIN"].includes(code))
        throw new BadGatewayException(
          "Hostname LDAP tidak ditemukan. Periksa DNS internal atau alamat Domain Controller.",
        );
      if (
        ["ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"].includes(
          code,
        )
      )
        throw new BadGatewayException(
          "Server LDAP tidak dapat dijangkau. Periksa jaringan dan port LDAP/LDAPS.",
        );
      if (
        /certificate|self.signed|CERT_|unable to verify/i.test(
          `${code} ${failure?.message || ""}`,
        )
      )
        throw new BadGatewayException(
          "Sertifikat LDAP tidak dapat diverifikasi. Periksa hostname dan CA server.",
        );
      throw new BadGatewayException(
        "Koneksi atau permintaan ke server LDAP gagal. Periksa konfigurasi dan akses server.",
      );
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
  @Post(":id/test") test(@Param("id", ParseIntPipe) id: number) {
    return this.connect(id, async (client, config) => {
      const result = await client.search(config.baseDn, {
        scope: "base",
        filter: "(objectClass=*)",
        attributes: ["distinguishedName"],
      });
      if (!result.searchEntries.length)
        throw new BadGatewayException(
          "Base DN tidak ditemukan atau tidak dapat dibaca.",
        );
      return { tested: true };
    });
  }
  private entries(id: number, target: string | undefined, filter: string) {
    return this.connect(
      id,
      async (client, config) => {
        const base = target || config.baseDn;
        if (!withinBase(config.baseDn, base))
          throw new BadRequestException("DN berada di luar Base DN.");
        const result = await client.search(base, {
          scope: "one",
          filter,
          attributes: [
            "distinguishedName",
            "name",
            "displayName",
            "sAMAccountName",
            "mail",
            "userAccountControl",
            "description",
          ],
          paged: { pageSize: 500 },
          timeLimit: 10,
        });
        return result.searchEntries;
      },
      target,
    );
  }
  @Get(":id/organizational-units") ous(
    @Param("id", ParseIntPipe) id: number,
    @Query("baseDn") dn?: string,
  ) {
    return this.entries(
      id,
      dn,
      "(|(objectClass=organizationalUnit)(objectClass=container))",
    );
  }
  @Get(":id/users") users(
    @Param("id", ParseIntPipe) id: number,
    @Query("baseDn") dn?: string,
  ) {
    return this.entries(id, dn, "(&(objectCategory=person)(objectClass=user))");
  }
  @Get(":id/groups") groups(
    @Param("id", ParseIntPipe) id: number,
    @Query("baseDn") dn?: string,
  ) {
    return this.entries(id, dn, "(objectClass=group)");
  }
  @Get(":id/computers") computers(
    @Param("id", ParseIntPipe) id: number,
    @Query("baseDn") dn?: string,
  ) {
    return this.entries(id, dn, "(objectClass=computer)");
  }
  @Get(":id/group-members") members(
    @Param("id", ParseIntPipe) id: number,
    @Query("groupDn") groupDn: string,
  ) {
    if (!groupDn) throw new BadRequestException("DN group wajib diisi.");
    return this.connect(
      id,
      async (client, config) => {
        if (!groupDn || !withinBase(config.baseDn, groupDn))
          throw new BadRequestException("DN group berada di luar Base DN.");
        const result = await client.search(config.baseDn, {
          scope: "sub",
          filter: new EqualityFilter({ attribute: "memberOf", value: groupDn }),
          attributes: [
            "distinguishedName",
            "name",
            "displayName",
            "sAMAccountName",
            "mail",
          ],
          paged: { pageSize: 500 },
          timeLimit: 10,
        });
        return result.searchEntries;
      },
      groupDn,
    );
  }
  @Post(":id/organizational-units") createOu(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DirectoryObjectDto,
  ) {
    return this.connect(
      id,
      async (client) => {
        const name = this.objectName(dto.name, 64);
        const dn = `${new RDN({ ou: name }).toString()},${dto.parentDn}`;
        await client.add(dn, {
          objectClass: ["top", "organizationalUnit"],
          ou: name,
        });
        return { dn, name };
      },
      dto.parentDn,
    );
  }
  @Post(":id/groups") createGroup(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DirectoryObjectDto,
  ) {
    return this.connect(
      id,
      async (client) => {
        const name = this.objectName(dto.name, 64);
        if (
          name.length > 20 ||
          /[\\/\[\]:;|=,+*?<>]/.test(name) ||
          name.endsWith(".")
        )
          throw new BadRequestException(
            "Nama grup harus maksimal 20 karakter dan tidak boleh mengandung karakter khusus AD.",
          );
        const dn = `${new RDN({ cn: name }).toString()},${dto.parentDn}`;
        await client.add(dn, {
          objectClass: ["top", "group"],
          cn: name,
          sAMAccountName: name,
          groupType: "-2147483646",
        });
        return { dn, name };
      },
      dto.parentDn,
    );
  }
  @Post(":id/users") createUser(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DirectoryUserDto,
  ) {
    return this.connect(
      id,
      async (client, config) => {
        const name = this.objectName(dto.displayName, 128);
        const dn = `${new RDN({ cn: name }).toString()},${dto.parentDn}`;
        const domain = config.domain || this.domainFromBase(config.baseDn);
        const attributes: Record<string, string | string[]> = {
          objectClass: ["top", "person", "organizationalPerson", "user"],
          cn: name,
          displayName: name,
          sAMAccountName: dto.username,
          userAccountControl: "514",
          ...(domain ? { userPrincipalName: `${dto.username}@${domain}` } : {}),
          ...(dto.email ? { mail: dto.email } : {}),
        };
        await client.add(dn, attributes);
        try {
          await this.setPassword(client, dn, dto.password);
          await client.modify(
            dn,
            this.change("replace", "userAccountControl", "512"),
          );
        } catch {
          throw new BadGatewayException(
            `Akun ${dto.username} sudah dibuat dalam keadaan nonaktif, tetapi password atau aktivasi gagal. Periksa kebijakan password dan izin AD sebelum melanjutkan.`,
          );
        }
        return { dn, name, username: dto.username, enabled: true };
      },
      dto.parentDn,
    );
  }
  @Post(":id/users/status") userStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DirectoryStatusDto,
  ) {
    return this.connect(
      id,
      async (client) => {
        const result = await client.search(dto.userDn, {
          scope: "base",
          filter: "(&(objectCategory=person)(objectClass=user))",
          attributes: ["userAccountControl"],
        });
        const raw = result.searchEntries[0]?.userAccountControl;
        const current = Number(Array.isArray(raw) ? raw[0] : raw);
        if (!Number.isInteger(current) || current < 0 || current > 0x7fffffff)
          throw new BadRequestException(
            "User atau status akun tidak ditemukan.",
          );
        const next = dto.enabled ? current & ~2 : current | 2;
        if (next !== current)
          await client.modify(
            dto.userDn,
            this.change("replace", "userAccountControl", String(next)),
          );
        return { dn: dto.userDn, enabled: dto.enabled };
      },
      dto.userDn,
    );
  }
  @Post(":id/users/password") userPassword(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DirectoryPasswordDto,
  ) {
    return this.connect(
      id,
      async (client) => {
        await this.setPassword(client, dto.userDn, dto.password);
        return { dn: dto.userDn, updated: true };
      },
      dto.userDn,
    );
  }
  @Post(":id/group-members/add") addMember(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DirectoryMemberDto,
  ) {
    return this.changeMember(id, dto, "add");
  }
  @Post(":id/group-members/remove") removeMember(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DirectoryMemberDto,
  ) {
    return this.changeMember(id, dto, "delete");
  }
  private changeMember(
    id: number,
    dto: DirectoryMemberDto,
    operation: "add" | "delete",
  ) {
    return this.connect(
      id,
      async (client, config) => {
        if (!withinBase(config.baseDn, dto.memberDn))
          throw new BadRequestException("DN member berada di luar Base DN.");
        await client.modify(
          dto.groupDn,
          this.change(operation, "member", dto.memberDn),
        );
        return {
          groupDn: dto.groupDn,
          memberDn: dto.memberDn,
          added: operation === "add",
        };
      },
      dto.groupDn,
    );
  }
  private change(
    operation: "add" | "delete" | "replace",
    type: string,
    value: string | Buffer,
  ) {
    return new Change({
      operation,
      modification: new Attribute({
        type,
        values: typeof value === "string" ? [value] : [value],
      }),
    });
  }
  private setPassword(client: Client, dn: string, password: string) {
    return client.modify(
      dn,
      this.change(
        "replace",
        "unicodePwd",
        Buffer.from(`"${password}"`, "utf16le"),
      ),
    );
  }
  private objectName(value: string, max: number) {
    const name = value.trim();
    if (!name || name.length > max || /[\x00-\x1f\x7f]/.test(name))
      throw new BadRequestException("Nama direktori tidak valid.");
    return name;
  }
  private domainFromBase(base: string) {
    const dn = DN.fromString(base);
    const parts: string[] = [];
    for (let i = 0; i < dn.length; i++) {
      const rdn = dn.rdnAt(i);
      for (const key of rdn.keys())
        if (key.toLowerCase() === "dc") parts.push(rdn.getValue(key));
    }
    return parts.join(".");
  }
}
