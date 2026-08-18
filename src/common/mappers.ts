import { Prisma } from '@prisma/client';

export const STAGE_STALE_DAYS = Number(process.env.STAGE_STALE_DAYS || 7);

export function toNumber(value: any) {
  if (value == null) return 0;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return value.toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function publicUser(user: any) {
  if (!user) return null;
  const isPartner = Boolean(user.partnerGroupId) && !['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    phone: user.phone,
    role: user.role,
    permissions: isPartner ? ['customers.view'] : user.permissions || [],
    status: user.status,
    isActive: user.isActive !== false,
    avatarUrl: user.avatarUrl,
    isPartner,
    partnerGroupId: user.partnerGroupId || null,
    partnerGroup: user.partnerGroup ? { id: user.partnerGroup.id, name: user.partnerGroup.name } : null,
    team: user.team ? { id: user.team.id, name: user.team.name } : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function customerDto(customer: any, options: { partner?: boolean; partnerGroupId?: string } = {}) {
  if (!customer) return null;
  const now = Date.now();
  const stageEnteredAt = customer.stageEnteredAt || customer.updatedAt || customer.createdAt;
  const stageDurationDays = stageEnteredAt ? Math.max(0, Math.floor((now - new Date(stageEnteredAt).getTime()) / 86400000)) : 0;
  const nextContactAt = customer.nextContactAt || null;
  const nextContactTime = nextContactAt ? new Date(nextContactAt).getTime() : null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const tomorrowStart = todayStart + 86400000;
  const latestNote = customer.activities?.[0] || null;
  const groups = customer.groups || [];
  if (options.partner) {
    const partnerGroup = groups.find((group: any) => group.id === options.partnerGroupId) || groups[0];
    const partnerRewardAmount = customer.stage?.isFinal ? toNumber(partnerGroup?.partnerRewardPerCustomer) : 0;
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      stage: customer.stageId,
      stageId: customer.stageId,
      stageLabel: customer.stage?.label || customer.stageId,
      isCompleted: Boolean(customer.stage?.isFinal),
      status: customer.status,
      rewardAmount: partnerRewardAmount,
    };
  }
  return {
    id: customer.id,
    name: customer.name,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    phone2: customer.phone2,
    telegram: customer.telegram,
    email: customer.email,
    service: customer.service,
    amount: toNumber(customer.amount),
    depositAmount: customer.depositAmount == null ? null : toNumber(customer.depositAmount),
    notes: customer.notes,
    note: customer.note,
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
    nextContactAt,
    lastContactAt: customer.lastContactAt || null,
    isFollowUpToday: nextContactTime != null && nextContactTime >= todayStart && nextContactTime < tomorrowStart,
    isFollowUpOverdue: nextContactTime != null && nextContactTime < now,
    stageEnteredAt,
    stageDurationDays,
    isStageStale: stageDurationDays >= STAGE_STALE_DAYS,
    installationAt: customer.installationAt || null,
    installerEmployeeId: customer.installerEmployeeId || null,
    installerEmployee: publicUser(customer.installerEmployee),
    latestNote: latestNote ? { id: latestNote.id, message: latestNote.message, createdAt: latestNote.createdAt, createdBy: publicUser(latestNote.createdBy) } : null,
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

export function leadDto(lead: any) {
  if (!lead) return null;
  return {
    ...lead,
    expectedValue: toNumber(lead.expectedValue),
    customer: lead.customer ? { id: lead.customer.id, name: lead.customer.name } : null,
    business: lead.business ? { id: lead.business.id, name: lead.business.name } : null,
    assignedEmployee: lead.assignedEmployeeId ? { id: lead.assignedEmployeeId } : null,
  };
}

export function dealDto(deal: any) {
  if (!deal) return null;
  return {
    ...deal,
    value: toNumber(deal.value),
    customer: deal.customer ? { id: deal.customer.id, name: deal.customer.name } : null,
    business: deal.business ? { id: deal.business.id, name: deal.business.name } : null,
    salesEmployee: publicUser(deal.salesEmployee),
  };
}

export function dealItemDto(item: any) {
  return { ...item, unitPrice: toNumber(item.unitPrice), discount: toNumber(item.discount), total: toNumber(item.total) };
}

export function paymentDto(payment: any) {
  return {
    ...payment,
    amount: toNumber(payment.amount),
    deal: payment.deal ? { id: payment.deal.id, name: payment.deal.name } : null,
    customer: payment.customer || null,
    business: payment.business || null,
    employee: publicUser(payment.employee),
  };
}

export function installationDto(item: any) {
  return {
    ...item,
    deal: item.deal ? { id: item.deal.id, name: item.deal.name } : null,
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
