import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { customerDto } from '../src/common/mappers';
import { ActivitiesService } from '../src/activities/activities.service';
import { RemindersService } from '../src/reminders/reminders.service';
import { CustomersService } from '../src/customers/customers.service';
import { EmployeesService } from '../src/employees/employees.service';
import { UsersService } from '../src/users/users.service';
import { GroupsService } from '../src/groups/groups.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { TasksService } from '../src/tasks/tasks.service';
import { customerScopeWhere, isPartner } from '../src/common/access';
import { SupportService } from '../src/common/support.service';

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

const creatorRecord = customerDto({
  ...customer,
  createdById: 'employee-1',
  createdBy: { id: 'employee-1', name: 'Abdulaziz', avatarUrl: null },
});
assert.equal(creatorRecord.createdBy.name, 'Abdulaziz', 'creator relation is exposed to an allowed viewer');
assert.equal('createdBy' in customerDto({ ...customer, createdById: 'employee-1', createdBy: { id: 'employee-1', name: 'Abdulaziz' } }, { hideCreator: true }), false, 'creator is hidden when the viewer lacks permission');

let summaryQuery: any;
const summaryService = new CustomersService({
  activity: {
    findMany: async (args: any) => {
      summaryQuery = args;
      return [{ id: 'call-1', customerId: 'customer-1', type: 'CALL', message: 'Qo\'ng\'iroq', createdAt: now, createdBy: { id: 'employee-2', name: 'Shuxrat', avatarUrl: null } }];
    },
  },
} as any);
const summarized = await (summaryService as any).attachActivitySummaries([{ id: 'customer-1' }]);
assert.ok(summaryQuery.where.type.in.includes('REMINDER_COMPLETED'), 'last-contact query includes completed reminders');
assert.equal(summarized[0].lastContact.createdBy.name, 'Shuxrat', 'last-contact summary includes the acting employee');
const mappedLastContact = customerDto(summarized[0], { hideActivitySummary: false });
assert.equal(mappedLastContact.lastContact.user.name, 'Shuxrat', 'last-contact mapper exposes the acting employee');
assert.equal(customerDto(summarized[0], { hideLastContact: true }).lastContact, null, 'last-contact summary respects activity visibility');

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
    partnerRewards: [{ groupId: 'group-1', amount: 100 }],
  },
  { partner: true, partnerGroupId: 'group-1' },
);
assert.deepEqual(
  Object.keys(partnerCustomer).sort(),
  ['id', 'name', 'phone', 'stage', 'stageId', 'stageLabel', 'isCompleted', 'isInstalled', 'rewardAmount'].sort(),
  'partner response is minimal',
);
assert.equal(partnerCustomer.isInstalled, true, 'partner installation status');
assert.equal(partnerCustomer.rewardAmount, 100, 'partner card shows own reward amount');
assert.equal('amount' in partnerCustomer, false, 'partner cannot see sales amount');
assert.equal('assignedEmployee' in partnerCustomer, false, 'partner cannot see assignee');
assert.equal(isPartner({ role: 'EMPLOYEE', partnerGroupId: 'group-1' }), false, 'employee with a legacy group is not a partner');
assert.equal(isPartner({ role: 'PARTNER', partnerGroupId: 'group-1' }), true, 'explicit partner role is required');
const employeeScope = customerScopeWhere({ role: 'EMPLOYEE', customerVisibility: 'GROUPS', allowedGroupIds: ['group-1'] });
assert.deepEqual(employeeScope.groups, { some: { id: { in: ['group-1'] } } }, 'employee group scope is enforced');
const hiddenEmployeeCustomer = customerDto(
  { id: 'employee-customer-1', name: 'Scoped client', phone: '+998901234567', amount: 100, depositAmount: 20, stageId: 'NEW', stage: { id: 'NEW', label: 'Yangi', isFinal: false }, groups: [], createdAt: now, updatedAt: now },
  { fieldVisibility: { phone: true, amount: false, deposit: false } },
);
assert.equal('amount' in hiddenEmployeeCustomer, false, 'employee amount field is removed from DTO');
assert.equal('depositAmount' in hiddenEmployeeCustomer, false, 'employee deposit field is removed from DTO');
const hiddenFinancialCustomer = customerDto(
  { ...customer, amount: 100, depositAmount: 20, currencyId: 'currency-uzs', currency: { id: 'currency-uzs', code: 'UZS', symbol: "so'm" } },
  { fieldVisibility: { financial: false, amount: true, deposit: true } },
);
assert.equal('amount' in hiddenFinancialCustomer, false, 'financial master permission removes amount');
assert.equal('depositAmount' in hiddenFinancialCustomer, false, 'financial master permission removes deposit');
assert.equal('currency' in hiddenFinancialCustomer, false, 'financial master permission removes currency');

