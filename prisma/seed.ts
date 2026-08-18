import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { ALL_PERMISSIONS } from "../src/common/defaults";

const prisma = new PrismaClient();

const DEFAULT_STAGES = [
  { id: "NEW", label: "Yangi" },
  { id: "CONTACTED", label: "Gaplashilgan" },
  { id: "IN_PROGRESS", label: "Jarayonda" },
  { id: "FOLLOW_UP", label: "Qayta aloqaga chiqish" },
  { id: "FUTURE_SALE", label: "Keyinchalik sotuv" },
  { id: "DEPOSIT_RECEIVED", label: "Zaklad olingan" },
  { id: "PAID", label: "To'lov qilindi" },
  { id: "INSTALLATION_REQUIRED", label: "O'rnatish kerak" },
  { id: "INSTALLED", label: "O'rnatib bo'ldi", isFinal: true },
];

async function main() {
  const team = await prisma.team.upsert({
    where: { name: "Sotuv" },
    update: {},
    create: {
      name: "Sotuv",
      description: "Sotuv bo'limi",
    },
  });

  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const adminPhone = "+998900000000";

  if (!email || !password) {
    throw new Error(
      "Seed uchun ADMIN_EMAIL va ADMIN_PASSWORD environment variable berilishi shart",
    );
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { username: "admin" },
        { phone: adminPhone },
      ],
    },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        name: "Admin",
        email,
        username: "admin",
        phone: adminPhone,
        passwordHash: await bcrypt.hash(password, 12),
        role: "ADMIN",
        permissions: ALL_PERMISSIONS,
        teamId: team.id,
      },
    });
  }

  const pipeline = await prisma.pipeline.upsert({
    where: { name: "Asosiy savdo" },
    update: {},
    create: {
      name: "Asosiy savdo",
    },
  });

  for (const [index, stage] of DEFAULT_STAGES.entries()) {
    await prisma.stage.upsert({
      where: { id: stage.id },
      update: {
        label: stage.label,
        order: index + 1,
        pipelineId: pipeline.id,
        isFinal: Boolean(stage.isFinal),
      },
      create: {
        ...stage,
        order: index + 1,
        pipelineId: pipeline.id,
      },
    });
  }

  for (const name of ["VIP", "Bito", "Ilxom aka mijozlari"]) {
    await prisma.customerGroup.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  await prisma.programCatalog.upsert({
    where: { id: "program-bito" },
    update: {},
    create: {
      id: "program-bito",
      name: "Bito",
      type: "CRM",
      version: "1.0",
      description: "Bito CRM dasturi",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });