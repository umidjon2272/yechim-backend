import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DEFAULT_PIPELINE_NAME } from '../common/defaults';
import { canViewAll, partnerGroupIdOf } from '../common/access';
import { customerDto, uniqueConflict } from '../common/mappers';
import { paged, pagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

const includeCustomer = {
  assignedEmployee: { include: { team: true } },
  installerEmployee: { include: { team: true } },
  groups: true,
  partnerRewards: true,
  currency: true,
  businesses: true,
  stage: true,
  activities: {
    where: { type: 'NOTE' },
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: { createdBy: { include: { team: true } } },
  },
} as const;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any, actor?: any) {
    const { page, pageSize } = pagination(query);
    const search = String(query.search || '').trim().toLowerCase();
    const baseWhere: any = { deletedAt: null };
    const partnerGroupId = this.partnerGroupId(actor);
    // A partner is scoped by the assigned group, never by employee ownership.
    // Applying both filters made group customers disappear unless they were
    // also assigned to the partner account.
    if (!this.canViewAll(actor) && !partnerGroupId) baseWhere.assignedEmployeeId = actor?.id;
    if (query.status) baseWhere.status = query.status;
    if (query.stage) baseWhere.stageId = query.stage;
    if (query.assignedEmployeeId && (this.canViewAll(actor) || query.assignedEmployeeId === actor?.id)) baseWhere.assignedEmployeeId = query.assignedEmployeeId;
    if (partnerGroupId) baseWhere.groups = { some: { id: partnerGroupId } };
    else if (query.groupId) baseWhere.groups = { some: { id: query.groupId } };
    if (query.createdFrom || query.createdTo) {
      baseWhere.createdAt = {};
      if (query.createdFrom) baseWhere.createdAt.gte = new Date(query.createdFrom);
      if (query.createdTo) baseWhere.createdAt.lte = new Date(`${query.createdTo}T23:59:59.999Z`);
    }
    let customers = await this.prisma.customer.findMany({ where: baseWhere, include: includeCustomer });
    if (search) {
      customers = customers.filter((c) => [c.name, c.phone, c.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(search)));
    }
    if (query.city) customers = customers.filter((c) => (c.address as any)?.city === query.city);
    if (query.program) customers = customers.filter((c) => c.service === query.program || (Array.isArray(c.programs) && c.programs.some((p: any) => p.name === query.program)));
    const sort = String(query.sort || '-createdAt');
    customers.sort((a: any, b: any) => {
      if (sort === 'nextContactAt') return this.contactOrder(a, b);
      if (sort === '-createdAt') {
        const contactOrder = this.contactOrder(a, b);
        if (contactOrder !== 0) return contactOrder;
      }
      const key = sort.replace('-', '');
      const av = key === 'name' ? a.name : new Date(a.createdAt).getTime();
      const bv = key === 'name' ? b.name : new Date(b.createdAt).getTime();
      return sort.startsWith('-') ? (av < bv ? 1 : -1) : av > bv ? 1 : -1;
    });
    const start = (page - 1) * pageSize;
    return paged(customers.slice(start, start + pageSize).map((customer) => this.dto(customer, actor)), customers.length, page, pageSize);
  }

  async get(id: string, actor?: any) {
    const partnerGroupId = this.partnerGroupId(actor);
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null, ...this.ownershipWhere(actor), ...(partnerGroupId ? { groups: { some: { id: partnerGroupId } } } : {}) },
      include: includeCustomer,
    });
    if (!customer) throw new NotFoundException('Mijoz topilmadi');
    return this.dto(customer, actor);
  }

  async create(body: any, actor?: any) {
    const pipeline = await this.defaultPipeline();
    const stageId = await this.resolveStageId(body.stageId ?? body.stage ?? 'NEW');
    const programs = this.normalizePrograms(body.programs);
    const scopedPartnerGroupId = this.partnerGroupId(actor);
    const requestedGroupIds = scopedPartnerGroupId ? [scopedPartnerGroupId] : this.normalizeGroupIds(body.groupIds, body.groupId);
    const currencyId = await this.resolveCurrencyId(body.currencyId, body.currencyCode);
    try {
      const customer = await this.prisma.customer.create({
        data: {
          name: body.name,
          firstName: body.firstName || null,
          lastName: body.lastName || null,
          phone: body.phone || null,
          phone2: body.phone2 || null,
          telegram: body.telegram || null,
          email: body.email || null,
          service: body.service || programs[0]?.name || null,
          amount: this.optionalNumber(body.amount) ?? 0,
          depositAmount: this.optionalNumber(body.depositAmount),
          currencyId,
          notes: body.notes || body.note || null,
          note: body.note || body.notes || null,
          address: body.address === undefined || body.address === null || body.address === '' ? Prisma.DbNull : body.address,
          latitude: this.optionalNumber(body.latitude),
          longitude: this.optionalNumber(body.longitude),
          birthDate: body.birthDate || null,
          telegramUsername: body.telegramUsername || null,
          instagram: body.instagram || null,
          source: body.source || null,
          customFields: body.customFields || {},
          programs,
          status: body.status || 'active',
          pipelineId: body.pipelineId || pipeline.id,
          stageId,
          assignedEmployeeId: this.canViewAll(actor) ? body.assignedEmployeeId || null : actor?.id || null,
          nextContactAt: body.nextContactAt ? this.toDate(body.nextContactAt) : null,
          stageEnteredAt: new Date(),
          installationAt: body.installationAt ? this.toDate(body.installationAt) : null,
          installerEmployeeId: body.installerEmployeeId || null,
          groups: requestedGroupIds.length > 0 ? { connect: requestedGroupIds.map((id) => ({ id })) } : undefined,
        },
        include: includeCustomer,
      });
      await this.createActivity(customer.id, 'CUSTOMER_CREATED', 'Mijoz yaratildi', actor?.id);
      await this.createStageAutomation(customer, stageId, actor);
      if (customer.nextContactAt) await this.scheduleReminder(customer, customer.nextContactAt, actor, body.reminderType || 'CALL', body.reminderNote ?? body.note ?? body.comment);
      await this.syncPartnerReward(customer.id, new Date());
      return this.dto(customer, actor);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Email yoki telefon allaqachon mavjud');
      throw error;
    }
  }

  async update(id: string, body: any, actor?: any) {
    const current: any = await this.get(id, actor);
    const requestedStage = body.stageId ?? body.stage;
    const nextStageId = requestedStage ? await this.resolveStageId(requestedStage) : undefined;
    const stageChanged = nextStageId && nextStageId !== current.stageId;
    if (!this.canViewAll(actor) && body.assignedEmployeeId !== undefined && body.assignedEmployeeId !== actor?.id && body.assignedEmployeeId !== '') {
      throw new ForbiddenException('Mijozni faqat ozingizga biriktirishingiz mumkin');
    }
    const data: any = {
      name: body.name,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone === undefined ? undefined : body.phone || null,
      phone2: body.phone2,
      telegram: body.telegram,
      email: body.email === undefined ? undefined : body.email || null,
      service: body.service,
      amount: body.amount == null ? undefined : this.optionalNumber(body.amount) ?? 0,
      depositAmount: body.depositAmount === undefined ? undefined : body.depositAmount === '' ? null : this.optionalNumber(body.depositAmount),
      currencyId: body.currencyId !== undefined || body.currencyCode !== undefined ? await this.resolveCurrencyId(body.currencyId, body.currencyCode) : undefined,
      notes: body.notes ?? body.note,
      note: body.note ?? body.notes,
      address: body.address === undefined ? undefined : body.address === null || body.address === '' ? Prisma.DbNull : body.address,
      latitude: body.latitude === undefined ? undefined : body.latitude === '' ? null : this.optionalNumber(body.latitude),
      longitude: body.longitude === undefined ? undefined : body.longitude === '' ? null : this.optionalNumber(body.longitude),
      birthDate: body.birthDate,
      telegramUsername: body.telegramUsername,
      instagram: body.instagram,
      source: body.source,
      customFields: body.customFields,
      programs: body.programs ? this.normalizePrograms(body.programs) : undefined,
      status: body.status,
      stageId: nextStageId,
      stageEnteredAt: stageChanged ? new Date() : undefined,
      assignedEmployeeId: body.assignedEmployeeId === '' ? null : body.assignedEmployeeId,
      nextContactAt: body.nextContactAt === undefined ? undefined : body.nextContactAt === null || body.nextContactAt === '' ? null : this.toDate(body.nextContactAt),
      installationAt: body.installationAt === undefined ? undefined : body.installationAt === null || body.installationAt === '' ? null : this.toDate(body.installationAt),
      installerEmployeeId: body.installerEmployeeId === undefined ? undefined : body.installerEmployeeId === '' ? null : body.installerEmployeeId,
      groups: Array.isArray(body.groupIds) || body.groupId !== undefined
        ? { set: this.normalizeGroupIds(body.groupIds, body.groupId).map((groupId) => ({ id: groupId })) }
        : undefined,
    };
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    try {
      const customer = await this.prisma.customer.update({ where: { id }, data, include: includeCustomer });
      if (stageChanged) {
        await this.createActivity(customer.id, 'STAGE_CHANGED', `Bosqich o'zgardi: ${current.stage?.label || current.stageId} → ${customer.stage?.label || customer.stageId}`, actor?.id);
        await this.createStageAutomation(customer, customer.stageId, actor);
      }
      if (current.assignedEmployeeId !== customer.assignedEmployeeId) await this.createActivity(customer.id, 'ASSIGNED_CHANGED', `Mas'ul xodim o'zgardi`, actor?.id);
      if (Array.isArray(body.groupIds) || body.groupId !== undefined) await this.createActivity(customer.id, 'GROUPS_CHANGED', 'Mijoz guruhlari o\'zgartirildi', actor?.id);
      if (body.amount !== undefined && Number(current.amount) !== Number(customer.amount)) await this.createActivity(customer.id, 'AMOUNT_CHANGED', `Summa o'zgardi: ${customer.amount}`, actor?.id);
      if (body.depositAmount !== undefined && Number(current.depositAmount || 0) !== Number(customer.depositAmount || 0)) await this.createActivity(customer.id, 'DEPOSIT_CHANGED', `Zaklad o'zgardi: ${customer.depositAmount || 0}`, actor?.id);
      if (body.nextContactAt !== undefined) {
        if (customer.nextContactAt) await this.scheduleReminder(customer, customer.nextContactAt, actor, body.reminderType || 'CALL', body.reminderNote ?? body.note ?? body.comment);
        else await this.cancelPendingReminders(customer.id);
      }
      if (body.installationAt !== undefined || body.installerEmployeeId !== undefined) await this.syncInstallation(customer, actor);
      if (stageChanged || body.stage || body.stageId) await this.syncPartnerReward(customer.id, new Date());
      return this.dto(customer, actor);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Email yoki telefon allaqachon mavjud');
      throw error;
    }
  }

  async softDelete(id: string, actor?: any) {
    await this.get(id, actor);
    const customer = await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date(), status: 'inactive' }, include: includeCustomer });
    return this.dto(customer, actor);
  }

  async deactivate(id: string, actor?: any) {
    const current: any = await this.get(id, actor);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { status: current.status === 'active' ? 'inactive' : 'active' },
      include: includeCustomer,
    });
    return this.dto(customer, actor);
  }

  async setStage(id: string, stage: string, body: any = {}, actor?: any) {
    const current: any = await this.get(id, actor);
    const stageId = await this.resolveStageId(stage);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        stageId,
        ...(stageId !== current.stageId ? { stageEnteredAt: new Date() } : {}),
        ...(body.depositAmount !== undefined ? { depositAmount: body.depositAmount === '' ? null : this.optionalNumber(body.depositAmount) } : {}),
        ...(body.nextContactAt !== undefined ? { nextContactAt: body.nextContactAt === null || body.nextContactAt === '' ? null : this.toDate(body.nextContactAt) } : {}),
        ...(body.installationAt !== undefined ? { installationAt: body.installationAt === null || body.installationAt === '' ? null : this.toDate(body.installationAt) } : {}),
        ...(body.installerEmployeeId !== undefined ? { installerEmployeeId: body.installerEmployeeId || null } : {}),
      },
      include: includeCustomer,
    });
    if (stageId !== current.stageId) {
      await this.createActivity(customer.id, 'STAGE_CHANGED', `Bosqich o'zgardi: ${current.stage?.label || current.stageId} → ${customer.stage?.label || customer.stageId}`, actor?.id);
      await this.createStageAutomation(customer, stageId, actor);
    }
    if (body.depositAmount !== undefined && Number(current.depositAmount || 0) !== Number(customer.depositAmount || 0)) await this.createActivity(customer.id, 'DEPOSIT_CHANGED', `Zaklad o'zgardi: ${customer.depositAmount || 0}`, actor?.id);
    if (body.nextContactAt !== undefined) {
        if (customer.nextContactAt) await this.scheduleReminder(customer, customer.nextContactAt, actor, body.reminderType || (stageId === 'FOLLOW_UP' ? 'FOLLOW_UP' : 'CALL'), body.reminderNote ?? body.note ?? body.comment);
      else await this.cancelPendingReminders(customer.id);
    }
    if (body.installationAt !== undefined || body.installerEmployeeId !== undefined || stageId === 'INSTALLATION_REQUIRED') await this.syncInstallation(customer, actor);
    await this.syncPartnerReward(customer.id, new Date());
    return this.dto(customer, actor);
  }

  async setGroups(id: string, groupIds: string[], actor?: any) {
    if (this.partnerGroupId(actor)) throw new ForbiddenException('Partner mijoz guruhini o\'zgartira olmaydi');
    await this.get(id, actor);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { groups: { set: groupIds.map((groupId) => ({ id: groupId })) } },
      include: includeCustomer,
    });
    await this.createActivity(customer.id, 'GROUPS_CHANGED', 'Mijoz guruhlari o\'zgartirildi', actor?.id);
    await this.syncPartnerReward(customer.id, new Date());
    return this.dto(customer, actor);
  }

  async bulkMove(body: any, actor?: any) {
    if (!Array.isArray(body.customerIds) || !body.customerIds.length) return { ok: true };
    const stageId = body.stage ? await this.resolveStageId(body.stage) : null;
    for (const id of body.customerIds) {
      if (stageId) await this.setStage(id, stageId, {}, actor);
      if (body.targetGroupId) {
        await this.get(id, actor);
        await this.prisma.customer.update({ where: { id }, data: { groups: { connect: { id: body.targetGroupId } } } });
      }
    }
    return { ok: true };
  }

  async programs(id: string, actor?: any) {
    if (this.partnerGroupId(actor)) throw new ForbiddenException('Partner dastur tafsilotlarini ko\'ra olmaydi');
    const customer: any = await this.get(id, actor);
    return { items: customer.programs || [], total: customer.programs?.length || 0 };
  }

  async addProgram(id: string, body: any, actor?: any) {
    const current: any = await this.get(id, actor);
    return this.update(id, { programs: [...(current.programs || []), { id: randomUUID(), status: 'NEW', createdAt: new Date().toISOString(), ...body }] }, actor);
  }

  async updateProgram(id: string, programId: string, body: any, actor?: any) {
    const current: any = await this.get(id, actor);
    return this.update(id, { programs: (current.programs || []).map((p: any) => (p.id === programId ? { ...p, ...body } : p)) }, actor);
  }

  async removeProgram(id: string, programId: string, actor?: any) {
    const current: any = await this.get(id, actor);
    return this.update(id, { programs: (current.programs || []).filter((p: any) => p.id !== programId) }, actor);
  }

  async filterOptions() {
    const customers = await this.prisma.customer.findMany({ where: { deletedAt: null } });
    const cities = new Set<string>();
    const programs = new Set<string>();
    const stageCounts: Record<string, number> = {};
    customers.forEach((c) => {
      const city = (c.address as any)?.city;
      if (city) cities.add(city);
      if (c.service) programs.add(c.service);
      if (Array.isArray(c.programs)) c.programs.forEach((p: any) => p.name && programs.add(p.name));
      stageCounts[c.stageId] = (stageCounts[c.stageId] || 0) + 1;
    });
    return { cities: [...cities], programs: [...programs], stageCounts };
  }

  private canViewAll(actor?: any) {
    return Boolean(actor && canViewAll(actor));
  }

  private dto(customer: any, actor?: any) {
    const partnerGroupId = this.partnerGroupId(actor);
    return customerDto(customer, {
      partner: Boolean(partnerGroupId),
      partnerGroupId: partnerGroupId || undefined,
      hideInternalNotes: !this.canViewComments(actor),
    });
  }

  private canViewComments(actor?: any) {
    return Boolean(actor && (['ADMIN', 'SUPER_ADMIN'].includes(String(actor.role || '').toUpperCase()) || actor.permissions?.includes('comments.view')));
  }

  private ownershipWhere(actor?: any) {
    if (!actor || this.canViewAll(actor) || this.partnerGroupId(actor)) return {};
    return { assignedEmployeeId: actor.id };
  }

  private contactOrder(a: any, b: any) {
    const rank = (customer: any) => {
      if (!customer.nextContactAt) return 3;
      const timestamp = new Date(customer.nextContactAt).getTime();
      if (timestamp < Date.now()) return 0;
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return timestamp < start + 86400000 ? 1 : 2;
    };
    const rankDifference = rank(a) - rank(b);
    if (rankDifference !== 0) return rankDifference;
    const aTime = a.nextContactAt ? new Date(a.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.nextContactAt ? new Date(b.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  }

  private toDate(value: any) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new ConflictException('Sana/vaqt noto\'g\'ri');
    return date;
  }

  private async createActivity(customerId: string, type: string, message: string, createdById?: string, metadata?: any) {
    return this.prisma.activity.create({ data: { customerId, type, message, createdById: createdById || null, metadata: metadata || undefined } });
  }

  private async resolveCurrencyId(currencyId?: any, currencyCode?: any) {
    if (!this.prisma.currency) return null;
    const requested = String(currencyId || '').trim();
    const code = String(currencyCode || '').trim().toUpperCase();
    const item = requested
      ? await this.prisma.currency.findFirst({ where: { id: requested, isActive: true }, select: { id: true } })
      : code
        ? await this.prisma.currency.findFirst({ where: { code, isActive: true }, select: { id: true } })
        : await this.prisma.currency.findFirst({ where: { isDefault: true, isActive: true }, select: { id: true } });
    if (!item) throw new ConflictException('Faol valyuta topilmadi');
    return item.id;
  }

  private async createStageAutomation(customer: any, stageId: string, actor?: any) {
    const titles: Record<string, string> = {
      NEW: "Mijoz bilan bog'lanish",
      DEPOSIT_RECEIVED: "O'rnatish sanasini kelish",
      PAID: "O'rnatishni rejalash",
      INSTALLATION_REQUIRED: "O'rnatishni bajarish",
    };
    const title = titles[stageId];
    if (!title) return;
    const assignedToId = customer.assignedEmployeeId || actor?.id;
    if (!assignedToId) return;
    try {
      const task = await this.prisma.task.create({
        data: {
          title,
          description: `Stage automation: ${stageId}`,
          status: 'TODO' as any,
          priority: 'MEDIUM' as any,
          assignedToId,
          assignedEmployeeId: assignedToId,
          createdById: actor?.id || assignedToId,
          customerId: customer.id,
          automationKey: `stage:${stageId}`,
        } as any,
      });
      await this.createActivity(customer.id, 'TASK_CREATED', `Avtomatik vazifa yaratildi: ${title}`, actor?.id, { taskId: task.id, automationKey: `stage:${stageId}` });
    } catch (error) {
      if (!uniqueConflict(error)) throw error;
    }
  }

  private async cancelPendingReminders(customerId: string) {
    await this.prisma.reminder.updateMany({ where: { customerId, status: 'PENDING' as any, type: { in: ['CALL', 'FOLLOW_UP'] } }, data: { status: 'CANCELLED' as any } });
  }

  private async scheduleReminder(customer: any, remindAt: Date, actor?: any, type = 'CALL', note?: any) {
    const assignedUserId = customer.assignedEmployeeId || actor?.id || null;
    if (!assignedUserId) return;
    await this.cancelPendingReminders(customer.id);
    const title = type === 'REPEAT_SALE' ? `${customer.name} uchun qayta sotuv eslatmasi` : `${customer.name}ga qo'ng'iroq qilish`;
    const normalizedNote = String(note || '').trim() || null;
    const reminder = await this.prisma.reminder.create({
      data: { customerId: customer.id, assignedUserId, createdById: actor?.id || null, type, title, note: normalizedNote, remindAt },
    });
    await this.createActivity(customer.id, 'REMINDER_CREATED', `Eslatma rejalashtirildi: ${remindAt.toISOString()}${normalizedNote ? `\nIzoh: ${normalizedNote}` : ''}`, actor?.id, { reminderId: reminder.id, type, note: normalizedNote });
    return reminder;
  }

  private async syncInstallation(customer: any, actor?: any) {
    if (!customer.installationAt) return;
    const scheduledDate = new Date(customer.installationAt).toISOString();
    const existing = await this.prisma.installation.findFirst({ where: { customerId: customer.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, orderBy: { createdAt: 'desc' } });
    if (existing) {
      await this.prisma.installation.update({ where: { id: existing.id }, data: { scheduledDate, assignedEmployeeId: customer.installerEmployeeId || null } });
    } else {
      await this.prisma.installation.create({ data: { customerId: customer.id, scheduledDate, assignedEmployeeId: customer.installerEmployeeId || null, status: 'SCHEDULED' } });
      await this.createActivity(customer.id, 'INSTALLATION_SCHEDULED', `O'rnatish rejalashtirildi: ${scheduledDate}`, actor?.id);
    }
  }

  private normalizePrograms(programs: any[]) {
    if (!Array.isArray(programs)) return [];
    return programs.map((p) => ({ id: p.id || randomUUID(), status: p.status || 'NEW', createdAt: p.createdAt || new Date().toISOString(), ...p }));
  }

  private optionalNumber(value: any) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private async defaultPipeline() {
    return this.prisma.pipeline.findFirstOrThrow({ where: { name: DEFAULT_PIPELINE_NAME } });
  }

  private async resolveStageId(stage: any): Promise<string> {
    const candidate = typeof stage === 'object' ? stage?.id || stage?.stageId || stage?.value || stage?.key : stage;
    const value = String(candidate || '').trim();
    if (!value) throw new NotFoundException('Bosqich topilmadi');

    const exact = await this.prisma.stage.findUnique({ where: { id: value } });
    if (exact) return exact.id;

    const pipeline = await this.defaultPipeline();
    const stages = await this.prisma.stage.findMany({ where: { pipelineId: pipeline.id }, select: { id: true, label: true } });
    const normalized = value.toLocaleLowerCase();
    const byLabel = stages.find((item) => item.label.trim().toLocaleLowerCase() === normalized);
    if (byLabel) return byLabel.id;

    throw new NotFoundException('Bosqich topilmadi');
  }

  private async ensureStage(stageId: any) {
    const resolvedId = await this.resolveStageId(stageId);
    return this.prisma.stage.findUniqueOrThrow({ where: { id: resolvedId } });
  }

  private partnerGroupId(actor?: any) {
    return partnerGroupIdOf(actor);
  }

  private normalizeGroupIds(groupIds: any, groupId?: any) {
    const values = Array.isArray(groupIds) ? groupIds : groupId ? [groupId] : [];
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  }

  private async syncPartnerReward(customerId: string, completedAt: Date) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, include: { groups: true, stage: true } });
    if (!customer?.stage?.isFinal) return;
    const period = `${completedAt.getUTCFullYear()}-${String(completedAt.getUTCMonth() + 1).padStart(2, '0')}`;
    await Promise.all(
      customer.groups.map((group) =>
        this.prisma.partnerReward.upsert({
          where: { groupId_customerId: { groupId: group.id, customerId } },
          update: {},
          create: {
            groupId: group.id,
            customerId,
            period,
            amount: group.partnerRewardPerCustomer ?? 0,
            completedAt,
          },
        }),
      ),
    );
  }
}