let customerOptionsWhere: any;
const supportService = new SupportService({
  customer: {
    findMany: async ({ where }: any) => {
      customerOptionsWhere = where;
      return [{ stageId: 'NEW', amount: 250, currency: { id: 'currency-uzs', code: 'UZS', symbol: "so'm" }, address: null, service: null, programs: [] }];
    },
  },
  stage: { findMany: async () => [{ id: 'NEW', label: 'Yangi' }] },
} as any);
const scopedOptions = await supportService.customerOptions({ role: 'EMPLOYEE', customerVisibility: 'GROUPS', allowedGroupIds: ['group-1'], permissions: [] });
assert.deepEqual(customerOptionsWhere.AND[1].groups, { some: { id: { in: ['group-1'] } } }, 'customer options use employee group scope');
assert.equal('stageTotals' in scopedOptions, false, 'pipeline totals are omitted without the dedicated permission');
const permittedOptions = await supportService.customerOptions({ role: 'EMPLOYEE', customerVisibility: 'GROUPS', allowedGroupIds: ['group-1'], permissions: ['customers.viewPipelineTotal'] });
assert.equal(permittedOptions.stageTotals.NEW[0].amount, 250, 'pipeline totals are returned only with the dedicated permission');
const masterFinancialOptions = await supportService.customerOptions({ role: 'EMPLOYEE', customerVisibility: 'GROUPS', allowedGroupIds: ['group-1'], permissions: ['customers.viewFinancials'] });
assert.equal(masterFinancialOptions.stageTotals.NEW[0].amount, 250, 'financial master permission exposes pipeline total');

const employeeService = new EmployeesService({} as any);
const adminActor = { id: 'admin-1', role: 'ADMIN' };
await assert.rejects(() => employeeService.create({ name: 'Xodim', phone: '901234567', username: 'xodim', password: 'secret1' }, adminActor), /Telefon raqami/);
await assert.rejects(() => employeeService.create({ name: 'Xodim', phone: '+998901234567', username: 'x', password: 'secret1' }, adminActor), /Login kamida/);
await assert.rejects(() => employeeService.create({ name: 'Xodim', phone: '+998901234567', username: 'xodim', password: 'secret1' }, { id: 'employee-1', role: 'EMPLOYEE' }), /faqat admin/);
await assert.rejects(() => employeeService.updateCredentials('employee-1', { username: 'new-login' }, { id: 'employee-1', role: 'EMPLOYEE' }), /faqat admin/);
await assert.rejects(() => new UsersService({} as any).updateMyLogin({ id: 'employee-1', role: 'EMPLOYEE' }, 'new-login'), /faqat admin/);

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
const adminCustomerActivityPayloads: any[] = [];
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
  activity: { create: async ({ data }: any) => { adminCustomerActivityPayloads.push(data); return data; } },
  task: { create: async () => ({ id: 'automation-task-1' }) },
} as any);
await adminCustomerService.create({ name: 'Admin client', groupId: 'group-1', depositAmount: 2500, createdById: 'forged-user-id' }, { id: 'admin-1', name: 'Admin', role: 'ADMIN', partnerGroupId: 'stale-partner-group', permissions: [] });
assert.deepEqual(adminCustomerCreatePayload.groups, { connect: [{ id: 'group-1' }] }, 'admin can assign a customer to any group');
assert.equal(Number(adminCustomerCreatePayload.depositAmount), 2500, 'deposit amount is persisted through the existing field');
assert.equal(adminCustomerCreatePayload.createdById, 'admin-1', 'customer creator is taken from the authenticated actor');
assert.equal(adminCustomerActivityPayloads.find((item) => item.type === 'CUSTOMER_CREATED')?.metadata.createdById, 'admin-1', 'creation activity stores creator id');
assert.equal(adminCustomerActivityPayloads.find((item) => item.type === 'CUSTOMER_CREATED')?.metadata.createdByName, 'Admin', 'creation activity stores creator name snapshot');
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
const reminderActor = { id: 'employee-1', role: 'EMPLOYEE', permissions: ['calls.create', 'calls.view'] };
await reminderService.create({ customerId: 'customer-1', remindAt: todayAtThree.toISOString(), type: 'CALL' }, reminderActor);
assert.equal(reminderCreatePayload.customerId, 'customer-1', 'reminder customer link');
assert.equal(reminderCreatePayload.assignedUserId, 'employee-1', 'reminder ownership');
assert.equal(customerUpdatePayload.nextContactAt.getTime(), todayAtThree.getTime(), 'nextContactAt persisted');
assert.equal(activityPayload.type, 'REMINDER_CREATED', 'reminder timeline activity');

const completed = await reminderService.complete('reminder-1', reminderActor);
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

