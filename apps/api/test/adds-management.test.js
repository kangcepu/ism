require("reflect-metadata");
const { Client } = require("ldapts");
const {
  AddsController,
} = require("../dist/src/modules/platform/adds.controller");
const { validate } = require("class-validator");
const { plainToInstance } = require("class-transformer");
const { DirectoryUserDto } = require("../dist/src/modules/platform/adds.dto");

const config = {
  url: "ldap://directory.example",
  baseDn: "DC=example,DC=com",
  bindDn: "admin",
  domain: "example.com",
  startTls: false,
};
const service = { id: 1, active: true, secret: "encrypted:password", config };
const crypto = { decrypt: () => "password" };
const controller = () =>
  new AddsController(
    {
      integrationResource: { findFirst: jest.fn().mockResolvedValue(service) },
    },
    crypto,
  );
const dn = "OU=IT,DC=example,DC=com";

beforeEach(() => {
  jest.spyOn(Client.prototype, "startTLS").mockResolvedValue();
  jest.spyOn(Client.prototype, "bind").mockResolvedValue();
  jest.spyOn(Client.prototype, "unbind").mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());

test("legacy LDAP requires TLS before bind and never falls back to plaintext", async () => {
  const tls = Client.prototype.startTLS;
  const bind = Client.prototype.bind;
  jest
    .spyOn(Client.prototype, "search")
    .mockResolvedValue({ searchEntries: [{ dn: config.baseDn }] });
  await expect(controller().test(1)).resolves.toEqual({ tested: true });
  expect(tls.mock.invocationCallOrder[0]).toBeLessThan(
    bind.mock.invocationCallOrder[0],
  );
  expect(bind).toHaveBeenCalledWith("admin@example.com", "password");
  tls.mockRejectedValueOnce(new Error("TLS unavailable"));
  await expect(controller().test(1)).rejects.toMatchObject({ status: 502 });
  expect(bind).toHaveBeenCalledTimes(1);
});

test("OU creation escapes names and rejects DNs outside the configured base", async () => {
  const add = jest.spyOn(Client.prototype, "add").mockResolvedValue();
  const api = controller();
  const result = await api.createOu(1, {
    parentDn: "OU=IT,DC=EXAMPLE,DC=COM",
    name: "Operations, East",
  });
  const { DN } = require("@ldapjs/dn");
  expect(DN.fromString(result.dn).rdnAt(0).getValue("ou")).toBe(
    "Operations, East",
  );
  expect(add).toHaveBeenCalledTimes(1);
  await expect(
    api.createOu(1, { parentDn: "CN=outside\\,DC=example,DC=com", name: "IT" }),
  ).rejects.toMatchObject({ status: 400 });
  expect(add).toHaveBeenCalledTimes(1);
});

test("user creation sets a protected password before enabling the account", async () => {
  const add = jest.spyOn(Client.prototype, "add").mockResolvedValue();
  const modify = jest.spyOn(Client.prototype, "modify").mockResolvedValue();
  const api = controller();
  const result = await api.createUser(1, {
    parentDn: dn,
    displayName: "Example User",
    username: "example",
    password: "Secret!123",
  });
  expect(add.mock.calls[0][1].userAccountControl).toBe("514");
  expect(modify.mock.calls[0][1].modification.type).toBe("unicodePwd");
  expect(modify.mock.calls[0][1].modification.values[0]).toEqual(
    Buffer.from('"Secret!123"', "utf16le"),
  );
  expect(modify.mock.calls[1][1].modification.values).toEqual(["512"]);
  expect(JSON.stringify(result)).not.toContain("Secret!123");
  modify.mockReset().mockRejectedValueOnce(new Error("password policy"));
  await expect(
    api.createUser(1, {
      parentDn: dn,
      displayName: "Another User",
      username: "another",
      password: "Secret!123",
    }),
  ).rejects.toThrow("sudah dibuat dalam keadaan nonaktif");
  expect(modify).toHaveBeenCalledTimes(1);
});

test("account status preserves other flags and membership respects base DN", async () => {
  jest
    .spyOn(Client.prototype, "search")
    .mockResolvedValue({ searchEntries: [{ userAccountControl: "66050" }] });
  const modify = jest.spyOn(Client.prototype, "modify").mockResolvedValue();
  const api = controller();
  await api.userStatus(1, { userDn: `CN=User,${dn}`, enabled: true });
  expect(modify.mock.calls[0][1].modification.values).toEqual(["66048"]);
  await api.addMember(1, {
    groupDn: `CN=Group,${dn}`,
    memberDn: `CN=User,${dn}`,
  });
  await api.removeMember(1, {
    groupDn: `CN=Group,${dn}`,
    memberDn: `CN=User,${dn}`,
  });
  expect(modify.mock.calls[1][1].operation).toBe("add");
  expect(modify.mock.calls[2][1].operation).toBe("delete");
  await expect(
    api.addMember(1, {
      groupDn: `CN=Group,${dn}`,
      memberDn: "CN=User,DC=other,DC=com",
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect(modify).toHaveBeenCalledTimes(3);
});

test("user input requires valid account names and passwords", async () => {
  const user = plainToInstance(DirectoryUserDto, {
    parentDn: dn,
    displayName: "User",
    username: "bad/name",
    password: "short",
  });
  const errors = await validate(user);
  expect(errors.map((error) => error.property)).toEqual(
    expect.arrayContaining(["username", "password"]),
  );
});
