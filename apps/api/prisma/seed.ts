import { PrismaClient, Role } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";

const prisma = new PrismaClient();

function day(offset = 0) {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value;
}

async function seedAdmin() {
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) return;
  await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      fullname: "System Administrator",
      role: Role.admin,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    },
  });
}

async function seedUser(username: string, fullname: string, gaRole: "staff" | "supervisor") {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return prisma.user.update({ where: { id: existing.id }, data: { fullname, gaRole, deletedAt: null } });
  }
  return prisma.user.create({
    data: {
      username,
      fullname,
      gaRole,
      passwordHash: await argon2.hash(process.env.SEED_GA_PASSWORD || randomBytes(24).toString("hex"), { type: argon2.argon2id }),
    },
  });
}

async function seedArea(input: {
  code: string;
  name: string;
  type: "building" | "floor" | "zone" | "area" | "point";
  parentId?: number;
  building?: string;
  floor?: string;
  description?: string;
  floorPage?: number;
  x?: number;
  y?: number;
  qrCode?: string;
  ownerGaId: number;
}) {
  return prisma.gaArea.upsert({
    where: { code: input.code },
    update: { ...input, status: "ACTIVE", active: true },
    create: { ...input, status: "ACTIVE", active: true, company: "ISM Demo", site: "Pabrik Utama" },
  });
}

async function seedChecklist(input: {
  areaId: number;
  workDate: Date;
  assigneeId: number;
  templateId: number;
  status: "DRAFT" | "SUBMITTED" | "VERIFIED" | "OVERDUE";
  tasks: string[];
  verifierId?: number;
}) {
  const completed = input.status === "SUBMITTED" || input.status === "VERIFIED";
  const submittedAt = completed ? new Date() : null;
  const verified = input.status === "VERIFIED";
  return prisma.gaCleaningChecklist.upsert({
    where: { areaId_workDate_assigneeId: { areaId: input.areaId, workDate: input.workDate, assigneeId: input.assigneeId } },
    update: {
      templateId: input.templateId,
      status: input.status,
      note: input.status === "OVERDUE" ? "Menunggu pelaksanaan petugas." : "Data contoh untuk demonstrasi alur GA.",
      submittedAt,
      submittedById: completed ? input.assigneeId : null,
      verifiedById: verified ? input.verifierId : null,
      verifiedAt: verified ? new Date() : null,
      lines: {
        deleteMany: {},
        create: input.tasks.map((task, sortOrder) => ({ task, sortOrder, completed: completed || sortOrder === 0, completedAt: completed || sortOrder === 0 ? new Date() : null, completedById: completed || sortOrder === 0 ? input.assigneeId : null })),
      },
    },
    create: {
      areaId: input.areaId,
      workDate: input.workDate,
      assigneeId: input.assigneeId,
      templateId: input.templateId,
      status: input.status,
      note: input.status === "OVERDUE" ? "Menunggu pelaksanaan petugas." : "Data contoh untuk demonstrasi alur GA.",
      submittedAt,
      submittedById: completed ? input.assigneeId : null,
      verifiedById: verified ? input.verifierId : null,
      verifiedAt: verified ? new Date() : null,
      lines: {
        create: input.tasks.map((task, sortOrder) => ({ task, sortOrder, completed: completed || sortOrder === 0, completedAt: completed || sortOrder === 0 ? new Date() : null, completedById: completed || sortOrder === 0 ? input.assigneeId : null })),
      },
    },
  });
}