let deletedGroupId: string | undefined;
const deleteGroupsService = new GroupsService({
  customerGroup: {
    findUnique: async () => ({ id: 'delete-group-1', name: 'Test group' }),
    delete: async ({ where }: any) => { deletedGroupId = where.id; return { id: where.id }; },
  },
} as any);
assert.deepEqual(await deleteGroupsService.remove('delete-group-1', { role: 'ADMIN' }), { ok: true }, 'admin can delete a group');
assert.equal(deletedGroupId, 'delete-group-1', 'group delete reaches Prisma');
await assert.rejects(
  () => deleteGroupsService.remove('delete-group-1', { role: 'EMPLOYEE', permissions: ['customers.delete'] }),
  /Guruhni faqat admin/,
  'employee cannot delete a group even with a forged permission',
);

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
const customSummary = await groupsService.partnerSummary('group-1', { from: '2026-08-01', to: '2026-08-31' }, { id: 'partner-1', role: 'PARTNER', partnerGroupId: 'group-1' });
assert.equal(customSummary.period, '2026-08-01..2026-08-31', 'partner custom date range is accepted');

const rewardUpserts: any[] = [];
const rewardService = new CustomersService({
  customer: { findUnique: async () => ({ id: 'reward-customer', stageId: 'PAID', stage: { id: 'PAID', isFinal: false }, groups: [{ id: 'group-1', rewardStageId: 'PAID', partnerRewardPerCustomer: 100 }] }) },
  customerStageHistory: { findFirst: async () => null },
  partnerReward: { upsert: async (args: any) => { rewardUpserts.push(args); return args; } },
} as any);
await (rewardService as any).syncPartnerReward('reward-customer', now);
assert.equal(rewardUpserts.length, 1, 'configured reward stage creates one reward transaction');
assert.deepEqual(rewardUpserts[0].where.groupId_customerId, { groupId: 'group-1', customerId: 'reward-customer' }, 'reward transaction has a database unique key');

const finalHistoryRewardUpserts: any[] = [];
const finalHistoryRewardService = new CustomersService({
  customer: { findUnique: async () => ({ id: 'returned-customer', stageId: 'PAID', stage: { id: 'PAID', isFinal: false }, groups: [{ id: 'group-1', rewardStageId: 'PAID', partnerRewardPerCustomer: 100 }] }) },
  customerStageHistory: { findFirst: async () => ({ id: 'completed-transition' }) },
  partnerReward: { upsert: async (args: any) => { finalHistoryRewardUpserts.push(args); return args; } },
} as any);
await (finalHistoryRewardService as any).syncPartnerReward('returned-customer', now);
assert.equal(finalHistoryRewardUpserts.length, 0, 'a customer with prior final history cannot earn a new reward');
await (rewardService as any).syncPartnerReward('reward-customer', now, true);
assert.equal(rewardUpserts.length, 1, 'moving back from a final stage never creates a duplicate reward');

const employeeCreateService = new CustomersService({} as any);
assert.deepEqual(await (employeeCreateService as any).resolveCreateGroupIds({ currentGroupId: 'group-1' }, { role: 'EMPLOYEE', customerVisibility: 'GROUPS', allowedGroupIds: ['group-1'] }), ['group-1'], 'employee create auto-assigns current group');
await assert.rejects(() => (employeeCreateService as any).resolveCreateGroupIds({ groupId: 'other-group' }, { role: 'EMPLOYEE', customerVisibility: 'GROUPS', allowedGroupIds: ['group-1'] }), /ruxsat berilgan guruh/);
const quickActionCalls: any[] = [];
const quickActionService = new CustomersService({
  reminder: {
    updateMany: async () => ({ count: 0 }),
    create: async ({ data }: any) => { quickActionCalls.push({ kind: 'reminder', data }); return { id: 'quick-reminder-1', ...data }; },
  },
  customer: { update: async ({ data }: any) => { quickActionCalls.push({ kind: 'customer', data }); return data; } },
  task: { create: async ({ data }: any) => { quickActionCalls.push({ kind: 'task', data }); return { id: 'quick-task-1', ...data }; } },
  activity: { create: async ({ data }: any) => { quickActionCalls.push({ kind: 'activity', data }); return data; } },
} as any);
await (quickActionService as any).persistQuickActions(
  { id: 'customer-quick', name: 'Quick client', assignedEmployeeId: 'employee-1' },
  [
    { type: 'CALL', remindAt: todayAtThree.toISOString(), note: 'Qo\'ng\'iroq' },
    { type: 'REMINDER', remindAt: todayAtThree.toISOString(), note: 'Keyingi sotuv' },
    { type: 'TASK', title: 'Hujjat yuborish', dueDate: '2026-08-21', note: 'Email orqali' },
    { type: 'NOTE', text: 'Mijoz bilan kelishildi' },
  ],
  { id: 'employee-1', role: 'EMPLOYEE', permissions: ['calls.create', 'reminders.create', 'tasks.create', 'comments.create'] },
);
assert.equal(quickActionCalls.filter((item) => item.kind === 'reminder').length, 2, 'create flow persists call and reminder actions');
assert.equal(quickActionCalls.filter((item) => item.kind === 'task').length, 1, 'create flow persists task action');
assert.equal(quickActionCalls.filter((item) => item.kind === 'activity').length >= 3, true, 'create flow persists task and note timeline activities');

