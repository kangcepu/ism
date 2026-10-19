require("reflect-metadata");
const http = require("node:http");
const { ServiceUnavailableException } = require("@nestjs/common");
const {
  HrDirectoryService,
} = require("../dist/src/modules/hr-directory/hr-directory.service");
const { AssetsService } = require("../dist/src/modules/assets/assets.service");

function settings(values) {
  return {
    appSetting: {
      findMany: jest.fn().mockResolvedValue(
        Object.entries(values).map(([key, value]) => ({
          key,
          value,
          isSecret: false,
        })),
      ),
    },
  };
}
function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${server.address().port}`),
    ),
  );
}
function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("search merges HR sources, maps fields, filters, caches and marks stale results", async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ path: req.url, key: req.headers.authorization });
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        data: [
          { FullName: "Ayu Test", EmployeeCode: "EMP1", Company: "One" },
          { FullName: "Other Person", EmployeeCode: "EMP2", Company: "One" },
        ],
      }),
    );
  });
  const url = await listen(server);
  try {
    const db = settings({
      enabled: "true",
      url,
      api_key: "example-key",
      search_path: "/one,/two",
      cache_ttl_seconds: "300",
    });
    const service = new HrDirectoryService(db, { decrypt: (value) => value });
    const found = await service.search("ayu", 20);
    expect(found.employees).toEqual([
      { fullname: "Ayu Test", employeeCode: "EMP1", company: "One" },
    ]);
    expect(requests).toHaveLength(2);
    expect(
      requests.every(
        (item) =>
          item.key === "Bearer example-key" &&
          item.path.includes("keyword=ayu"),
      ),
    ).toBe(true);
    expect((await service.search("ayu", 20)).cached).toBe(true);
    expect(requests).toHaveLength(2);
    await close(server);
    const stale = await service.search("ayu", 20, true);
    expect(stale).toMatchObject({
      cached: true,
      stale: true,
      employees: found.employees,
    });
    await expect(service.search("absent", 20)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  } finally {
    if (server.listening) await close(server);
  }
});

test("configured POST body and nested response fields are supported", async () => {
  let received;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received = {
        method: req.method,
        body: JSON.parse(Buffer.concat(chunks)),
        key: req.headers["x-key"],
      };
      res.end(
        JSON.stringify({
          payload: {
            records: [
              {
                identity: { name: "Budi Test", code: "B1" },
                office: { name: "Two" },
              },
            ],
          },
        }),
      );
    });
  });
  const url = await listen(server);
  try {
    const service = new HrDirectoryService(
      settings({
        enabled: "true",
        url,
        method: "POST",
        search_path: "/search",
        api_key: "key",
        key_header: "X-Key",
        key_prefix: "",
        query_param: "search",
        result_path: "payload.records",
        field_name: "identity.name",
        field_code: "identity.code",
        field_company: "office.name",
      }),
      { decrypt: (value) => value },
    );
    expect((await service.search("budi")).employees).toEqual([
      { fullname: "Budi Test", employeeCode: "B1", company: "Two" },
    ]);
    expect(received).toMatchObject({
      method: "POST",
      key: "key",
      body: { search: "budi", limit: 20 },
    });
  } finally {
    await close(server);
  }
});

test("failed HR sources produce a partial result instead of hiding working sources", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        req.url.startsWith("/failed")
          ? { success: false }
          : { data: [{ FullName: "Ayu Test", EmployeeCode: "EMP1" }] },
      ),
    );
  });
  const url = await listen(server);
  try {
    const service = new HrDirectoryService(
      settings({ enabled: "true", url, search_path: "/working,/failed" }),
      { decrypt: (value) => value },
    );
    expect(await service.search("ayu")).toMatchObject({
      partial: true,
      stale: false,
      employees: [{ fullname: "Ayu Test", employeeCode: "EMP1" }],
    });
  } finally {
    await close(server);
  }
});

test("assignment verifies HR identity and writes canonical snapshot", async () => {
  const update = jest.fn(async ({ data }) => data);
  const history = jest.fn();
  const tx = {
    asset: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ status: "available", assigneeName: null }),
      update,
    },
    assetHistory: { create: history },
  };
  const db = { $transaction: (callback) => callback(tx) };
  const directory = {
    search: jest.fn().mockResolvedValue({
      enabled: true,
      stale: false,
      partial: false,
      employees: [
        { fullname: "Ayu Test", employeeCode: "EMP1", company: "One" },
      ],
    }),
  };
  const service = new AssetsService(db, directory);
  await service.assign(
    1,
    {
      source: "hr",
      assigneeName: "old name",
      assigneeCode: "EMP1",
      company: "old company",
    },
    { id: 5 },
  );
  expect(update.mock.calls[0][0].data).toMatchObject({
    assigneeName: "Ayu Test",
    assigneeCode: "EMP1",
    assigneeCompany: "One",
  });
  expect(history.mock.calls[0][0].data.assigneeSnapshot).toMatchObject({
    name: "Ayu Test",
    code: "EMP1",
    company: "One",
  });
  directory.search.mockResolvedValueOnce({
    enabled: true,
    stale: false,
    partial: false,
    employees: [],
  });
  await expect(
    service.assign(
      1,
      { source: "hr", assigneeName: "Unknown", assigneeCode: "missing" },
      { id: 5 },
    ),
  ).rejects.toThrow("Karyawan tidak ditemukan");
  directory.search.mockRejectedValueOnce(new ServiceUnavailableException());
  await service.assign(
    1,
    { source: "hr", assigneeName: "Offline Person", assigneeCode: "OFF1" },
    { id: 5 },
  );
  expect(update.mock.calls[1][0].data).toMatchObject({
    assigneeName: "Offline Person",
    assigneeCode: "OFF1",
  });
  directory.search.mockResolvedValueOnce({
    enabled: true,
    stale: false,
    partial: true,
    employees: [],
  });
  await service.assign(
    1,
    { source: "hr", assigneeName: "Other source", assigneeCode: "OFF2" },
    { id: 5 },
  );
  expect(update.mock.calls[2][0].data).toMatchObject({
    assigneeName: "Other source",
    assigneeCode: "OFF2",
  });
});