async function seedGa() {
  const supervisor = await seedUser("seed_ga_supervisor", "GA Supervisor Demo", "supervisor");
  const staff = await seedUser("seed_ga_staff", "Petugas GA Demo", "staff");
  const admin = await prisma.user.findFirst({ where: { role: Role.admin, deletedAt: null }, orderBy: { id: "asc" } });
  const verifierId = admin?.id || supervisor.id;
  const building = await seedArea({ code: "GA-SEED-BLD-001", name: "Pabrik Utama", type: "building", ownerGaId: supervisor.id, description: "Lokasi demonstrasi General Affair." });
  const floor = await seedArea({ code: "GA-SEED-FLR-001", name: "Lantai Dasar", type: "floor", parentId: building.id, building: building.name, floor: "Lantai Dasar", floorPage: 1, ownerGaId: supervisor.id });
  const zone = await seedArea({ code: "GA-SEED-ZON-001", name: "Zona Operasional", type: "zone", parentId: floor.id, building: building.name, floor: floor.name, floorPage: 1, ownerGaId: supervisor.id });
  const lobby = await seedArea({ code: "GA-SEED-ARE-001", name: "Lobby dan Halaman Depan", type: "area", parentId: zone.id, building: building.name, floor: floor.name, floorPage: 1, x: 18, y: 21, qrCode: "GA-SEED-QR-001", ownerGaId: supervisor.id, description: "Area penerimaan tamu dan akses utama." });
  const warehouse = await seedArea({ code: "GA-SEED-ARE-002", name: "Area Gudang", type: "area", parentId: zone.id, building: building.name, floor: floor.name, floorPage: 1, x: 53, y: 47, qrCode: "GA-SEED-QR-002", ownerGaId: supervisor.id, description: "Area penyimpanan material dan jalur forklift." });
  const weighbridge = await seedArea({ code: "GA-SEED-ARE-003", name: "Timbangan dan Pos Security", type: "area", parentId: zone.id, building: building.name, floor: floor.name, floorPage: 1, x: 79, y: 68, qrCode: "GA-SEED-QR-003", ownerGaId: supervisor.id, description: "Area timbang kendaraan dan pemeriksaan keamanan." });
  const parking = await seedArea({ code: "GA-SEED-ARE-004", name: "Parkir Selatan", type: "area", parentId: zone.id, building: building.name, floor: floor.name, floorPage: 1, x: 32, y: 81, qrCode: "GA-SEED-QR-008", ownerGaId: supervisor.id, description: "Parkir karyawan dan kendaraan operasional." });
  await seedArea({ code: "GA-SEED-PNT-001", name: "Titik APAR Lobby", type: "point", parentId: lobby.id, building: building.name, floor: floor.name, floorPage: 1, x: 22, y: 28, qrCode: "GA-SEED-QR-005", ownerGaId: supervisor.id });
  await seedArea({ code: "GA-SEED-PNT-002", name: "Titik CCTV Gudang", type: "point", parentId: warehouse.id, building: building.name, floor: floor.name, floorPage: 1, x: 58, y: 42, qrCode: "GA-SEED-QR-006", ownerGaId: supervisor.id });
  await seedArea({ code: "GA-SEED-PNT-003", name: "Pos Jaga Timbangan", type: "point", parentId: weighbridge.id, building: building.name, floor: floor.name, floorPage: 1, x: 85, y: 62, qrCode: "GA-SEED-QR-007", ownerGaId: supervisor.id });
  for (const area of [building, floor, zone, lobby, warehouse, weighbridge]) {
    const history = await prisma.gaAreaHistory.findFirst({ where: { areaId: area.id, action: "SEED_CREATED" } });
    if (!history) await prisma.gaAreaHistory.create({ data: { areaId: area.id, actorId: supervisor.id, action: "SEED_CREATED", snapshot: { code: area.code, status: "ACTIVE" } } });
  }
  const tasks = ["Menyapu dan mengepel area", "Mengosongkan tempat sampah", "Memeriksa kondisi fasilitas", "Mengunggah bukti pekerjaan"];
  const cleaningAreas = [
    { area: lobby, name: "GA Seed - Cleaning Harian Lobby" },
    { area: warehouse, name: "GA Seed - Cleaning Harian Gudang" },
    { area: weighbridge, name: "GA Seed - Cleaning Harian Timbangan" },
    { area: parking, name: "GA Seed - Cleaning Harian Parkir" },
  ];
  const templates = new Map<number, number>();
  for (const item of cleaningAreas) {
    const existing = await prisma.gaCleaningTemplate.findFirst({ where: { name: item.name, areaId: item.area.id } });
    const template = existing
      ? await prisma.gaCleaningTemplate.update({ where: { id: existing.id }, data: { tasks, weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: day(-14), generatedThrough: day(14), active: true } })
      : await prisma.gaCleaningTemplate.create({ data: { name: item.name, areaId: item.area.id, assigneeId: staff.id, tasks, weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: day(-14), generatedThrough: day(14), createdById: supervisor.id } });
    templates.set(item.area.id, template.id);
  }
  for (let offset = -6; offset <= 1; offset += 1) {
    for (const [index, item] of cleaningAreas.entries()) {
      const status = offset < -1 ? "VERIFIED" : offset === -1 && index === 1 ? "OVERDUE" : offset === 0 && index === 0 ? "SUBMITTED" : offset === 0 && index === 1 ? "DRAFT" : "VERIFIED";
      await seedChecklist({ areaId: item.area.id, workDate: day(offset), assigneeId: staff.id, templateId: templates.get(item.area.id)!, status, tasks, verifierId });
    }
  }
  const outdoor = await prisma.gaOutdoorInspection.upsert({
    where: { areaId_inspectedAt: { areaId: lobby.id, inspectedAt: day() } },
    update: { inspectorId: staff.id, plantCondition: "BAIK", drainCondition: "BAIK", cleanliness: "BAIK", action: "Pemangkasan ringan dan pembersihan jalur masuk.", status: "VERIFIED", submittedAt: new Date(), submittedById: staff.id, verifiedById: verifierId, verifiedAt: new Date() },
    create: { areaId: lobby.id, inspectedAt: day(), inspectorId: staff.id, plantCondition: "BAIK", drainCondition: "BAIK", cleanliness: "BAIK", action: "Pemangkasan ringan dan pembersihan jalur masuk.", status: "VERIFIED", submittedAt: new Date(), submittedById: staff.id, verifiedById: verifierId, verifiedAt: new Date() },
  });
  const outdoorRows = [
    { area: warehouse, inspectedAt: day(), plantCondition: "PERLU_PERHATIAN", drainCondition: "BAIK", cleanliness: "CUKUP", action: "Penataan material di jalur inspeksi.", status: "SUBMITTED" as const },
    { area: weighbridge, inspectedAt: day(), plantCondition: "BAIK", drainCondition: "PERLU_PERHATIAN", cleanliness: "BAIK", action: "Pembersihan saluran air sisi timbangan.", status: "DRAFT" as const },
    { area: parking, inspectedAt: day(-3), plantCondition: "BAIK", drainCondition: "BAIK", cleanliness: "BAIK", action: "Pembersihan area parkir selesai.", status: "VERIFIED" as const },
  ];
  for (const item of outdoorRows) {
    const submitted = item.status === "SUBMITTED" || item.status === "VERIFIED";
    const verified = item.status === "VERIFIED";
    await prisma.gaOutdoorInspection.upsert({
      where: { areaId_inspectedAt: { areaId: item.area.id, inspectedAt: item.inspectedAt } },
      update: { inspectorId: staff.id, plantCondition: item.plantCondition, drainCondition: item.drainCondition, cleanliness: item.cleanliness, action: item.action, status: item.status, submittedAt: submitted ? new Date() : null, submittedById: submitted ? staff.id : null, verifiedById: verified ? verifierId : null, verifiedAt: verified ? new Date() : null },
      create: { areaId: item.area.id, inspectedAt: item.inspectedAt, inspectorId: staff.id, plantCondition: item.plantCondition, drainCondition: item.drainCondition, cleanliness: item.cleanliness, action: item.action, status: item.status, submittedAt: submitted ? new Date() : null, submittedById: submitted ? staff.id : null, verifiedById: verified ? verifierId : null, verifiedAt: verified ? new Date() : null },
    });
  }
  const mediaDir = resolve(process.env.UPLOAD_ROOT || "uploads", "ga-outdoor");
  const mediaName = "ga-seed-outdoor-proof.png";
  await mkdir(mediaDir, { recursive: true });
  await writeFile(resolve(mediaDir, mediaName), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  const media = await prisma.gaOutdoorMedia.findFirst({ where: { inspectionId: outdoor.id, originalName: "bukti-inspeksi-outdoor.png" } });
  if (!media) await prisma.gaOutdoorMedia.create({ data: { inspectionId: outdoor.id, type: "PHOTO", internalName: mediaName, originalName: "bukti-inspeksi-outdoor.png", mimeType: "image/png", size: 68, createdById: staff.id } });
  const plans = [
    { title: "GA Seed - Pemeriksaan Drainase Mingguan", areaId: lobby.id, targetDate: day(1), jobStatus: "RELEASED" as const },
    { title: "GA Seed - Pemeriksaan Jalur Forklift", areaId: warehouse.id, targetDate: day(-1), jobStatus: "OVERDUE" as const },
    { title: "GA Seed - Pemeriksaan APAR Lobby", areaId: lobby.id, targetDate: day(-2), jobStatus: "VERIFIED" as const },
    { title: "GA Seed - Pemeriksaan Penerangan Parkir", areaId: parking.id, targetDate: day(2), jobStatus: "STARTED" as const },
  ];
  for (const item of plans) {
    const current = await prisma.gaPreventivePlan.findFirst({ where: { title: item.title } });
    const planData = { areaId: item.areaId, standardWork: "Periksa kondisi fisik, catat temuan, dan lakukan tindakan awal.", weekNo: 42, targetDate: item.targetDate, recurrence: "WEEKLY", pic1Id: staff.id, priority: "NORMAL", status: "RELEASED" as const, proposedAt: day(-7), approvedById: verifierId, approvedAt: day(-6), releasedAt: day(-5) };
    const plan = current ? await prisma.gaPreventivePlan.update({ where: { id: current.id }, data: planData }) : await prisma.gaPreventivePlan.create({ data: { title: item.title, ...planData } });
    await prisma.gaPreventiveJob.upsert({ where: { planId: plan.id }, update: { status: item.jobStatus, targetDate: item.targetDate, standardWork: planData.standardWork, pic1Id: staff.id }, create: { planId: plan.id, areaId: item.areaId, pic1Id: staff.id, targetDate: item.targetDate, standardWork: planData.standardWork, status: item.jobStatus } });
  }
  const finding = await prisma.gaFinding.upsert({
    where: { code: "GAF-SEED-0001" },
    update: { status: "IN_PROGRESS", assigneeId: staff.id, dueDate: day(3), containment: "Area diberi penanda sementara.", rootCause: "Pelindung kabel mengalami aus.", correctiveAction: "Penggantian pelindung kabel oleh tim terkait.", escalatedTicket: "GIT-SEED-0001" },
    create: { code: "GAF-SEED-0001", title: "Pelindung kabel area timbangan perlu diganti", description: "Pelindung kabel jalur operasional menunjukkan tanda aus.", source: "OUTDOOR_INSPECTION", areaId: weighbridge.id, severity: "HIGH", status: "IN_PROGRESS", assigneeId: staff.id, dueDate: day(3), containment: "Area diberi penanda sementara.", rootCause: "Pelindung kabel mengalami aus.", correctiveAction: "Penggantian pelindung kabel oleh tim terkait.", escalatedTicket: "GIT-SEED-0001", createdById: supervisor.id },
  });
  await prisma.gaItTicket.upsert({ where: { findingId: finding.id }, update: { code: "GIT-SEED-0001", status: "OPEN", createdById: supervisor.id }, create: { code: "GIT-SEED-0001", findingId: finding.id, status: "OPEN", createdById: supervisor.id } });
  await prisma.gaFinding.upsert({
    where: { code: "GAF-SEED-0002" },
    update: { status: "RESOLVED", assigneeId: staff.id, dueDate: day(-1), containment: "Rambu peringatan telah dipasang.", correctiveAction: "Marka jalur forklift telah diperbarui.", resolvedById: staff.id },
    create: { code: "GAF-SEED-0002", title: "Marka jalur forklift memudar", description: "Marka keselamatan di area gudang perlu diperbarui.", source: "PREVENTIVE", areaId: warehouse.id, severity: "MEDIUM", status: "RESOLVED", assigneeId: staff.id, dueDate: day(-1), containment: "Rambu peringatan telah dipasang.", correctiveAction: "Marka jalur forklift telah diperbarui.", resolvedById: staff.id, createdById: supervisor.id },
  });
  await prisma.gaFinding.upsert({
    where: { code: "GAF-SEED-0003" },
    update: { status: "OPEN", assigneeId: staff.id, dueDate: day(5), containment: "Pengecekan lampu dijadwalkan.", rootCause: "Menunggu verifikasi teknis." },
    create: { code: "GAF-SEED-0003", title: "Penerangan parkir sisi selatan redup", description: "Dua titik lampu parkir perlu diperiksa.", source: "OUTDOOR_INSPECTION", areaId: parking.id, severity: "LOW", status: "OPEN", assigneeId: staff.id, dueDate: day(5), containment: "Pengecekan lampu dijadwalkan.", rootCause: "Menunggu verifikasi teknis.", createdById: supervisor.id },
  });
  const angle = await prisma.gaCctvAngleInspection.findFirst({ where: { cameraName: "CCTV-SEED-01" } });
  if (angle) await prisma.gaCctvAngleInspection.update({ where: { id: angle.id }, data: { areaId: weighbridge.id, status: "GAP_FOUND", coverage: "Jalur masuk dan timbangan", gapDescription: "Sudut blind spot di sisi kanan jalur masuk.", inspectorId: staff.id, reviewerId: verifierId, inspectedAt: new Date(), reviewedAt: new Date() } });
  else await prisma.gaCctvAngleInspection.create({ data: { cameraName: "CCTV-SEED-01", areaId: weighbridge.id, plannedViewReference: "Denah Timbangan v1", coverage: "Jalur masuk dan timbangan", gapDescription: "Sudut blind spot di sisi kanan jalur masuk.", status: "GAP_FOUND", inspectorId: staff.id, reviewerId: verifierId, inspectedAt: new Date(), reviewedAt: new Date() } });
  const cctvRows = [
    { cameraName: "CCTV-SEED-02", areaId: warehouse.id, status: "MATCH" as const, coverage: "Rak material dan jalur forklift", gapDescription: null },
    { cameraName: "CCTV-SEED-03", areaId: lobby.id, status: "IT_ACTION" as const, coverage: "Pintu masuk dan meja resepsionis", gapDescription: "Pembersihan lensa diperlukan." },
  ];
  for (const item of cctvRows) {
    const current = await prisma.gaCctvAngleInspection.findFirst({ where: { cameraName: item.cameraName } });
    const data = { areaId: item.areaId, status: item.status, coverage: item.coverage, gapDescription: item.gapDescription, inspectorId: staff.id, reviewerId: verifierId, inspectedAt: new Date(), reviewedAt: new Date() };
    if (current) await prisma.gaCctvAngleInspection.update({ where: { id: current.id }, data });
    else await prisma.gaCctvAngleInspection.create({ data: { cameraName: item.cameraName, plannedViewReference: "Denah GA v1", ...data } });
  }
  await prisma.gaWeighbridgeReconciliation.upsert({ where: { ticketNumber: "GA-SEED-WB-001" }, update: { status: "MATCH", verifiedById: verifierId, verifiedAt: new Date() }, create: { ticketNumber: "GA-SEED-WB-001", securityTime: new Date(Date.now() - 60 * 60 * 1000), cctvTime: new Date(Date.now() - 59 * 60 * 1000), cameraName: "CCTV-SEED-01", plateNumber: "BK 1234 ISM", vehicleType: "Truk", goodsType: "Material operasional", durationMinutes: 12, checkerId: staff.id, status: "MATCH", verifiedById: verifierId, verifiedAt: new Date() } });
  await prisma.gaWeighbridgeReconciliation.upsert({ where: { ticketNumber: "GA-SEED-WB-002" }, update: { status: "DISCREPANCY", discrepancyReason: "Waktu CCTV selisih lebih dari lima menit." }, create: { ticketNumber: "GA-SEED-WB-002", securityTime: new Date(Date.now() - 3 * 60 * 60 * 1000), cctvTime: new Date(Date.now() - 3 * 60 * 60 * 1000 - 8 * 60 * 1000), cameraName: "CCTV-SEED-01", plateNumber: "BK 7890 GA", vehicleType: "Pickup", goodsType: "Dokumen", durationMinutes: 9, checkerId: staff.id, status: "DISCREPANCY", discrepancyReason: "Waktu CCTV selisih lebih dari lima menit." } });
  const offline = await prisma.gaCctvOfflineCase.findFirst({ where: { cameraName: "CCTV-SEED-02", source: "GA SEED" } });
  if (!offline) await prisma.gaCctvOfflineCase.create({ data: { cameraName: "CCTV-SEED-02", areaId: warehouse.id, detectedAt: new Date(Date.now() - 35 * 60 * 1000), offlineMinutes: 35, source: "GA SEED", severity: "MEDIUM", reason: "Pemeriksaan koneksi NVR", status: "IT_ESCALATED", validatedAt: new Date(Date.now() - 30 * 60 * 1000), escalatedAt: new Date(Date.now() - 25 * 60 * 1000), createdById: supervisor.id } });
  await prisma.gaReport.upsert({ where: { code: "GAR-SEED-0001" }, update: { status: "PUBLISHED", snapshot: { cleaningCompliance: 92, outdoorVerified: 1, preventiveOverdue: 1, openFindings: 1, period: "Minggu berjalan" }, reviewedById: verifierId, reviewedAt: new Date(), publishedById: verifierId, publishedAt: new Date() }, create: { code: "GAR-SEED-0001", periodStart: day(-6), periodEnd: day(), status: "PUBLISHED", snapshot: { cleaningCompliance: 92, outdoorVerified: 1, preventiveOverdue: 1, openFindings: 1, period: "Minggu berjalan" }, createdById: supervisor.id, reviewedById: verifierId, reviewedAt: new Date(), publishedById: verifierId, publishedAt: new Date() } });
  return { areas: 10, cleaningChecklists: 32, outdoorInspections: 4, preventivePlans: plans.length, cctvControls: 3, findings: 3, reports: 1 };
}

async function main() {
  await seedAdmin();
  const result = await seedGa();
  console.log(`GA seed selesai: ${JSON.stringify(result)}`);
}

main().finally(() => prisma.$disconnect());
