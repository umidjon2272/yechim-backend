import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { customerDto } from '../src/common/mappers';
import { ActivitiesService } from '../src/activities/activities.service';
import { RemindersService } from '../src/reminders/reminders.service';
import { CustomersService } from '../src/customers/customers.service';
import { EmployeesService } from '../src/employees/employees.service';
import { GroupsService } from '../src/groups/groups.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { TasksService } from '../src/tasks/tasks.service';

async function main() {
const now = new Date();
// Keep the fixture in the future so the smoke test is stable regardless of
// the hour at which CI runs it.
const todayAtThree = new Date(now.getTime() + 60 * 60 * 1000);
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
  ['id', 'name', 'phone', 'stage', 'stageId', 'stageLabel', 'isCompleted', 'isInstalled'].sort(),
  'partner response is minimal',
);
assert.equal(partnerCustomer.isInstalled, true, 'partner installation status');
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

let scopedCustomerWhere: any;
const scopedCustomerService = new CustomersService({
  customer: {
    findMany: async ({ where }: any) => { scopedCustomerWhere = where; return []; },
  },
} as any);
await scopedCustomerService.list({}, { id: 'partner-1', role: 'PARTNER', partnerGroupId: 'group-1' });
assert.deepEqual(scopedCustomerWhere.groups, { some: { id: 'group-1' } }, 'partner customer list is group-scoped');
await scopedCustomerService.list({ groupId: 'other-group' }, { id: 'admin-1', role: 'ADMIN' });
assert.deepEqual(scopedCustomerWhere.groups, { some: { id: 'other-group' } }, 'admin can choose any group filter');
await scopedCustomerService.list({ groupId: 'other-group' }, { id: 'admin-1', role: 'ADMIN', partnerGroupId: 'group-1' });
assert.deepEqual(scopedCustomerWhere.groups, { some: { id: 'other-group' } }, 'admin is never narrowed by a stale partner group');

let adminCustomerCreatePayload: any;
let adminCustomerUpdatePayload: any;
const adminCustomerRecord: any = {
  id: 'admin-customer-1', name: 'Admin client', phone: '+998901111111', stageId: 'NEW',
  stage: { id: 'NEW', label: 'Yangi', isFinal: false }, groups: [], activities: [],
  assignedEmployeeId: null, createdAt: now, updatedAt: now,
};
const adminCustomerService = new CustomersService({
  pipeline: { findFirstOrThrow: async () => ({ id: 'pipeline-1' }) },
  stage: { findUnique: async () => ({ id: 'NEW', label: 'Yangi', isFinal: false }), findMany: async () => [] },
  customer: {
    create: async ({ data }: any) => { adminCustomerCreatePayload = data; return adminCustomerRecord; },
    findFirst: async () => adminCustomerRecord,
    findUnique: async () => ({ ...adminCustomerRecord, groups: [], stage: { id: 'NEW', isFinal: false } }),
    update: async ({ data }: any) => { adminCustomerUpdatePayload = data; return { ...adminCustomerRecord, groups: [{ id: 'group-2' }] }; },
  },
  activity: { create: async ({ data }: any) => data },
  task: { create: async () => ({ id: 'automation-task-1' }) },
} as any);
await adminCustomerService.create({ name: 'Admin client', groupId: 'group-1' }, { id: 'admin-1', role: 'ADMIN', partnerGroupId: 'stale-partner-group', permissions: [] });
assert.deepEqual(adminCustomerCreatePayload.groups, { connect: [{ id: 'group-1' }] }, 'admin can assign a customer to any group');
await adminCustomerService.update('admin-customer-1', { groupIds: ['group-2'] }, { id: 'admin-1', role: 'ADMIN', partnerGroupId: 'stale-partner-group', permissions: [] });
assert.deepEqual(adminCustomerUpdatePayload.groups, { set: [{ id: 'group-2' }] }, 'admin can change the customer group relation');

