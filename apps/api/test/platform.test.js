require("reflect-metadata");
const { Client } = require("ldapts");
const {
  AddsController,
} = require("../dist/src/modules/platform/adds.controller");
const {
  ZeroTierController,
} = require("../dist/src/modules/platform/zerotier.controller");
const {
  AiController,
} = require("../dist/src/modules/platform/system.controller");

const crypto = {
  encrypt: (value) => `encrypted:${value}`,
  decrypt: (value) => value.replace("encrypted:", ""),
};
afterEach(() => jest.restoreAllMocks());

test("LDAP binds through STARTTLS, limits directory search, and never returns credentials", async () => {
  const service = {
    id: 3,
    name: "Directory",
    active: true,
    secret: "encrypted:password",
    config: {
      url: "ldap://directory.example",
      baseDn: "DC=example,DC=com",
      bindDn: "admin@example.com",
      startTls: true,
      password: "legacy-secret",
    },
  };
  const db = {
    integrationResource: {
      findFirst: jest.fn().mockResolvedValue(service),
      findMany: jest.fn().mockResolvedValue([service]),
    },
  };
  const tls = jest.spyOn(Client.prototype, "startTLS").mockResolvedValue();
  const bind = jest.spyOn(Client.prototype, "bind").mockResolvedValue();
  const search = jest.spyOn(Client.prototype, "search").mockResolvedValue({
    searchEntries: [{ dn: "OU=IT,DC=example,DC=com", name: "IT" }],
    searchReferences: [],
  });
  jest.spyOn(Client.prototype, "unbind").mockResolvedValue();
  const controller = new AddsController(db, crypto);
  const listed = await controller.list();
  expect(listed[0].config.password).toBeUndefined();
  expect(JSON.stringify(listed)).not.toContain("legacy-secret");
  expect(await controller.ous(3, "DC=example,DC=com")).toHaveLength(1);
  expect(tls).toHaveBeenCalledTimes(1);
  expect(bind).toHaveBeenCalledWith("admin@example.com", "password");
  expect(search.mock.calls[0][1].scope).toBe("one");
  await expect(controller.ous(3, "DC=other,DC=com")).rejects.toMatchObject({
    status: 400,
  });
  await expect(
    controller.ous(3, "CN=outside\\,DC=example,DC=com"),
  ).rejects.toMatchObject({ status: 400 });
  expect(bind).toHaveBeenCalledTimes(1);
});

test("ZeroTier uses the managed account and normalizes dependency errors", async () => {
  const network = {
    id: 1,
    domain: "zerotier-network",
    config: { accountId: 2 },
  };
  const account = {
    id: 2,
    domain: "zerotier-account",
    secret: "encrypted:token-value",
  };
  const db = {
    integrationResource: {
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(
          where.domain === "zerotier-network" ? network : account,
        ),
      ),
    },
  };
  const controller = new ZeroTierController(db, crypto);
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => [
      {
        nodeId: "0123456789",
        lastOnline: Date.now(),
        config: { authorized: true, ipAssignments: ["10.0.0.1"] },
      },
    ],
  });
  const members = await controller.members("0123456789abcdef");
  expect(members[0]).toMatchObject({
    id: "0123456789",
    authorized: true,
    online: true,
  });
  expect(fetchMock.mock.calls[0][0]).toBe(
    "https://api.zerotier.com/api/v1/network/0123456789abcdef/member",
  );
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
    "token token-value",
  );
  fetchMock.mockResolvedValue({ ok: false });
  await expect(controller.members("0123456789abcdef")).rejects.toMatchObject({
    status: 502,
  });
  await expect(controller.members("invalid")).rejects.toMatchObject({
    status: 400,
  });
});

