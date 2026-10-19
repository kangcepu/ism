require("reflect-metadata");
const {
  inventoryEvidence,
  monitoringEvidence,
  searchTerms,
  limitEvidence,
  planTools,
} = require("../dist/src/modules/platform/ai-evidence");
const {
  ollamaChat,
  ollamaRequest,
} = require("../dist/src/modules/platform/ollama");

afterEach(() => jest.restoreAllMocks());

test("search keeps meaningful terms and filters by requested status", async () => {
  const db = {
    asset: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
  expect(searchTerms("Berapa jumlah laptop tersedia di kantor?")).toEqual([
    "laptop",
    "kantor",
  ]);
  await inventoryEvidence(db, "Berapa jumlah laptop tersedia di kantor?");
  const query = db.asset.findMany.mock.calls[0][0];
  expect(query.where.status).toBe("available");
  expect(query.where.AND).toHaveLength(2);
  expect(query.where.AND[0].OR).toEqual(
    expect.arrayContaining([
      { category: { name: { contains: "laptop", mode: "insensitive" } } },
      { assigneeName: { contains: "laptop", mode: "insensitive" } },
    ]),
  );
  expect(query.where.AND[1].OR).toEqual(
    expect.arrayContaining([
      { location: { name: { contains: "kantor", mode: "insensitive" } } },
    ]),
  );
  expect(query.take).toBe(100);
});

test("monitor search filters by status without exposing SNMP credentials", async () => {
  const db = {
    networkMonitor: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  await monitoringEvidence(db, "Cek switch IT room yang offline");
  const query = db.networkMonitor.findMany.mock.calls[0][0];
  expect(query.where.lastStatus).toBe("offline");
  expect(query.where.AND).toHaveLength(2);
  expect(query.select.snmpCommunityEncrypted).toBeUndefined();
  expect(query.select.snapshot).toBeUndefined();
});

test("conversational asset questions query the complete inventory", async () => {
  const db = {
    asset: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(654),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
  expect(searchTerms("Bro coba cek total asset kita sekarang")).toEqual([]);
  expect(planTools("Bro coba cek total asset kita sekarang")).toEqual([
    "inventory-search",
  ]);
  const result = await inventoryEvidence(
    db,
    "Bro coba cek total asset kita sekarang",
  );
  expect(db.asset.count.mock.calls[0][0].where.AND).toEqual([]);
  expect(result.matchedTotal).toBe(654);
});

test("planner selects the relevant source or both sources", () => {
  expect(planTools("Tolong cek switch yang offline")).toEqual([
    "monitoring-health",
  ]);
  expect(planTools("Cek aset dan switch yang offline")).toEqual([
    "inventory-search",
    "monitoring-health",
  ]);
});

test("evidence sent to model limits lists and string lengths", () => {
  const input = {
    items: Array.from({ length: 90 }, () => ({ name: "x".repeat(1000) })),
  };
  const result = limitEvidence(input);
  expect(result.items).toHaveLength(40);
  expect(result.items[0].name).toHaveLength(200);
});

test("Ollama reports missing model clearly and disables thinking for chat", async () => {
  const fetch = jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce({ ok: false, status: 404 })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: "Jawaban" } }),
    });
  await expect(
    ollamaChat("http://localhost:11434", "missing", "sys", "prompt"),
  ).rejects.toThrow("Model Ollama tidak ditemukan");
  await expect(
    ollamaChat("http://localhost:11434", "model", "sys", "prompt"),
  ).resolves.toBe("Jawaban");
  expect(JSON.parse(fetch.mock.calls[1][1].body).think).toBe(false);
  fetch.mockRejectedValueOnce(
    Object.assign(new Error("timeout"), { name: "TimeoutError" }),
  );
  await expect(
    ollamaRequest("http://localhost:11434", "/api/tags"),
  ).rejects.toThrow("batas waktu");
});