let reminderCreatePayload: any;
let customerUpdatePayload: any;
let activityPayload: any;
let reminderNotificationPayload: any;
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
  notification: { upsert: async (args: any) => { reminderNotificationPayload = args; return null; } },
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

const overdueReminder = { ...reminderRecord, remindAt: yesterday, customer: { id: 'customer-1', name: 'Ali Valiyev' } };
reminderPrisma.reminder.findMany = async () => [overdueReminder];
await reminderService.ensureDueNotifications({ id: 'employee-1', role: 'EMPLOYEE', permissions: [] });
assert.equal(reminderNotificationPayload.create.type, 'reminder_overdue', 'past reminder gets overdue notification');
assert.equal(reminderNotificationPayload.create.entityType, 'customer', 'reminder notification links customer');
assert.equal(reminderNotificationPayload.create.entityId, 'customer-1', 'reminder notification has customer id');

const taskNotifications: any[] = [];
const taskDueDate = new Date(now.getTime() + 2 * 3600000).toISOString();
const taskRecord: any = {
  id: 'task-1', title: 'Ali mijozga qo\'ng\'iroq qilish', description: null, status: 'TODO', priority: 'MEDIUM',
  dueDate: taskDueDate, assignedToId: 'employee-1', assignedEmployeeId: 'employee-1', createdById: 'admin-1',
  assignedTo: { id: 'employee-1', name: 'Sardor', role: 'EMPLOYEE' }, createdBy: { id: 'admin-1', name: 'Admin', role: 'ADMIN' },
  customer: null, deal: null,
};
let deletedTaskId: string | undefined;
const taskPrisma: any = {
  user: { findFirst: async () => ({ id: 'employee-1' }) },
  task: {
    create: async ({ data }: any) => ({ ...taskRecord, ...data }),
    findUnique: async () => taskRecord,
    update: async ({ data }: any) => ({ ...taskRecord, ...data }),
    delete: async ({ where }: any) => {
      deletedTaskId = where.id;
      return { id: where.id };
    },
  },
  activity: { create: async () => null },
  notification: { create: async ({ data }: any) => { taskNotifications.push(data); return data; } },
};
const tasksService = new TasksService(taskPrisma);
const adminUser = { id: 'admin-1', role: 'ADMIN', permissions: [] };
await tasksService.create({ title: taskRecord.title, assignedToId: 'employee-1', dueDate: taskDueDate }, adminUser);
assert.equal(taskNotifications[0].userId, 'employee-1', 'assigned employee receives task notification');
assert.match(taskNotifications[0].message, /Deadline:/, 'task notification contains deadline');
assert.equal(taskNotifications[0].entityType, 'task', 'task notification links task');
const cancelledTask = await tasksService.cancel('task-1', adminUser);
assert.equal(cancelledTask.status, 'CANCELLED', 'admin can cancel task');
assert.equal(taskNotifications[1].title, 'Vazifa bekor qilindi', 'cancel notification is explicit');
await assert.rejects(
  () => tasksService.update('task-1', { status: 'CANCELLED' }, { id: 'employee-1', role: 'EMPLOYEE', permissions: ['tasks.edit'] }),
  /faqat admin/,
  'employees cannot cancel through the generic task update endpoint',
);
const deletedTask = await tasksService.remove('task-1', adminUser);
assert.deepEqual(deletedTask, { ok: true, id: 'task-1' }, 'admin can delete task');
assert.equal(deletedTaskId, 'task-1', 'delete uses the task id');
await assert.rejects(
  () => tasksService.remove('task-1', { id: 'employee-1', role: 'EMPLOYEE', permissions: ['tasks.delete'] }),
  /Vazifani faqat admin o'chira oladi/,
  'employee cannot delete task',
);

