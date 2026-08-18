import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { customerDto } from '../src/common/mappers';
import { ActivitiesService } from '../src/activities/activities.service';
import { RemindersService } from '../src/reminders/reminders.service';
import { CustomersService } from '../src/customers/customers.service';
import { EmployeesService } from '../src/employees/employees.service';

async function main() {
const now = new Date();
const todayAtThree = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0, 0);
const yesterday = new Date(todayAtThree.getTime() - 86400000);
const oldStageDate = new Date(now.getTime() - 8 * 86400000);

const customer = customerDto({
  id: 'customer-1',
  name: 'Ali Valiyev',
  stageId: 'IN_PROGRESS',
  stage: { id: 'IN_PROGRESS', label: 'Jarayonda', isFinal: false },
  assignedEmployeeId: 'employee-1',
  assignedEmployee: { id: 'employee-1', name: 'Sardor' },
  nextContactAt: todayAtThree,
  stageEnteredAt: oldStageDate,
  createdAt: oldStageDate,
  updatedAt: oldStageDate,
  activities: [{ id: 'note-1', type: 'NOTE', message: 'Direktor bilan kelishadi', createdAt: now, createdBy: { id: 'employee-1', name: 'Sardor' } }],
});
assert.ok(customer, 'customer dto fixture');
assert.ok(customer.latestNote, 'latest note fixture');
assert.equal(customer.isFollowUpToday, true, 'today follow-up flag');
assert.equal(customer.isFollowUpOverdue, false, 'today follow-up is not overdue');
assert.equal(customer.isStageStale, true, 'stage stale threshold');
assert.ok(customer.stageDurationDays >= 8, 'stage duration days');
assert.equal(customer.latestNote.message, 'Direktor bilan kelishadi', 'latest note');

const overdueCustomer = customerDto({ ...customer, nextContactAt: yesterday, activities: [] });
assert.ok(overdueCustomer, 'overdue customer dto fixture');
assert.equal(overdueCustomer.isFollowUpOverdue, true, 'overdue follow-up flag');

const partnerCustomer: any = customerDto(
  {
    id: 'partner-customer-1',
    name: 'Partner client',
    phone: '+998901234567',
    amount: 10000000,
    depositAmount: 2000000,
    email: 'internal@example.test',
    notes: 'internal note',
    stageId: 'INSTALLED',
    stage: { id: 'INSTALLED', label: "O'rnatib bo'ldi", isFinal: true },
    assignedEmployee: { id: 'employee-1', name: 'Internal employee' },
    groups: [{ id: 'group-1', partnerRewardPerCustomer: 100 }],
  },
  { partner: true, partnerGroupId: 'group-1' },
);
assert.deepEqual(
  Object.keys(partnerCustomer).sort(),
  ['id', 'name', 'phone', 'stage', 'stageId', 'stageLabel', 'isCompleted', 'status', 'rewardAmount'].sort(),
  'partner response is minimal',
);
assert.equal(partnerCustomer.rewardAmount, 100, 'partner reward amount');
assert.equal('amount' in partnerCustomer, false, 'partner cannot see sales amount');
assert.equal('assignedEmployee' in partnerCustomer, false, 'partner cannot see assignee');

const employeeService = new EmployeesService({} as any);
await assert.rejects(() => employeeService.create({ name: 'Xodim', phone: '901234567', username: 'xodim', password: 'secret1' }), /Telefon raqami/);
await assert.rejects(() => employeeService.create({ name: 'Xodim', phone: '+998901234567', username: 'x', password: 'secret1' }), /Login kamida/);

const stageService = new CustomersService({
  stage: {
    findUnique: async ({ where }: any) => (where.id === 'FOLLOW_UP' ? { id: 'FOLLOW_UP' } : null),
    findMany: async () => [{ id: 'FOLLOW_UP', label: 'Qayta aloqaga chiqish' }],
  },
  pipeline: { findFirstOrThrow: async () => ({ id: 'pipeline-1' }) },
} as any);
assert.equal(await (stageService as any).resolveStageId('Qayta aloqaga chiqish'), 'FOLLOW_UP', 'stage label normalization');

