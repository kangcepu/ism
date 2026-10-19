import { PrismaClient, Role } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    console.log("SEED_ADMIN_PASSWORD kosong; seed admin dilewati.");
    return;
  }
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

main().finally(() => prisma.$disconnect());