const notificationItem: any = {
  id: 'notification-1', userId: 'employee-1', type: 'task_assigned', title: 'Yangi vazifa', message: 'Ali mijozga qo\'ng\'iroq qilish',
  isRead: false, readAt: null, entityType: 'task', entityId: 'task-1', createdAt: now,
  reminder: null,
};
let notificationReadData: any;
let notificationReadAllData: any;
const notificationsService = new NotificationsService({
  notification: {
    findMany: async () => [notificationItem],
    count: async () => 1,
    findUnique: async () => notificationItem,
    update: async ({ data }: any) => { notificationReadData = data; return { ...notificationItem, ...data }; },
    updateMany: async ({ data }: any) => { notificationReadAllData = data; return { count: 1 }; },
  },
} as any, { ensureDueNotifications: async () => undefined } as any);
const notificationList = await notificationsService.list({ pageSize: 20 }, { id: 'employee-1', role: 'EMPLOYEE' });
assert.equal(notificationList.items[0].isRead, false, 'unread notification is returned');
await notificationsService.markRead('notification-1', { id: 'employee-1' });
assert.equal(notificationReadData.isRead, true, 'notification read action persists');
assert.ok(notificationReadData.readAt, 'notification read action stores readAt');
await notificationsService.markAllRead({ id: 'employee-1' });
assert.equal(notificationReadAllData.isRead, true, 'read-all action persists');

const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
const rewardRows = Array.from({ length: 30 }, (_, index) => ({
  id: `reward-${index + 1}`, groupId: 'group-1', customerId: `customer-${index + 1}`, period, amount: 100,
  completedAt: now, customer: { id: `customer-${index + 1}`, name: `Customer ${index + 1}`, phone: null, stageId: 'FINAL' },
}));
const groupsService = new GroupsService({
  customerGroup: { findUnique: async () => ({ id: 'group-1', name: 'Referral', partnerRewardPerCustomer: 100, partnerUsers: [] }) },
  customer: { count: async () => 30 },
  partnerReward: { findMany: async ({ select }: any) => select ? rewardRows.map(({ period, amount }) => ({ period, amount })) : rewardRows },
} as any);
const partnerSummary = await groupsService.partnerSummary('group-1', { period }, { id: 'partner-1', role: 'PARTNER', partnerGroupId: 'group-1' });
assert.equal(partnerSummary.completedCustomers, 30, 'partner summary counts completed customers');
assert.equal(partnerSummary.payableAmount, 3000, '30 completed customers at 100 equals 3000');
await assert.rejects(() => groupsService.partnerSummary('other-group', { period }, { id: 'partner-1', role: 'PARTNER', partnerGroupId: 'group-1' }), /Faqat/);

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
const rewardMigration = readFileSync('prisma/migrations/20260818190000_partner_reward_once_per_customer/migration.sql', 'utf8');
const notificationMigration = readFileSync('prisma/migrations/20260818200000_notification_contract/migration.sql', 'utf8');
for (const marker of ['nextContactAt', 'stageEnteredAt', 'installationAt', 'installerEmployeeId', 'model Activity', 'model Reminder', 'model Notification', '@@unique([groupId, customerId])', 'isRead', 'readAt']) assert.ok(schema.includes(marker), `schema marker ${marker}`);
for (const marker of ['CREATE TABLE "Activity"', 'CREATE TABLE "Reminder"', 'CREATE TABLE "Notification"', 'automationKey']) assert.ok(migration.includes(marker), `migration marker ${marker}`);
for (const marker of ['DROP INDEX "PartnerReward_groupId_customerId_period_key"', 'PartnerReward_groupId_customerId_key']) assert.ok(rewardMigration.includes(marker), `reward migration marker ${marker}`);
for (const marker of ['RENAME COLUMN "read" TO "isRead"', 'ADD COLUMN "readAt"', 'Notification_userId_isRead_createdAt_idx']) assert.ok(notificationMigration.includes(marker), `notification migration marker ${marker}`);

  console.log('CRM feature smoke tests passed: admin/partner scope, group assignment, reward, tasks, notifications, reminders, activities, schema/migrations');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