let reminderCreatePayload: any;
let customerUpdatePayload: any;
let activityPayload: any;
const reminderRecord: any = { id: 'reminder-1', customerId: 'customer-1', assignedUserId: 'employee-1', type: 'CALL', title: 'Ali Valiyevga qo\'ng\'iroq qilish', remindAt: todayAtThree, status: 'PENDING', completedAt: null, createdAt: now, customer: { id: 'customer-1', name: 'Ali Valiyev', nextContactAt: todayAtThree }, assignedUser: { id: 'employee-1', name: 'Sardor' } };
const reminderPrisma: any = {
  customer: {
    findFirst: async () => ({ id: 'customer-1', name: 'Ali Valiyev', assignedEmployeeId: 'employee-1' }),
    update: async ({ data }: any) => { customerUpdatePayload = data; return { id: 'customer-1' }; },
  },
  reminder: {
    updateMany: async () => ({ count: 1 }),
    create: async ({ data }: any) => { reminderCreatePayload = data; return reminderRecord; },
    findUnique: async () => reminderRecord,
    update: async ({ data }: any) => ({ ...reminderRecord, ...data, status: 'COMPLETED', completedAt: data.completedAt }),
    findMany: async () => [],
  },
  activity: { create: async ({ data }: any) => { activityPayload = data; return data; } },
  notification: { upsert: async () => null },
  task: { findMany: async () => [] },
  installation: { findMany: async () => [] },
};
const reminderService = new RemindersService(reminderPrisma);
await reminderService.create({ customerId: 'customer-1', remindAt: todayAtThree.toISOString(), type: 'CALL' }, { id: 'employee-1', role: 'EMPLOYEE', permissions: [] });
assert.equal(reminderCreatePayload.customerId, 'customer-1', 'reminder customer link');
assert.equal(reminderCreatePayload.assignedUserId, 'employee-1', 'reminder ownership');
assert.equal(customerUpdatePayload.nextContactAt.getTime(), todayAtThree.getTime(), 'nextContactAt persisted');
assert.equal(activityPayload.type, 'REMINDER_CREATED', 'reminder timeline activity');

const completed = await reminderService.complete('reminder-1', { id: 'employee-1', role: 'EMPLOYEE', permissions: [] });
assert.equal(completed.status, 'COMPLETED', 'reminder completion status');
assert.equal(customerUpdatePayload.nextContactAt, null, 'completed reminder clears next contact');
assert.ok(customerUpdatePayload.lastContactAt, 'completed reminder sets last contact');

let activityCreatePayload: any;
const activityPrisma: any = {
  customer: { findFirst: async () => ({ id: 'customer-1' }) },
  activity: {
    create: async ({ data }: any) => { activityCreatePayload = data; return { id: 'activity-1', ...data, createdAt: now, createdBy: { id: 'employee-1', name: 'Sardor' } }; },
  },
};
const activities = new ActivitiesService(activityPrisma);
await activities.create({ customerId: 'customer-1', type: 'NOTE', title: 'Izoh', description: 'Narxni kelishadi' }, { id: 'employee-1', role: 'EMPLOYEE', permissions: [] });
assert.equal(activityCreatePayload.type, 'NOTE', 'note activity type');
assert.equal(activityCreatePayload.message, 'Izoh: Narxni kelishadi', 'note timeline message');

const schema = readFileSync('prisma/schema.prisma', 'utf8');
const migration = readFileSync('prisma/migrations/20260818150000_reminders_timeline_automation/migration.sql', 'utf8');
for (const marker of ['nextContactAt', 'stageEnteredAt', 'installationAt', 'installerEmployeeId', 'model Activity', 'model Reminder', 'model Notification']) assert.ok(schema.includes(marker), `schema marker ${marker}`);
for (const marker of ['CREATE TABLE "Activity"', 'CREATE TABLE "Reminder"', 'CREATE TABLE "Notification"', 'automationKey']) assert.ok(migration.includes(marker), `migration marker ${marker}`);

  console.log('CRM feature smoke tests passed: customer flags, reminder create/complete, note activity, schema/migration markers');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
