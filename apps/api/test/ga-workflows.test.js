const { PrismaClient } = require("@prisma/client");
const {
  GaScheduleController,
  GaScheduleService,
} = require("../dist/src/modules/ga/ga-schedule.controller");
const {
  GaOperationsController,
} = require("../dist/src/modules/ga/ga-operations.controller");
const {
  GaControlController,
} = require("../dist/src/modules/ga/ga-control.controller");
const {
  GaReportingController,
} = require("../dist/src/modules/ga/ga-reporting.controller");
const {
  GaTicketsController,
} = require("../dist/src/modules/operations/ga-tickets.controller");

const testDatabase = process.env.GA_TEST_DATABASE_URL;
if (
  testDatabase &&
  !/^ism_test_[a-f0-9]+$/.test(
    new URL(testDatabase).searchParams.get("schema") || "",
  )
)
  throw new Error("GA tests require an isolated test schema.");
const suite = testDatabase ? describe : describe.skip;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

suite("GA scheduled cleaning, verification, tickets and reports", () => {
  let db,
    schedule,
    generator,
    operations,
    control,
    reports,
    tickets,
    worker,
    supervisor,
    reviewer,
    area;
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: testDatabase } } });
    await db.$connect();
    const users = await Promise.all(
      ["staff", "supervisor", "supervisor"].map((gaRole, index) =>
        db.user.create({
          data: {
            username: `ga-test-${index}`,
            fullname: `GA ${index}`,
            passwordHash: "test",
            gaRole,
          },
        }),
      ),
    );
    [worker, supervisor, reviewer] = users.map((user) => ({
      id: user.id,
      role: user.role,
      gaRole: user.gaRole,
      permissions: [],
    }));
    area = await db.gaArea.create({
      data: {
        code: "GA-TEST",
        name: "Area Test",
        type: "area",
        status: "ACTIVE",
      },
    });
    generator = new GaScheduleService(db);
    schedule = new GaScheduleController(db, generator);
    operations = new GaOperationsController(db);
    control = new GaControlController(db);
    reports = new GaReportingController(db);
    tickets = new GaTicketsController(db);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  test("generates recurring tasks once, prevents skipped states and self verification", async () => {
    const template = await schedule.create(supervisor, {
      name: "Harian",
      areaId: area.id,
      assigneeId: worker.id,
      startDate: today(),
      tasks: ["Bersihkan area"],
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(await generator.generate(template.id)).toBe(0);
    const checklists = await db.gaCleaningChecklist.findMany({
      where: { templateId: template.id },
      include: { lines: true },
      orderBy: { workDate: "asc" },
    });
    expect(checklists).toHaveLength(8);
    const checklist = checklists[0];
    await expect(
      operations.verifyCleaning(supervisor, checklist.id, { accepted: true }),
    ).rejects.toThrow();
    await operations.line(worker, checklist.lines[0].id, { completed: true });
    await operations.submitCleaning(worker, checklist.id);
    await expect(
      operations.verifyCleaning(worker, checklist.id, { accepted: true }),
    ).rejects.toThrow();
    await operations.verifyCleaning(supervisor, checklist.id, {
      accepted: true,
    });
    await expect(
      operations.submitCleaning(worker, checklist.id),
    ).rejects.toThrow();
    const own = await operations.createCleaning(supervisor, {
      areaId: area.id,
      workDate: today(),
      assigneeId: supervisor.id,
      tasks: ["Pemeriksaan sendiri"],
    });
    await operations.line(supervisor, own.lines[0].id, { completed: true });
    await operations.submitCleaning(supervisor, own.id);
    await expect(
      operations.verifyCleaning(supervisor, own.id, { accepted: true }),
    ).rejects.toThrow("Petugas atau pengirim");
    const week = await schedule.weekly(supervisor, today());
    expect(week.verified).toBe(1);
    await schedule.setActive(supervisor, template.id, { active: false });
    expect(
      await db.gaCleaningChecklist.count({
        where: { templateId: template.id, status: "CANCELLED" },
      }),
    ).toBe(7);
  });

  test("links a real local IT ticket and enforces its workflow before closing a finding", async () => {
    const finding = await control.finding(worker, {
      title: "Gangguan",
      description: "Perlu IT",
      source: "GA",
    });
    const ticket = await control.ticket(worker, finding.id);
    expect((await control.ticket(worker, finding.id)).id).toBe(ticket.id);
    await control.findingAction(worker, finding.id, "start");
    await expect(
      control.findingAction(worker, finding.id, "resolve"),
    ).rejects.toThrow();
    await tickets.start(ticket.id);
    await expect(
      tickets.resolve(supervisor, ticket.id, { resolution: "" }),
    ).rejects.toThrow();
    await tickets.resolve(supervisor, ticket.id, {
      resolution: "Perbaikan selesai",
    });
    await control.findingAction(worker, finding.id, "resolve");
    await expect(
      control.findingAction(worker, finding.id, "close"),
    ).rejects.toThrow();
    const closed = await control.findingAction(reviewer, finding.id, "close");
    expect(closed.status).toBe("CLOSED");
    const list = await control.findings(supervisor);
    expect(list.find((x) => x.id === finding.id).itTicket.resolution).toBe(
      "Perbaikan selesai",
    );
  });

  test("reports explicit denominators and requires independent review before publication", async () => {
    const snapshot = await reports.dashboard(supervisor, today(), today());
    const metric = snapshot.metrics.find(
      (x) => x.name === "Penyelesaian cleaning",
    );
    expect(metric.numerator).toBe(1);
    expect(metric.denominator).toBe(2);
    const draft = await reports.create(supervisor, {
      start: today(),
      end: today(),
    });
    await expect(reports.publish(supervisor, draft.id)).rejects.toThrow();
    await expect(reports.review(supervisor, draft.id)).rejects.toThrow();
    await reports.review(reviewer, draft.id);
    const published = await reports.publish(supervisor, draft.id);
    expect(published.status).toBe("PUBLISHED");
    expect(published.snapshot.metrics[0].value).toBe(50);
  });
});
