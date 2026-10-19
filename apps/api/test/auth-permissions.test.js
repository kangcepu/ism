const { createHash } = require("node:crypto");
const { AuthGuard } = require("../dist/src/common/auth.guard");

const digest = (value) => createHash("sha256").update(value).digest("hex");

function setup(user, path, method = "GET") {
  const session = {
    csrfHash: digest("csrf"),
    user: {
      id: 1,
      username: "test",
      fullname: "Test",
      role: "user",
      gaRole: "none",
      permissionGroupId: null,
      permissionGroup: null,
      ...user,
    },
  };
  const prisma = {
    webSession: { findFirst: jest.fn().mockResolvedValue(session) },
    mobileToken: { findFirst: jest.fn().mockResolvedValue(session) },
  };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const request = {
    path,
    method,
    headers: { "x-csrf-token": "csrf" },
    cookies: { ism_session: "session" },
  };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return new AuthGuard(prisma, reflector).canActivate(context);
}

test.each([
  "/api/v1/inventory/items",
  "/api/v1/assets",
  "/api/v1/asset-photos/1/file",
  "/api/v1/mobile/assets",
  "/api/v1/mobile/monitoring",
  "/api/v1/dashboard/summary",
  "/api/v1/notifications",
  "/api/v1/hr/employees",
])("account without a group cannot access %s", async (path) => {
  await expect(setup({}, path)).rejects.toThrow("Grup akses");
});

test("unclassified endpoints fail closed while personal endpoints remain accessible", async () => {
  await expect(setup({}, "/api/v1/unifi/session")).rejects.toThrow(
    "Akses endpoint",
  );
  await expect(setup({}, "/api/v1/unknown-module")).rejects.toThrow(
    "Akses endpoint",
  );
  await expect(setup({}, "/api/v1/auth/me")).resolves.toBe(true);
  await expect(setup({}, "/api/v1/profile")).resolves.toBe(true);
  await expect(setup({}, "/api/v1/mobile/auth/me")).resolves.toBe(true);
});

test("AI operations require the catalogued AI permission", async () => {
  const user = {
    permissionGroupId: 1,
    permissionGroup: { active: true, permissions: ["ai.read"] },
  };
  await expect(setup(user, "/api/v1/ai/diagnoses", "POST")).resolves.toBe(true);
  await expect(setup({}, "/api/v1/ai/diagnoses", "POST")).rejects.toThrow(
    "Grup akses",
  );
});

test("active groups grant only their configured access and manage includes read", async () => {
  const user = {
    permissionGroupId: 1,
    permissionGroup: { active: true, permissions: ["inventory.manage"] },
  };
  await expect(setup(user, "/api/v1/inventory/items")).resolves.toBe(true);
  await expect(setup(user, "/api/v1/inventory/reserve", "POST")).resolves.toBe(
    true,
  );
  await expect(setup(user, "/api/v1/assets")).rejects.toThrow("Grup akses");
  await expect(
    setup(
      { ...user, permissionGroup: { ...user.permissionGroup, active: false } },
      "/api/v1/inventory/items",
    ),
  ).rejects.toThrow("Grup akses");
});

test("GA roles and administrators retain their permitted access", async () => {
  await expect(setup({ gaRole: "staff" }, "/api/v1/ga/areas")).resolves.toBe(
    true,
  );
  await expect(
    setup({ gaRole: "staff" }, "/api/v1/cctv/cameras"),
  ).resolves.toBe(true);
  await expect(
    setup({ gaRole: "staff" }, "/api/v1/cctv/cameras", "POST"),
  ).rejects.toThrow("Grup akses");
  await expect(
    setup({ role: "admin" }, "/api/v1/inventory/items"),
  ).resolves.toBe(true);
});
