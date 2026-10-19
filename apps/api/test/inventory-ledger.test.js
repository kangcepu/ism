const { PrismaClient } = require("@prisma/client");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const {
  InventoryController,
} = require("../dist/src/modules/inventory/inventory.controller");
const { CctvController } = require("../dist/src/modules/cctv/cctv.controller");
const { FloorMapController } = require("../dist/src/modules/platform/floor-map.controller");
const {
  CctvEvidenceController,
} = require("../dist/src/modules/cctv/cctv-evidence.controller");
const {
  InventoryDocumentsController,
} = require("../dist/src/modules/inventory/inventory-documents.controller");
const {
  InventoryReviewsController,
} = require("../dist/src/modules/inventory/inventory-reviews.controller");
const {
  AssetAuditsController,
} = require("../dist/src/modules/assets/asset-audits.controller");

const testDatabase = process.env.INVENTORY_TEST_DATABASE_URL;
if (
  testDatabase &&
  !/^ism_test_[a-f0-9]+$/.test(
    new URL(testDatabase).searchParams.get("schema") || "",
  )
) {
  throw new Error("Integration tests require an isolated ism_test_ schema.");
}
const suite = testDatabase ? describe : describe.skip;

suite("inventory ledger and CCTV workflows", () => {
  let db;
  let inventory;
  let cctv;
  let audits;
  let documents;
  let evidence;
  let reviews;
  const admin = { id: 1, role: "admin", gaRole: "none", permissions: ["*"] };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: testDatabase } } });
    await db.$connect();
    inventory = new InventoryController(db);
    cctv = new CctvController(db);
    audits = new AssetAuditsController(db);
    documents = new InventoryDocumentsController(db);
    reviews = new InventoryReviewsController(db);
    evidence = new CctvEvidenceController(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });
  async function receive(itemId, binId, qty) {
    const checker = { ...admin, id: 2 };
    const receipt = await documents.createReceipt(checker, {
      itemId,
      binId,
      qty,
    });
    await documents.inspectReceipt(checker, receipt.id, {
      accepted: qty,
      held: 0,
      rejected: 0,
      note: "Sesuai",
    });
    await documents.putawayReceipt(admin, receipt.id);
  }

  test("concurrent reservations, transfers, opname and immutable ledger maintain valid balances", async () => {
    const item = await inventory.item({ name: "Test item", reorderLevel: 2 });
    const from = await inventory.bin({ name: "A", warehouse: "Test" });
    const to = await inventory.bin({ name: "B", warehouse: "Test" });
    const data = { itemId: item.id, binId: from.id };
    await receive(item.id, from.id, 10);
    const reservations = await Promise.allSettled([
      inventory.reserve(admin, { ...data, qty: 8 }),
      inventory.reserve(admin, { ...data, qty: 8 }),
    ]);
    expect(reservations.filter((r) => r.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(reservations.filter((r) => r.status === "rejected")).toHaveLength(1);
    const reservationId = reservations.find((r) => r.status === "fulfilled")
      .value.reservationId;
    await inventory.issue(admin, { reservationId, qty: 3 });
    await expect(
      inventory.transfer(admin, {
        itemId: item.id,
        fromBinId: from.id,
        toBinId: to.id,
        qty: 3,
      }),
    ).rejects.toThrow();
    await inventory.transfer(admin, {
      itemId: item.id,
      fromBinId: from.id,
      toBinId: to.id,
      qty: 2,
    });
    const count = await reviews.create(
      { ...admin, id: 2 },
      { ...data, kind: "COUNT", quantity: 5, note: "Pemeriksaan" },
    );
    await reviews.approve(admin, count.id);
    expect(
      (await db.inventoryBalance.findUnique({ where: { itemId_binId: data } }))
        .onHand,
    ).toBe(5);
    await expect(
      reviews.create(admin, {
        ...data,
        kind: "COUNT",
        quantity: 4,
        note: "Pemeriksaan",
      }),
    ).rejects.toThrow();
    const entries = await db.inventoryLedger.findMany({
      where: { itemId: item.id },
      orderBy: { id: "asc" },
    });
    expect(entries.find((e) => e.type === "ISSUE").qty).toBe(-3);
    expect(entries.find((e) => e.type === "ISSUE").reservedDelta).toBe(-3);
    expect(entries.find((e) => e.type === "COUNT").qty).toBe(0);
    const balances = await db.inventoryBalance.findMany({
      where: { itemId: item.id },
    });
    for (const balance of balances) {
      const history = entries.filter((entry) => entry.binId === balance.binId);
      expect(history.reduce((total, entry) => total + entry.qty, 0)).toBe(
        balance.onHand,
      );
      expect(
        history.reduce((total, entry) => total + entry.reservedDelta, 0),
      ).toBe(balance.reserved);
    }
    await expect(
      db.inventoryLedger.update({
        where: { id: entries[0].id },
        data: { note: "changed" },
      }),
    ).rejects.toThrow();
    await expect(
      db.inventoryLedger.delete({ where: { id: entries[0].id } }),
    ).rejects.toThrow();
  });

  test("recount and independent approval reconcile stock and reject stale checks", async () => {
    const item = await inventory.item({ name: "Review item" });
    const bin = await inventory.bin({ name: "Review bin", warehouse: "Test" });
    const actor = { ...admin, id: 2 };
    await receive(item.id, bin.id, 10);
    const draft = await reviews.create(actor, {
      itemId: item.id,
      binId: bin.id,
      kind: "COUNT",
      quantity: 8,
      note: "Selisih",
    });
    expect(draft.status).toBe("RECOUNT_REQUIRED");
    await expect(reviews.approve(admin, draft.id)).rejects.toThrow();
    await expect(
      reviews.recount(actor, draft.id, { quantity: 9 }),
    ).rejects.toThrow();
    await reviews.recount(admin, draft.id, { quantity: 9 });
    await expect(reviews.approve(actor, draft.id)).rejects.toThrow();
    await reviews.approve(admin, draft.id);
    expect(
      (
        await db.inventoryBalance.findUnique({
          where: { itemId_binId: { itemId: item.id, binId: bin.id } },
        })
      ).onHand,
    ).toBe(9);
    const adjustment = await reviews.create(actor, {
      itemId: item.id,
      binId: bin.id,
      kind: "ADJUSTMENT",
      quantity: 2,
      note: "Koreksi",
    });
    await inventory.reserve(admin, { itemId: item.id, binId: bin.id, qty: 1 });
    await expect(reviews.approve(admin, adjustment.id)).rejects.toThrow(
      "Stok berubah",
    );
    expect(() =>
      inventory.opname(admin, { itemId: item.id, binId: bin.id, actualQty: 8 }),
    ).toThrow("dokumen");
  });

  test("reservation issue and release cannot consume another request or exceed its balance", async () => {
    const item = await inventory.item({ name: "Reservation item" });
    const bin = await inventory.bin({
      name: "Reservation bin",
      warehouse: "Test",
    });
    await receive(item.id, bin.id, 10);
    const first = await inventory.reserve(admin, {
      itemId: item.id,
      binId: bin.id,
      qty: 4,
    });
    const second = await inventory.reserve(admin, {
      itemId: item.id,
      binId: bin.id,
      qty: 4,
    });
    const attempts = await Promise.allSettled([
      inventory.issue(admin, { reservationId: first.reservationId, qty: 3 }),
      inventory.issue(admin, { reservationId: first.reservationId, qty: 3 }),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await inventory.release(admin, {
      reservationId: first.reservationId,
      qty: 1,
    });
    const other = await db.inventoryReservation.findUniqueOrThrow({
      where: { id: second.reservationId },
    });
    expect(other.remaining).toBe(4);
    const entries = await db.inventoryLedger.findMany({
      where: { reservationId: first.reservationId },
    });
    expect(entries.map((entry) => entry.type).sort()).toEqual([
      "ISSUE",
      "RELEASE",
      "RESERVE",
    ]);
    expect(entries.reduce((sum, entry) => sum + entry.reservedDelta, 0)).toBe(
      0,
    );
  });

  test("asset opname captures discrepancies and prevents entries after closure", async () => {
    const category = await db.category.create({
      data: { name: "Test", itemType: "IT" },
    });
    const location = await db.location.create({ data: { name: "Expected" } });
    const asset = await db.asset.create({
      data: {
        code: "TEST-AST",
        name: "Laptop",
        categoryId: category.id,
        locationId: location.id,
        serialNumber: "A123",
      },
    });
    expect(
      (await inventory.assets("1", "A123")).items.map((row) => row.id),
    ).toContain(asset.id);
    expect(
      (await cctv.assetOptions(admin, "TEST-AST")).map((row) => row.id),
    ).toContain(asset.id);
    const session = await audits.create(admin, { name: "October count" });
    const entry = await audits.entry(admin, session.id, {
      assetId: asset.id,
      actualLocation: "Other",
      actualSerial: "A456",
      found: true,
      condition: "good",
    });
    expect(entry.expectedLocation).toBe("Expected");
    expect(entry.expectedSerial).toBe("A123");
    expect(
      (await db.asset.findUnique({ where: { id: asset.id } })).locationId,
    ).toBe(location.id);
    await expect(
      audits.entry(admin, session.id, {
        assetId: asset.id,
        actualLocation: "Other",
        found: true,
      }),
    ).rejects.toThrow();
    await audits.close(admin, session.id);
    await expect(
      audits.entry(admin, session.id, {
        assetId: asset.id,
        actualLocation: "Other",
        found: true,
      }),
    ).rejects.toThrow();
  });

  test("CCTV workflow checks access, references, transitions and independent verification", async () => {
    const denied = { id: 2, role: "user", gaRole: "none", permissions: [] };
    expect(() => cctv.cameras(denied)).toThrow();
    const recorder = await cctv.recorder(admin, { name: "NVR", site: "Test" });
    const camera = await cctv.camera(admin, {
      name: "Camera",
      site: "Test",
      recorderId: recorder.id,
      channel: 1,
    });
    await expect(
      cctv.cameraStatus(admin, camera.id, { status: "ACTIVE" }),
    ).rejects.toThrow();
    await cctv.cameraStatus(admin, camera.id, { status: "COMMISSIONED" });
    await cctv.cameraStatus(admin, camera.id, { status: "ACTIVE" });
    const task = await cctv.createTask(admin, {
      cameraId: camera.id,
      kind: "PREVENTIVE",
      task: "Check lens",
      dueAt: new Date().toISOString(),
    });
    await cctv.completeTask(admin, task.id, { result: "OK" });
    await expect(cctv.verifyTask(admin, task.id)).rejects.toThrow();
    await cctv.verifyTask({ ...admin, id: 2 }, task.id);
    const verification = await cctv.verification(admin, {
      cameraId: camera.id,
      actualLocation: "Test",
      serialMatch: true,
      channelMatch: true,
      installed: true,
    });
    expect(verification.cameraId).toBe(camera.id);
  });

  test("CCTV map import keeps the source and is idempotent", async () => {
    await db.floorMapState.create({
      data: {
        key: "default",
        state: {
          coordinateSpace: "percent",
          pageNames: { 1: "Gudang" },
          markers: [
            {
              id: "legacy-1",
              kind: "cctv",
              name: "Pintu",
              page: 1,
              x: 20,
              y: 70,
              direction: 90,
              ip: "192.0.2.1",
              blueIrisPass: "private",
            },
            { id: "legacy-2", kind: "switch", name: "Switch", page: 1 },
          ],
        },
      },
    });
    const run = () =>
      spawnSync(process.execPath, ["scripts/import-cctv-map.cjs", "--apply"], {
        cwd: path.resolve(__dirname, "../../.."),
        env: { ...process.env, DATABASE_URL: testDatabase },
        encoding: "utf8",
      });
    const first = run();
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      found: 1,
      imported: 1,
      invalid: 0,
    });
    const camera = await db.cctvCamera.findUniqueOrThrow({
      where: { sourceMarkerId: "floor-map:legacy-1" },
    });
    expect(camera).toMatchObject({
      name: "Pintu",
      site: "Gudang",
      floorPage: 1,
      x: 20,
      y: 70,
      rotation: 90,
      status: "DRAFT",
    });
    expect(first.stdout).not.toContain("private");
    const second = run();
    expect(second.status).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({
      existing: 1,
      imported: 0,
    });
    expect(
      await db.cctvCamera.count({
        where: { sourceMarkerId: "floor-map:legacy-1" },
      }),
    ).toBe(1);
  });

  test("returns are limited by issue, independently approved, and hold remains unavailable", async () => {
    const requester = {
      ...admin,
      id: 2,
      role: "user",
      permissions: ["inventory.manage"],
    };
    const item = await inventory.item({ name: "Return item", reorderLevel: 5 });
    const bin = await inventory.bin({ name: "Return bin", warehouse: "Test" });
    await receive(item.id, bin.id, 6);
    const reservation = await inventory.reserve(admin, {
      itemId: item.id,
      binId: bin.id,
      qty: 4,
    });
    await inventory.issue(admin, {
      reservationId: reservation.reservationId,
      qty: 4,
    });
    const issue = await db.inventoryLedger.findFirstOrThrow({
      where: { itemId: item.id, type: "ISSUE" },
    });
    const body = {
      issueId: issue.id.toString(),
      qty: 3,
      disposition: "HOLD",
      note: "Periksa kondisi",
    };
    const attempts = await Promise.allSettled([
      documents.createReturn(requester, body),
      documents.createReturn(requester, body),
    ]);
    expect(
      attempts.filter((value) => value.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((value) => value.status === "rejected"),
    ).toHaveLength(1);
    const row = attempts.find((value) => value.status === "fulfilled").value;
    await expect(
      documents.approveReturn({ ...admin, id: requester.id }, row.id),
    ).rejects.toThrow();
    await documents.approveReturn(admin, row.id);
    await expect(documents.approveReturn(admin, row.id)).rejects.toThrow();
    const balance = await db.inventoryBalance.findUniqueOrThrow({
      where: { itemId_binId: { itemId: item.id, binId: bin.id } },
    });
    expect(balance).toMatchObject({ onHand: 5, hold: 3, reserved: 0 });
    const result = await db.inventoryReturn.findUniqueOrThrow({
      where: { id: row.id },
      include: { result: true },
    });
    expect(result.result).toMatchObject({
      qty: 3,
      holdDelta: 3,
      type: "RETURN",
    });
    const proposal = await documents.createProposal(requester, {
      itemId: item.id,
    });
    expect(proposal).toMatchObject({
      status: "DRAFT",
      available: 2,
      quantity: 3,
    });
    await expect(
      documents.createProposal(requester, { itemId: item.id }),
    ).rejects.toThrow();
    await expect(
      documents.approveProposal({ ...admin, id: requester.id }, proposal.id),
    ).rejects.toThrow();
    expect((await documents.approveProposal(admin, proposal.id)).status).toBe(
      "APPROVED",
    );
    await documents.closeProposal(admin, proposal.id, { note: "Diproses" });
    expect(
      (await documents.createProposal(requester, { itemId: item.id })).status,
    ).toBe("DRAFT");
    await documents.releaseHold(admin, {
      sourceId: result.result.id.toString(),
      qty: 2,
      note: "QC lulus",
    });
    await expect(
      documents.releaseHold(admin, {
        sourceId: result.result.id.toString(),
        qty: 2,
        note: "QC lulus",
      }),
    ).rejects.toThrow();
    const afterRelease = await db.inventoryBalance.findUniqueOrThrow({
      where: { itemId_binId: { itemId: item.id, binId: bin.id } },
    });
    expect(afterRelease).toMatchObject({ onHand: 5, hold: 1 });
  });

  test("CCTV evidence rejects wrong files and cross-camera verification", async () => {
    const camera = await cctv.camera(admin, {
      name: "Evidence camera",
      site: "Test",
    });
    const other = await cctv.camera(admin, {
      name: "Other camera",
      site: "Test",
    });
    const verification = await cctv.verification(admin, {
      cameraId: other.id,
      actualLocation: "Test",
      serialMatch: true,
      channelMatch: true,
      installed: true,
    });
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
    const file = {
      mimetype: "image/png",
      buffer: png,
      size: png.length,
      originalname: "evidence.png",
    };
    await expect(
      evidence.upload(admin, camera.id, file, {
        verificationId: String(verification.id),
      }),
    ).rejects.toThrow();
    await expect(
      evidence.upload(
        admin,
        camera.id,
        { ...file, buffer: Buffer.from("invalid") },
        {},
      ),
    ).rejects.toThrow();
    const stored = await evidence.upload(admin, camera.id, file, {});
    expect(stored).toMatchObject({
      cameraId: camera.id,
      originalName: "evidence.png",
      mimeType: "image/png",
    });
    expect(stored).not.toHaveProperty("internalName");
    await expect(
      evidence.list(
        { id: 3, role: "user", gaRole: "none", permissions: [] },
        camera.id,
      ),
    ).rejects.toThrow();
  });
  test("receipt requires QC, independent approval, and posts only accepted or held stock", async () => {
    const checker = { ...admin, id: 2 };
    const item = await inventory.item({ name: "Receipt item" });
    const bin = await inventory.bin({ name: "Receipt bin", warehouse: "Test" });
    const receipt = await documents.createReceipt(checker, {
      itemId: item.id,
      binId: bin.id,
      qty: 10,
    });
    await expect(documents.putawayReceipt(admin, receipt.id)).rejects.toThrow();
    await expect(
      documents.inspectReceipt(checker, receipt.id, {
        accepted: 6,
        held: 2,
        rejected: 1,
        note: "QC",
      }),
    ).rejects.toThrow();
    await documents.inspectReceipt(checker, receipt.id, {
      accepted: 6,
      held: 2,
      rejected: 2,
      note: "QC",
    });
    await expect(
      documents.putawayReceipt(checker, receipt.id),
    ).rejects.toThrow();
    await documents.putawayReceipt(admin, receipt.id);
    await expect(documents.putawayReceipt(admin, receipt.id)).rejects.toThrow();
    const balance = await db.inventoryBalance.findUniqueOrThrow({
      where: { itemId_binId: { itemId: item.id, binId: bin.id } },
    });
    expect(balance).toMatchObject({ onHand: 8, hold: 2 });
  });
  test("optional purchase orders match item and prevent concurrent over-receipts", async () => {
    const checker = { ...admin, id: 2 };
    const item = await inventory.item({ name: "PO item" });
    const other = await inventory.item({ name: "Other PO item" });
    const bin = await inventory.bin({ name: "PO bin", warehouse: "Test" });
    const order = await documents.createPurchaseOrder(checker, {
      itemId: item.id,
      qty: 10,
    });
    expect(order.code).toMatch(/^PO-/);
    await expect(
      documents.createReceipt(checker, {
        itemId: other.id,
        binId: bin.id,
        qty: 1,
        purchaseOrderId: order.id,
      }),
    ).rejects.toThrow();
    const attempts = await Promise.allSettled([
      documents.createReceipt(checker, {
        itemId: item.id,
        binId: bin.id,
        qty: 7,
        purchaseOrderId: order.id,
      }),
      documents.createReceipt(checker, {
        itemId: item.id,
        binId: bin.id,
        qty: 7,
        purchaseOrderId: order.id,
      }),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const receipt = attempts.find((a) => a.status === "fulfilled").value;
    expect(receipt.poReference).toBe(order.code);
    await expect(
      documents.closePurchaseOrder(admin, order.id),
    ).rejects.toThrow();
    await documents.inspectReceipt(checker, receipt.id, {
      accepted: 4,
      held: 1,
      rejected: 2,
      note: "QC",
    });
    await documents.putawayReceipt(admin, receipt.id);
    const next = await documents.createReceipt(checker, {
      itemId: item.id,
      binId: bin.id,
      qty: 5,
      purchaseOrderId: order.id,
    });
    await documents.cancelReceipt(checker, next.id);
    const open = (await documents.purchaseOrders()).find(
      (x) => x.id === order.id,
    );
    expect(open.allocated).toBe(5);
    await documents.closePurchaseOrder(admin, order.id);
    await expect(
      documents.createReceipt(checker, {
        itemId: item.id,
        binId: bin.id,
        qty: 1,
        purchaseOrderId: order.id,
      }),
    ).rejects.toThrow();
    await expect(
      documents.createReceipt(checker, {
        itemId: item.id,
        binId: bin.id,
        qty: 1,
      }),
    ).resolves.toBeTruthy();
  });
  test("floor coverage returns linked camera angles without camera credentials", async () => {
    const camera = await cctv.camera(admin, { name: "Coverage test", site: "Test", rotation: 90, fieldOfView: 60 });
    await db.cctvCamera.update({ where: { id: camera.id }, data: { sourceMarkerId: "floor-map:test-coverage" } });
    const coverage = await new FloorMapController(db).coverage();
    expect(coverage).toContainEqual({ sourceMarkerId: "floor-map:test-coverage", rotation: 90, fieldOfView: 60, coverageArea: null });
    expect(coverage.find((row) => row.sourceMarkerId === "floor-map:test-coverage")).not.toHaveProperty("address");
  });
});
