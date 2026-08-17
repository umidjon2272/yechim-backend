import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_STAGES = [
  { id: 'NEW', label: 'Yangi' },
  { id: 'CONTACTED', label: 'Gaplashilgan' },
  { id: 'IN_PROGRESS', label: 'Jarayonda' },
  { id: 'FOLLOW_UP', label: 'Qayta aloqaga chiqish' },
  { id: 'FUTURE_SALE', label: 'Keyinchalik sotuv' },
  { id: 'DEPOSIT_RECEIVED', label: 'Zaklad olingan' },
  { id: 'PAID', label: "To'lov qilindi" },
  { id: 'INSTALLATION_REQUIRED', label: "O'rnatish kerak" },
  { id: 'INSTALLED', label: "O'rnatib bo'ldi" },
];

const ADMIN_PERMISSIONS = [
  'dashboard.view',
  'customers.view',
  'customers.create',
  'customers.edit',
  'customers.delete',
  'businesses.view',
  'businesses.create',
  'businesses.edit',
  'leads.view',
  'leads.create',
  'leads.edit',
  'leads.convert',
  'deals.view',
  'deals.create',
  'deals.edit',
  'deals.changeStage',
  'payments.view',
  'payments.create',
  'tasks.view',
  'tasks.create',
  'tasks.edit',
  'tasks.viewAll',
  'activities.view',
  'activities.create',
  'installations.view',
  'installations.create',
  'installations.edit',
  'employees.view',
  'employees.create',
  'employees.edit',
  'teams.view',
  'teams.create',
  'teams.edit',
  'settings.view',
  'settings.edit',
  'profit.view',
  'reports.view',
  'notifications.view',
  'comments.create',
  'attachments.create',
];

async function main() {
  const team = await prisma.team.upsert({
    where: { name: 'Sotuv' },
    update: {},
    create: { name: 'Sotuv', description: "Sotuv bo'limi" },
  });

  const email = process.env.ADMIN_EMAIL || 'admin@yechim.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username: 'admin' }] },
  });
  if (!existing) {
    await prisma.user.create({
      data: {
        name: 'Admin',
        email,
        username: 'admin',
        phone: '+998900000000',
        passwordHash: await bcrypt.hash(password, 12),
        role: 'ADMIN',
        permissions: ADMIN_PERMISSIONS,
        teamId: team.id,
      },
    });
  }

  const pipeline = await prisma.pipeline.upsert({
    where: { name: 'Asosiy savdo' },
    update: {},
    create: { name: 'Asosiy savdo' },
  });

  for (const [index, stage] of DEFAULT_STAGES.entries()) {
    await prisma.stage.upsert({
      where: { id: stage.id },
      update: { label: stage.label, order: index + 1, pipelineId: pipeline.id },
      create: { ...stage, order: index + 1, pipelineId: pipeline.id },
    });
  }

  for (const name of ['VIP', 'Bito', 'Ilxom aka mijozlari']) {
    await prisma.customerGroup.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.programCatalog.upsert({
    where: { id: 'program-bito' },
    update: {},
    create: { id: 'program-bito', name: 'Bito', type: 'CRM', version: '1.0', description: 'Bito CRM dasturi' },
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
