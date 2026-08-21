import { Prisma } from '@prisma/client';
import { isPartner } from './access';

export const STAGE_STALE_DAYS = Number(process.env.STAGE_STALE_DAYS || 7);

export function toNumber(value: any) {
  if (value == null) return 0;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return value.toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function publicUser(user: any, options: { exposePermissions?: boolean } = {}) {
  if (!user) return null;
  const partner = isPartner(user);
  const login = user.username || user.login || user.email || user.phone || null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: login,
    login,
    phone: user.phone,
    role: user.role,
    permissions: partner && !options.exposePermissions ? ['customers.view'] : user.permissions || [],
    status: user.status,
    isActive: user.isActive !== false,
    avatarUrl: user.avatarUrl,
    isPartner: partner,
    partnerGroupId: user.partnerGroupId || null,
    partnerGroup: user.partnerGroup ? { id: user.partnerGroup.id, name: user.partnerGroup.name } : null,
    customerVisibility: user.customerVisibility || 'ASSIGNED',
    allowedGroupIds: Array.isArray(user.allowedGroupIds)
      ? user.allowedGroupIds
      : Array.isArray(user.allowedGroups)
        ? user.allowedGroups.map((item: any) => item.groupId || item.group?.id).filter(Boolean)
        : [],
    allowedGroups: Array.isArray(user.allowedGroups)
      ? user.allowedGroups.map((item: any) => item.group || { id: item.groupId, name: item.groupName }).filter((item: any) => item?.id)
      : [],
    team: user.team ? { id: user.team.id, name: user.team.name } : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function customerDto(customer: any, options: { partner?: boolean; partnerGroupId?: string; hideInternalNotes?: boolean; hideFollowUps?: boolean; hideActivitySummary?: boolean; hideLastContact?: boolean; hideCreator?: boolean; fieldVisibility?: { phone?: boolean; amount?: boolean; deposit?: boolean; financial?: boolean } } = {}): any {
  if (!customer) return null;
  const now = Date.now();
  const stageEnteredAt = customer.stageEnteredAt || customer.updatedAt || customer.createdAt;
  const stageDurationDays = stageEnteredAt ? Math.max(0, Math.floor((now - new Date(stageEnteredAt).getTime()) / 86400000)) : 0;
  const nextContactAt = customer.nextContactAt || null;
  const nextContactTime = nextContactAt ? new Date(nextContactAt).getTime() : null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const tomorrowStart = todayStart + 86400000;
  const latestNote = customer.activities?.[0] || (customer.note || customer.notes ? { id: null, message: customer.note || customer.notes, createdAt: customer.updatedAt || customer.createdAt, createdBy: null } : null);
  const groups = customer.groups || [];
  const linkedBusinessTypes = Array.isArray(customer.businessTypeLinks) && customer.businessTypeLinks.length
    ? customer.businessTypeLinks.map((link: any) => link.businessType).filter(Boolean)
    : customer.businessType ? [customer.businessType] : [];
  const primaryBusinessType = linkedBusinessTypes[0] || customer.businessType || null;
  const showAmount = options.fieldVisibility?.financial !== false && options.fieldVisibility?.amount !== false;
  const showDeposit = options.fieldVisibility?.financial !== false && options.fieldVisibility?.deposit !== false;
  if (options.partner) {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      stage: customer.stageId,
      stageId: customer.stageId,
      stageLabel: customer.stage?.label || customer.stageId,
      isCompleted: Boolean(customer.stage?.isFinal),
      isInstalled: Boolean(customer.stage?.isFinal),
      rewardAmount: (customer.partnerRewards || [])
        .filter((reward: any) => !options.partnerGroupId || reward.groupId === options.partnerGroupId)
        .reduce((sum: number, reward: any) => sum + toNumber(reward.amount), 0),
    };
  }
  return {
    id: customer.id,
    name: customer.name,
    firstName: customer.firstName,
    lastName: customer.lastName,
    ...(options.fieldVisibility?.phone === false ? {} : { phone: customer.phone }),
    phone2: customer.phone2,
    telegram: customer.telegram,
    email: customer.email,
    service: customer.service,
    ...(showAmount ? { amount: toNumber(customer.amount) } : {}),
    ...(showDeposit ? { depositAmount: customer.depositAmount == null ? null : toNumber(customer.depositAmount) } : {}),
    ...(showAmount ? { currencyId: customer.currencyId || customer.currency?.id || null } : {}),
    ...(showAmount ? { currency: customer.currency ? { id: customer.currency.id, code: customer.currency.code, name: customer.currency.name, symbol: customer.currency.symbol } : null } : {}),
    businessTypeIds: linkedBusinessTypes.map((item: any) => item.id),
    businessTypes: linkedBusinessTypes.map((item: any) => ({ id: item.id, name: item.name, isActive: item.isActive })),
    // Keep the old scalar fields in the response for existing clients.
    businessTypeId: customer.businessTypeId || primaryBusinessType?.id || null,
    businessType: primaryBusinessType ? { id: primaryBusinessType.id, name: primaryBusinessType.name, isActive: primaryBusinessType.isActive } : null,
    notes: options.hideInternalNotes ? null : customer.notes,
    note: options.hideInternalNotes ? null : customer.note,
    address: customer.address ?? null,
    latitude: customer.latitude,
    longitude: customer.longitude,
    birthDate: customer.birthDate,
    telegramUsername: customer.telegramUsername,
    instagram: customer.instagram,
    source: customer.source,
    customFields: customer.customFields || {},
    programs: Array.isArray(customer.programs) ? customer.programs : [],
    status: customer.status,
    stage: customer.stageId,
    stageId: customer.stageId,
    stageLabel: customer.stage?.label || customer.stageId,
    isCompleted: Boolean(customer.stage?.isFinal),
    pipelineId: customer.pipelineId,
    assignedEmployeeId: customer.assignedEmployeeId,
    assignedEmployee: publicUser(customer.assignedEmployee),
    ...(options.hideCreator ? {} : {
      createdById: customer.createdById || null,
      createdBy: customer.createdBy ? {
        id: customer.createdBy.id,
        name: customer.createdBy.name,
        avatarUrl: customer.createdBy.avatarUrl || null,
      } : null,
    }),
    nextContactAt,
    lastContactAt: customer.lastContactAt || null,
    lastContactVisible: !options.hideLastContact,
    lastContact: !options.hideLastContact && customer.lastContact
      ? {
          at: customer.lastContact.createdAt,
          type: customer.lastContact.type,
          user: customer.lastContact.createdBy
            ? {
                id: customer.lastContact.createdBy.id,
                name: customer.lastContact.createdBy.name,
                avatarUrl: customer.lastContact.createdBy.avatarUrl || null,
              }
            : null,
        }
      : null,
    isFollowUpToday: nextContactTime != null && nextContactTime >= todayStart && nextContactTime < tomorrowStart,
    isFollowUpOverdue: nextContactTime != null && nextContactTime < now,
    stageEnteredAt,
    stageDurationDays,
    isStageStale: stageDurationDays >= STAGE_STALE_DAYS,
    installationAt: customer.installationAt || null,
    installerEmployeeId: customer.installerEmployeeId || null,
    installerEmployee: publicUser(customer.installerEmployee),
    latestNote: options.hideInternalNotes ? null : latestNote ? { id: latestNote.id, message: latestNote.message, createdAt: latestNote.createdAt, createdBy: publicUser(latestNote.createdBy) } : null,
    latestActivity: options.hideActivitySummary || (options.hideInternalNotes && customer.latestActivity?.type === 'NOTE')
      ? null
      : customer.latestActivity
        ? { id: customer.latestActivity.id, type: customer.latestActivity.type, message: customer.latestActivity.message, createdAt: customer.latestActivity.createdAt }
        : null,
    nextReminder: !options.hideFollowUps && customer.reminders?.[0]
      ? {
          id: customer.reminders[0].id,
          type: customer.reminders[0].type,
          title: customer.reminders[0].title,
          note: customer.reminders[0].note || null,
          remindAt: customer.reminders[0].remindAt,
          status: customer.reminders[0].status,
        }
      : null,
    nextAction: !options.hideFollowUps && customer.reminders?.[0]
      ? { type: 'REMINDER', at: customer.reminders[0].remindAt, title: customer.reminders[0].title, note: customer.reminders[0].note || null }
      : nextContactAt
        ? { type: 'FOLLOW_UP', at: nextContactAt }
        : null,
    groupIds: groups.map((g: any) => g.id),
    groups,
    business: customer.businesses?.[0] ? businessDto(customer.businesses[0]) : null,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export function businessDto(business: any) {
  if (!business) return null;
  return {
    ...business,
    customer: business.customer ? { id: business.customer.id, name: business.customer.name } : null,
    assignedEmployee: business.assignedEmployee,
  };
}

export function leadDto(lead: any, options: { hideFinancials?: boolean } = {}) {
  if (!lead) return null;
  const { expectedValue, ...safeLead } = lead;
  return {
    ...safeLead,
    ...(options.hideFinancials ? {} : { expectedValue: toNumber(expectedValue) }),
    customer: lead.customer ? { id: lead.customer.id, name: lead.customer.name } : null,
    business: lead.business ? { id: lead.business.id, name: lead.business.name } : null,
    assignedEmployee: lead.assignedEmployeeId ? { id: lead.assignedEmployeeId } : null,
  };
}

export function dealDto(deal: any, options: { hideFinancials?: boolean } = {}) {
  if (!deal) return null;
  const { value, ...safeDeal } = deal;
  return {
    ...safeDeal,
    ...(options.hideFinancials ? {} : { value: toNumber(value) }),
    customer: deal.customer ? { id: deal.customer.id, name: deal.customer.name } : null,
    business: deal.business ? { id: deal.business.id, name: deal.business.name } : null,
    salesEmployee: publicUser(deal.salesEmployee),
  };
}

export function dealItemDto(item: any, options: { hideFinancials?: boolean } = {}) {
  const { unitPrice, discount, total, ...safeItem } = item;
  return {
    ...safeItem,
    ...(options.hideFinancials ? {} : { unitPrice: toNumber(unitPrice), discount: toNumber(discount), total: toNumber(total) }),
  };
}

export function paymentDto(payment: any, options: { hideFinancials?: boolean } = {}) {
  const { amount, ...safePayment } = payment;
  return {
    ...safePayment,
    ...(options.hideFinancials ? {} : { amount: toNumber(amount) }),
    deal: payment.deal ? dealDto(payment.deal, options) : null,
    customer: payment.customer ? { id: payment.customer.id, name: payment.customer.name } : null,
    business: payment.business ? { id: payment.business.id, name: payment.business.name } : null,
    employee: publicUser(payment.employee),
  };
}

export function installationDto(item: any, options: { hideFinancials?: boolean } = {}) {
  return {
    ...item,
    deal: item.deal ? dealDto(item.deal, options) : null,
    customer: item.customer ? { id: item.customer.id, name: item.customer.name } : null,
    business: item.business ? { id: item.business.id, name: item.business.name } : null,
    assignedEmployee: publicUser(item.assignedEmployee),
  };
}

export function taskDto(task: any) {
  return {
    ...task,
    assignedEmployeeId: task.assignedToId || task.assignedEmployeeId,
    assignedEmployee: publicUser(task.assignedTo),
    createdBy: publicUser(task.createdBy),
    customer: task.customer ? { id: task.customer.id, name: task.customer.name } : null,
    deal: task.deal ? { id: task.deal.id, name: task.deal.name } : null,
  };
}

export function uniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