let activityCreatePayload: any;
const activityPrisma: any = {
  customer: { findFirst: async () => ({ id: 'customer-1' }) },
  activity: {
    create: async ({ data }: any) => { activityCreatePayload = data; return { id: 'activity-1', ...data, createdAt: now, createdBy: { id: 'employee-1', name: 'Sardor' } }; },
  },
};
const activities = new ActivitiesService(activityPrisma);
await activities.create({ customerId: 'customer-1', type: 'NOTE', title: 'Izoh', description: 'Narxni kelishadi' }, { id: 'employee-1', role: 'EMPLOYEE', permissions: ['comments.create'] });
assert.equal(activityCreatePayload.type, 'NOTE', 'note activity type');
assert.equal(activityCreatePayload.message, 'Izoh: Narxni kelishadi', 'note timeline message');

const schema = readFileSync('prisma/schema.prisma', 'utf8');
const seed = readFileSync('prisma/seed.ts', 'utf8');
const migration = readFileSync('prisma/migrations/20260818150000_reminders_timeline_automation/migration.sql', 'utf8');
const rewardMigration = readFileSync('prisma/migrations/20260818190000_partner_reward_once_per_customer/migration.sql', 'utf8');
const notificationMigration = readFileSync('prisma/migrations/20260818200000_notification_contract/migration.sql', 'utf8');
const permissionCurrencyMigration = readFileSync('prisma/migrations/20260819100000_permissions_currency_comments/migration.sql', 'utf8');
const scopeMigration = readFileSync('prisma/migrations/20260820150000_partner_employee_scope_reward_trigger/migration.sql', 'utf8');
const historyMigration = readFileSync('prisma/migrations/20260820160000_customer_stage_history_and_pipeline_total_permission/migration.sql', 'utf8');
const createdByMigration = readFileSync('prisma/migrations/20260821110000_customer_created_by/migration.sql', 'utf8');
for (const marker of ['nextContactAt', 'stageEnteredAt', 'installationAt', 'installerEmployeeId', 'model Activity', 'model Reminder', 'model Currency', 'currencyId', 'note', 'model Notification', '@@unique([groupId, customerId])', 'isRead', 'readAt', 'PARTNER', 'EmployeeCustomerVisibility', 'customerVisibility', 'rewardStageId', 'model UserAllowedGroup']) assert.ok(schema.includes(marker), `schema marker ${marker}`);
assert.ok(seed.includes('CUSTOMER_GROUP_SEED_KEY'), 'customer groups use a one-time seed marker');
assert.equal(seed.includes('customerGroup.upsert'), false, 'customer groups are not re-upserted by seed');
for (const marker of ['CREATE TABLE "Activity"', 'CREATE TABLE "Reminder"', 'CREATE TABLE "Notification"', 'automationKey']) assert.ok(migration.includes(marker), `migration marker ${marker}`);
for (const marker of ['DROP INDEX "PartnerReward_groupId_customerId_period_key"', 'PartnerReward_groupId_customerId_key']) assert.ok(rewardMigration.includes(marker), `reward migration marker ${marker}`);
for (const marker of ['RENAME COLUMN "read" TO "isRead"', 'ADD COLUMN "readAt"', 'Notification_userId_isRead_createdAt_idx']) assert.ok(notificationMigration.includes(marker), `notification migration marker ${marker}`);
for (const marker of ['CREATE TABLE "Currency"', 'ADD COLUMN "currencyId"', 'ADD COLUMN "note"', 'currency-uzs']) assert.ok(permissionCurrencyMigration.includes(marker), `permission/currency migration marker ${marker}`);
for (const marker of ['EmployeeCustomerVisibility', 'UserAllowedGroup', 'rewardStageId']) assert.ok(scopeMigration.includes(marker), `partner/employee migration marker ${marker}`);
for (const marker of ['CustomerStageHistory', 'fromIsFinal', 'toIsFinal', 'customers.viewPipelineTotal', 'CREATE INDEX']) assert.ok(historyMigration.includes(marker), `stage history/permission migration marker ${marker}`);
for (const marker of ['createdById', 'ADD COLUMN "createdById"', 'ON DELETE SET NULL']) {
  assert.ok(schema.includes(marker) || createdByMigration.includes(marker), `creator migration marker ${marker}`);
}

  console.log('CRM feature smoke tests passed: admin/partner scope, group assignment, reward, tasks, notifications, reminders, activities, schema/migrations');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
