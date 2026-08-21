import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { ALL_PERMISSIONS } from "../src/common/defaults";

const prisma = new PrismaClient();

const DEFAULT_STAGES = [
  { id: "NEW", label: "Yangi", isSystem: true },
  { id: "CONTACTED", label: "Gaplashilgan", isSystem: true },
  { id: "IN_PROGRESS", label: "Jarayonda", isSystem: true },
  { id: "FOLLOW_UP", label: "Qayta aloqaga chiqish", isSystem: true },
  { id: "FUTURE_SALE", label: "Keyinchalik sotuv", isSystem: true },
  { id: "DEPOSIT_RECEIVED", label: "Zaklad olingan", isSystem: true },
  { id: "PAID", label: "To'lov qilindi", isSystem: true },
  { id: "INSTALLATION_REQUIRED", label: "O'rnatish kerak", isSystem: true },
  { id: "INSTALLED", label: "O'rnatib bo'ldi", isFinal: true, isSystem: true },
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
        isSystem: true,
      },
      create: {
        ...stage,
        order: index + 1,
        pipelineId: pipeline.id,
      },
    });
  }

  await prisma.currency.upsert({
    where: { code: "UZS" },
    update: { isActive: true },
    create: { id: "currency-uzs", code: "UZS", name: "O‘zbekiston so‘mi", symbol: "so‘m", isDefault: true },
  });

  const businessTypes = [
    ['business-type-retail', 'Do‘kon / Chakana savdo', 10],
    ['business-type-restaurant', 'Restoran / Kafe', 20],
    ['business-type-pharmacy', 'Dorixona', 30],
    ['business-type-beauty', 'Go‘zallik saloni', 40],
    ['business-type-services', 'Xizmat ko‘rsatish', 50],
    ['business-type-manufacturing', 'Ishlab chiqarish', 60],
    ['business-type-distribution', 'Distribyutsiya', 70],
    ['business-type-wholesale', 'Ombor / Ulgurji savdo', 80],
    ['business-type-education', 'O‘quv markazi', 90],
    ['business-type-other', 'Boshqa', 100],
  ] as const;
  for (const [id, name, sortOrder] of businessTypes) {
    await prisma.businessType.upsert({
      where: { id },
      update: { name, isActive: true, sortOrder },
      create: { id, name, isActive: true, sortOrder },
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