test("AI drafts enforce quantity and master data without calling Ollama when unconfigured", async () => {
  const db = {
    appSetting: { findMany: jest.fn().mockResolvedValue([]) },
    category: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 1, name: "Laptop", itemType: "computer" }]),
    },
    location: {
      findMany: jest.fn().mockResolvedValue([{ id: 2, name: "Office" }]),
    },
  };
  const controller = new AiController(db);
  const fetchMock = jest.spyOn(global, "fetch");
  await expect(
    controller.diagnose({ prompt: "Ringkasan" }),
  ).rejects.toMatchObject({ status: 400 });
  expect(fetchMock).not.toHaveBeenCalled();
  const validation = await controller.validate({
    name: "Laptop",
    quantity: 1001,
    category: "Laptop",
    location: "Office",
  });
  expect(validation.valid).toBe(false);
  expect(validation.errors.join(" ")).toContain("1000");
  expect(
    (
      await controller.validate({
        name: "Laptop",
        quantity: 2,
        category: "Laptop",
        location: "Office",
      })
    ).valid,
  ).toBe(true);
});

test("ZeroTier mutations send the intended member authorization and reject unmanaged networks", async () => {
  const db = {
    integrationResource: {
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(
          where.domain === "zerotier-network"
            ? { config: { accountId: 2 } }
            : { secret: "encrypted:token-value" },
        ),
      ),
    },
  };
  const controller = new ZeroTierController(db, crypto);
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      nodeId: "0123456789",
      config: { authorized: true },
    }),
  });
  await controller.memberUpdate("0123456789abcdef", "0123456789", {
    authorized: true,
  });
  expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    config: { authorized: true },
  });
  db.integrationResource.findFirst.mockResolvedValue(null);
  await expect(controller.members("fedcba9876543210")).rejects.toMatchObject({
    status: 404,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("AI diagnosis sends bounded evidence to Ollama and reports the model used", async () => {
  const db = {
    appSetting: {
      findMany: jest.fn().mockResolvedValue([
        { key: "base_url", value: "http://ollama.example" },
        { key: "model", value: "example-model" },
      ]),
    },
    asset: {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn().mockResolvedValue([{ id: 1, name: "Laptop" }]),
      groupBy: jest
        .fn()
        .mockResolvedValue([{ status: "available", _count: { _all: 2 } }]),
    },
    networkMonitor: { count: jest.fn().mockResolvedValue(0) },
    aiMemory: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const controller = new AiController(db);
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ message: { content: "Ada dua aset." } }),
  });
  const result = await controller.diagnose({ prompt: "Berapa aset?" });
  expect(result).toMatchObject({
    answer: "Ada dua aset.",
    model: "example-model",
    toolsUsed: ["inventory-search"],
    readOnly: true,
  });
  const request = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(request.stream).toBe(false);
  expect(request.messages[1].content).toContain("Berapa aset?");
  expect(request.messages[1].content).toContain('"matchedTotal":2');
  expect(request.messages[1].content).toContain('"previousExamples":[]');
  expect(db.aiMemory.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({ normalizedQuestion: "berapa aset?" }),
    }),
  );
  expect(request.think).toBe(false);
});

test("floor map viewers cannot receive marker secrets and cannot edit", async () => {
  const {
    FloorMapController,
  } = require("../dist/src/modules/platform/floor-map.controller");
  const db = {
    floorMapPermission: {
      findUnique: jest.fn().mockResolvedValue({ access: "view" }),
    },
    floorMapGroupMember: { findMany: jest.fn().mockResolvedValue([]) },
    floorMapState: {
      findUnique: jest.fn().mockResolvedValue({
        key: "default",
        state: {
          markers: [
            {
              id: "1",
              name: "Switch",
              snmpCommunity: "private",
              nested: { password: "secret", host: "10.0.0.1" },
            },
          ],
        },
      }),
    },
  };
  const controller = new FloorMapController(db);
  const response = await controller.editor({ id: 1, role: "user" });
  expect(response.canEdit).toBe(false);
  expect(response.state.markers[0]).toEqual({
    id: "1",
    name: "Switch",
    nested: { host: "10.0.0.1" },
  });
  expect((await controller.editor({ id: 2, role: "admin" })).canEdit).toBe(
    true,
  );
});

test("notifications include temperature only when the latest persisted sample exceeds the configured limit", async () => {
  const {
    NotificationsController,
  } = require("../dist/src/modules/operations/notifications.controller");
  const db = {
    monitorEvent: { findMany: jest.fn().mockResolvedValue([]) },
    appSetting: {
      findMany: jest.fn().mockResolvedValue([
        { key: "enabled", value: "true" },
        { key: "threshold", value: "60" },
      ]),
    },
    networkMonitor: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          name: "Hot switch",
          samples: [{ temperature: 70, createdAt: new Date() }],
        },
        {
          id: 2,
          name: "Cooled switch",
          samples: [{ temperature: 40, createdAt: new Date() }],
        },
      ]),
    },
  };
  const notifications = await new NotificationsController(db).list();
  expect(notifications).toHaveLength(1);
  expect(notifications[0]).toMatchObject({
    id: "temperature-1",
    monitor: { name: "Hot switch" },
  });
  expect(notifications[0].message).toContain("70");
});

test("legacy bcrypt passwords authenticate and upgrade to Argon2", async () => {
  const { AuthService } = require("../dist/src/modules/auth/auth.service");
  const bcrypt = require("bcryptjs");
  const argon2 = require("argon2");
  const oldHash = bcrypt
    .hashSync("example-password", 4)
    .replace(/^\$2[ab]\$/, "$2y$");
  const user = { id: 4, username: "legacy", passwordHash: oldHash };
  const db = {
    user: {
      findFirst: jest.fn().mockResolvedValue(user),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const auth = new AuthService(db, crypto);
  await expect(
    auth.verify({ username: "legacy", password: "wrong" }),
  ).rejects.toMatchObject({ status: 401 });
  expect(db.user.updateMany).not.toHaveBeenCalled();
  await expect(
    auth.verify({ username: "legacy", password: "example-password" }),
  ).resolves.toBe(user);
  const update = db.user.updateMany.mock.calls[0][0];
  expect(update.where.passwordHash).toBe(oldHash);
  expect(
    await argon2.verify(update.data.passwordHash, "example-password"),
  ).toBe(true);
});

test("saving floor map retains protected credentials across marker reordering", async () => {
  const {
    FloorMapController,
  } = require("../dist/src/modules/platform/floor-map.controller");
  const { CryptoService } = require("../dist/src/common/crypto.service");
  const cipher = new CryptoService();
  const savedSecret = `enc:v1:${cipher.encrypt("credential")}`;
  const db = {
    floorMapState: {
      findUnique: jest.fn().mockResolvedValue({
        state: {
          markers: [
            { id: "a", sshPassword: savedSecret },
            { id: "b", snmpCommunity: "legacy-secret" },
          ],
        },
      }),
      upsert: jest.fn(async ({ update }) => ({ state: update.state })),
    },
  };
  db.$transaction = async (callback) => callback(db);
  const controller = new FloorMapController(db, cipher);
  const result = await controller.save(
    { state: { markers: [{ id: "b", name: "updated" }, { id: "a" }] } },
    { id: 1, role: "admin" },
  );
  expect(JSON.stringify(result)).not.toContain("credential");
  expect(JSON.stringify(result)).not.toContain("legacy-secret");
  const state = db.floorMapState.upsert.mock.calls[0][0].update.state;
  expect(cipher.decrypt(state.markers[0].snmpCommunity.slice(7))).toBe(
    "legacy-secret",
  );
  expect(state.markers[1].sshPassword).toBe(savedSecret);
});

test("monitor uptime excludes traffic-only samples without a status", async () => {
  const {
    MonitoringController,
  } = require("../dist/src/modules/operations/monitoring.controller");
  const db = {
    monitorSample: {
      groupBy: jest.fn().mockResolvedValue([
        { status: "online", _count: 1 },
        { status: "offline", _count: 1 },
      ]),
    },
  };
  const controller = new MonitoringController(db, crypto);
  await expect(controller.uptime(7)).resolves.toEqual({
    percent: 50,
    sampleCount: 2,
  });
  expect(db.monitorSample.groupBy.mock.calls[0][0].where.status.in).toEqual([
    "online",
    "degraded",
    "offline",
  ]);
});
