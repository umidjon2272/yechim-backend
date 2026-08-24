import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DEFAULT_PIPELINE_NAME } from '../common/defaults';
import { canEditCustomerBusinessType, canEditCustomerCore, canViewAll, canViewCustomerAmount, canViewCustomerDeposit, customerScopeWhere, isAdmin, isPartner, partnerGroupIdOf } from '../common/access';
import { customerDto, uniqueConflict } from '../common/mappers';
import { paged, pagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

const includeCustomer = {
  assignedEmployee: { include: { team: true } },
  createdBy: { include: { team: true } },
  installerEmployee: { include: { team: true } },
  groups: true,
  partnerRewards: true,
  currency: true,
  businessType: true,
  businessTypeLinks: { include: { businessType: true } },
  businesses: true,
  stage: true,
  activities: {
    where: { type: 'NOTE' },
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: { createdBy: { include: { team: true } } },
  },
  reminders: {
    where: { status: 'PENDING' },
    orderBy: { remindAt: 'asc' },
    take: 1,
    select: { id: true, type: true, title: true, note: true, remindAt: true, status: true },
  },
} as const;

// List cards do not need the full customer relation graph. Keeping this
// include separate prevents a paginated list from materialising every
// business/activity/reminder relation for each row.
const listIncludeCustomer = {
  ...includeCustomer,
  businesses: { take: 1, orderBy: { createdAt: 'asc' as const } },
  partnerRewards: true,
} as const;

// A real customer touchpoint, not an internal state change or a reminder plan.
const LAST_CONTACT_ACTIVITY_TYPES = ['CALL', 'FOLLOW_UP', 'MEETING', 'DEMO', 'NOTE', 'REMINDER_COMPLETED'];

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any, actor?: any) {
    const { page, pageSize } = pagination(query);
    const search = String(query.search || '').trim().toLowerCase();
    this.ensurePartnerConfigured(actor);
    const scopeWhere = customerScopeWhere(actor);
    const baseWhere: any = { deletedAt: null, ...scopeWhere };
    const andFilters: any[] = [];
    if (search) {
      andFilters.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.status) baseWhere.status = query.status;
    if (query.stage) baseWhere.stageId = query.stage;
    if (query.assignedEmployeeId && (this.canViewAll(actor) || query.assignedEmployeeId === actor?.id)) baseWhere.assignedEmployeeId = query.assignedEmployeeId;
    if (query.groupId) {
      const requestedGroupWhere = { groups: { some: { id: String(query.groupId) } } };
      if (baseWhere.groups) {
        andFilters.push({ groups: baseWhere.groups }, requestedGroupWhere);
        delete baseWhere.groups;
      } else baseWhere.groups = requestedGroupWhere.groups;
    }
    if (query.createdFrom || query.createdTo) {
      const createdAt: any = {};
      if (query.createdFrom) createdAt.gte = new Date(query.createdFrom);
      if (query.createdTo) createdAt.lte = new Date(`${query.createdTo}T23:59:59.999Z`);
      baseWhere.createdAt = createdAt;
    }
    if (query.city) {
      andFilters.push({ address: { path: ['city'], equals: String(query.city) } });
    }
    if (query.installationStatus) {
      andFilters.push({ installations: { some: { status: String(query.installationStatus) } } });
    }
    if (andFilters.length) baseWhere.AND = andFilters;
    const sort = String(query.sort || '-createdAt');
    const orderBy = sort === 'name'
      ? { name: 'asc' as const }
      : sort === '-name'
        ? { name: 'desc' as const }
        : sort === 'nextContactAt'
          ? { nextContactAt: 'asc' as const }
          : sort === 'createdAt'
            ? { createdAt: 'asc' as const }
            : { createdAt: 'desc' as const };
    const customersPromise = this.prisma.customer.findMany({ where: baseWhere, include: listIncludeCustomer, orderBy, skip: (page - 1) * pageSize, take: pageSize });
    const totalPromise = typeof this.prisma.customer.count === 'function'
      ? this.prisma.customer.count({ where: baseWhere })
      : customersPromise.then((items: any[]) => items.length);
    const [customers, total] = await Promise.all([customersPromise, totalPromise]);
    const customersWithSummaries = await this.attachActivitySummaries(customers);
    return paged(customersWithSummaries.map((customer) => this.dto(customer, actor)), total, page, pageSize);
  }

  async get(id: string, actor?: any) {
    this.ensurePartnerConfigured(actor);
    const customer = await this.prisma.customer.findFirst({
      where: { AND: [{ id, deletedAt: null }, customerScopeWhere(actor)] },
      include: includeCustomer,
    });
    if (!customer) throw new NotFoundException('Mijoz topilmadi');
    const [customerWithSummary] = await this.attachActivitySummaries([customer]);
    return this.dto(customerWithSummary, actor);
  }

  async create(body: any, actor?: any) {
    this.ensurePartnerCannotWrite(actor);
    const pipeline = await this.defaultPipeline();
    const stageId = await this.resolveStageId(body.stageId ?? body.stage ?? 'NEW');
    const programs = this.normalizePrograms(body.programs);
    const requestedGroupIds = await this.resolveCreateGroupIds(body, actor);
    const businessTypeIds = await this.resolveBusinessTypeIds(body.businessTypeIds, body.businessTypeId);
    const currencyId = canViewCustomerAmount(actor) ? await this.resolveCurrencyId(body.currencyId, body.currencyCode) : null;
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
          amount: this.canViewField(actor, 'amount') ? this.optionalNumber(body.amount) ?? 0 : 0,
          depositAmount: this.canViewField(actor, 'deposit') ? this.optionalNumber(body.depositAmount) : null,
          currencyId,
          // Keep the legacy scalar synchronized with the first selected type
          // while the join table stores the complete multi-select.
          businessTypeId: businessTypeIds[0] || null,
          businessTypeLinks: businessTypeIds.length
            ? { create: businessTypeIds.map((businessTypeId) => ({ businessType: { connect: { id: businessTypeId } } })) }
            : undefined,
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
          // The creator is always taken from the authenticated request actor;
          // a client-supplied body.createdById is deliberately ignored.
          createdById: actor?.id || null,
          nextContactAt: body.nextContactAt ? this.toDate(body.nextContactAt) : null,
          stageEnteredAt: new Date(),
          installationAt: body.installationAt ? this.toDate(body.installationAt) : null,
          installerEmployeeId: body.installerEmployeeId || null,
          groups: requestedGroupIds.length > 0 ? { connect: requestedGroupIds.map((id) => ({ id })) } : undefined,
        },
        include: includeCustomer,
      });
      await this.createActivity(
        customer.id,
        'CUSTOMER_CREATED',
        'Mijoz yaratildi',
        actor?.id,
        { createdById: actor?.id || null, createdByName: actor?.name || null },
      );
      await this.recordStageHistory(customer.id, null, customer.stage, customer.createdAt || new Date());
      await this.createStageAutomation(customer, stageId, actor);
      if (customer.nextContactAt) await this.scheduleReminder(customer, customer.nextContactAt, actor, body.reminderType || 'CALL', body.reminderNote ?? body.note ?? body.comment);
      const quickActionErrors = await this.persistQuickActions(customer, body.quickActions, actor);
      await this.syncPartnerReward(customer.id, customer.createdAt || new Date());
      return { ...this.dto(customer, actor), ...(quickActionErrors.length ? { quickActionErrors } : {}) };
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Email yoki telefon allaqachon mavjud');
      throw error;
    }
  }

  async update(id: string, body: any, actor?: any) {
    this.ensurePartnerCannotWrite(actor);
    const hasBusinessTypeSelection = body.businessTypeIds !== undefined || body.businessTypeId !== undefined;
    if (hasBusinessTypeSelection && !canEditCustomerBusinessType(actor)) {
      throw new ForbiddenException('Biznes turini o\'zgartirishga ruxsat yo\'q');
    }
    this.ensureCoreEdit(body, actor);
    const financialWriteFields = [
      ['amount', canViewCustomerAmount(actor)],
      ['currencyId', canViewCustomerAmount(actor)],
      ['currencyCode', canViewCustomerAmount(actor)],
      ['depositAmount', canViewCustomerDeposit(actor)],
    ] as const;
    if (financialWriteFields.some(([field, allowed]) => body[field] !== undefined && !allowed)) {
      throw new ForbiddenException('Moliyaviy ma\'lumotlarni o\'zgartirishga ruxsat yo\'q');
    }
    const current: any = await this.get(id, actor);
    const businessTypeIds = hasBusinessTypeSelection
      ? await this.resolveBusinessTypeIds(body.businessTypeIds, body.businessTypeId)
      : undefined;
    const requestedStage = body.stageId ?? body.stage;
    const nextStageId = requestedStage ? await this.resolveStageId(requestedStage) : undefined;
    const stageChanged = nextStageId && nextStageId !== current.stageId;
    if (!this.canViewAll(actor) && body.assignedEmployeeId !== undefined && body.assignedEmployeeId !== actor?.id && body.assignedEmployeeId !== '') {
      throw new ForbiddenException('Mijozni faqat ozingizga biriktirishingiz mumkin');
    }
    const requestedGroupIds = Array.isArray(body.groupIds) || body.groupId !== undefined ? this.normalizeGroupIds(body.groupIds, body.groupId) : undefined;
    if (requestedGroupIds) await this.assertEmployeeGroupWrite(requestedGroupIds, actor);
    const stageEnteredAt = stageChanged ? new Date() : undefined;
    const data: any = {
      name: body.name,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone === undefined ? undefined : body.phone || null,
      phone2: body.phone2,
      telegram: body.telegram,
      email: body.email === undefined ? undefined : body.email || null,
      service: body.service,
      amount: body.amount == null || !this.canViewField(actor, 'amount') ? undefined : this.optionalNumber(body.amount) ?? 0,
      depositAmount: body.depositAmount === undefined || !this.canViewField(actor, 'deposit') ? undefined : body.depositAmount === '' ? null : this.optionalNumber(body.depositAmount),
      currencyId: (body.currencyId !== undefined || body.currencyCode !== undefined) && canViewCustomerAmount(actor)
        ? await this.resolveCurrencyId(body.currencyId, body.currencyCode)
        : undefined,
      businessTypeId: businessTypeIds === undefined ? undefined : businessTypeIds[0] || null,
      businessTypeLinks: businessTypeIds === undefined
        ? undefined
        : {
            deleteMany: {},
            ...(businessTypeIds.length
              ? { create: businessTypeIds.map((businessTypeId) => ({ businessType: { connect: { id: businessTypeId } } })) }
              : {}),
          },
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
      stageEnteredAt,
      assignedEmployeeId: body.assignedEmployeeId === '' ? null : body.assignedEmployeeId,
      nextContactAt: body.nextContactAt === undefined ? undefined : body.nextContactAt === null || body.nextContactAt === '' ? null : this.toDate(body.nextContactAt),
      installationAt: body.installationAt === undefined ? undefined : body.installationAt === null || body.installationAt === '' ? null : this.toDate(body.installationAt),
      installerEmployeeId: body.installerEmployeeId === undefined ? undefined : body.installerEmployeeId === '' ? null : body.installerEmployeeId,
      groups: requestedGroupIds
        ? { set: requestedGroupIds.map((groupId) => ({ id: groupId })) }
        : undefined,
    };
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    try {
      const customer = await this.prisma.customer.update({ where: { id }, data, include: includeCustomer });
      if (stageChanged) {
        await this.createActivity(customer.id, 'STAGE_CHANGED', `Bosqich o'zgardi: ${current.stage?.label || current.stageId} → ${customer.stage?.label || customer.stageId}`, actor?.id, {
          fromStageId: current.stageId,
          toStageId: customer.stageId,
          fromIsFinal: Boolean(current.isCompleted),
          toIsFinal: Boolean(customer.stage?.isFinal),
        });
        await this.recordStageHistory(customer.id, current.stageId, customer.stage, stageEnteredAt || new Date(), Boolean(current.isCompleted), Boolean(customer.stage?.isFinal));
        await this.createStageAutomation(customer, customer.stageId, actor);
      }
      if (current.assignedEmployeeId !== customer.assignedEmployeeId) await this.createActivity(customer.id, 'ASSIGNED_CHANGED', `Mas'ul xodim o'zgardi`, actor?.id);
      if (Array.isArray(body.groupIds) || body.groupId !== undefined) await this.createActivity(customer.id, 'GROUPS_CHANGED', 'Mijoz guruhlari o\'zgartirildi', actor?.id);
      if (body.amount !== undefined && this.canViewField(actor, 'amount') && Number(current.amount) !== Number(customer.amount)) await this.createActivity(customer.id, 'AMOUNT_CHANGED', `Summa o'zgardi: ${customer.amount}`, actor?.id);
      if (body.depositAmount !== undefined && this.canViewField(actor, 'deposit') && Number(current.depositAmount || 0) !== Number(customer.depositAmount || 0)) await this.createActivity(customer.id, 'DEPOSIT_CHANGED', `Zaklad o'zgardi: ${customer.depositAmount || 0}`, actor?.id);
      if (body.nextContactAt !== undefined) {
        if (customer.nextContactAt) await this.scheduleReminder(customer, customer.nextContactAt, actor, body.reminderType || 'CALL', body.reminderNote ?? body.note ?? body.comment);
        else await this.cancelPendingReminders(customer.id);
      }
      if (body.installationAt !== undefined || body.installerEmployeeId !== undefined) await this.syncInstallation(customer, actor);
      if (stageChanged) await this.syncPartnerReward(customer.id, stageEnteredAt || new Date(), Boolean(current.isCompleted));
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
    this.ensurePartnerCannotWrite(actor);
    const current: any = await this.get(id, actor);
    const stageId = await this.resolveStageId(stage);
    const stageEnteredAt = stageId !== current.stageId ? new Date() : undefined;
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        stageId,
        ...(stageEnteredAt ? { stageEnteredAt } : {}),
        ...(body.depositAmount !== undefined && this.canViewField(actor, 'deposit') ? { depositAmount: body.depositAmount === '' ? null : this.optionalNumber(body.depositAmount) } : {}),
        ...(body.nextContactAt !== undefined ? { nextContactAt: body.nextContactAt === null || body.nextContactAt === '' ? null : this.toDate(body.nextContactAt) } : {}),
        ...(body.installationAt !== undefined ? { installationAt: body.installationAt === null || body.installationAt === '' ? null : this.toDate(body.installationAt) } : {}),
        ...(body.installerEmployeeId !== undefined ? { installerEmployeeId: body.installerEmployeeId || null } : {}),
      },
      include: includeCustomer,
    });
    if (stageId !== current.stageId) {
      await this.createActivity(customer.id, 'STAGE_CHANGED', `Bosqich o'zgardi: ${current.stage?.label || current.stageId} → ${customer.stage?.label || customer.stageId}`, actor?.id, {
        fromStageId: current.stageId,
        toStageId: customer.stageId,
        fromIsFinal: Boolean(current.isCompleted),
        toIsFinal: Boolean(customer.stage?.isFinal),
      });
      await this.recordStageHistory(customer.id, current.stageId, customer.stage, stageEnteredAt || new Date(), Boolean(current.isCompleted), Boolean(customer.stage?.isFinal));
      await this.createStageAutomation(customer, stageId, actor);
    }
    if (body.depositAmount !== undefined && this.canViewField(actor, 'deposit') && Number(current.depositAmount || 0) !== Number(customer.depositAmount || 0)) await this.createActivity(customer.id, 'DEPOSIT_CHANGED', `Zaklad o'zgardi: ${customer.depositAmount || 0}`, actor?.id);
    if (body.nextContactAt !== undefined) {
        if (customer.nextContactAt) await this.scheduleReminder(customer, customer.nextContactAt, actor, body.reminderType || (stageId === 'FOLLOW_UP' ? 'FOLLOW_UP' : 'CALL'), body.reminderNote ?? body.note ?? body.comment);
      else await this.cancelPendingReminders(customer.id);
    }
    if (body.installationAt !== undefined || body.installerEmployeeId !== undefined || stageId === 'INSTALLATION_REQUIRED') await this.syncInstallation(customer, actor);
    if (stageId !== current.stageId) await this.syncPartnerReward(customer.id, stageEnteredAt || new Date(), Boolean(current.isCompleted));
    return this.dto(customer, actor);
  }

  async setGroups(id: string, groupIds: string[], actor?: any) {
    if (isPartner(actor)) throw new ForbiddenException('Partner mijoz guruhini o\'zgartira olmaydi');
    await this.get(id, actor);
    await this.assertEmployeeGroupWrite(groupIds, actor);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { groups: { set: groupIds.map((groupId) => ({ id: groupId })) } },
      include: includeCustomer,
    });
      await this.createActivity(customer.id, 'GROUPS_CHANGED', 'Mijoz guruhlari o\'zgartirildi', actor?.id);
    return this.dto(customer, actor);
  }

  async bulkMove(body: any, actor?: any) {
    if (!Array.isArray(body.customerIds) || !body.customerIds.length) return { ok: true };
    const stageId = body.stage ? await this.resolveStageId(body.stage) : null;
    for (const id of body.customerIds) {
      if (stageId) await this.setStage(id, stageId, {}, actor);
      if (body.targetGroupId) {
        await this.get(id, actor);
        await this.assertEmployeeGroupWrite([String(body.targetGroupId)], actor);
        await this.prisma.customer.update({ where: { id }, data: { groups: { connect: { id: body.targetGroupId } } } });
      }
    }
    return { ok: true };
  }

  async programs(id: string, actor?: any) {
    if (isPartner(actor)) throw new ForbiddenException('Partner dastur tafsilotlarini ko\'ra olmaydi');
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

  async filterOptions(actor?: any) {
    const customers = await this.prisma.customer.findMany({
      where: { deletedAt: null, ...customerScopeWhere(actor) },
      select: { address: true, stageId: true },
    });
    const cities = new Set<string>();
    const stageCounts: Record<string, number> = {};
    customers.forEach((c) => {
      const city = (c.address as any)?.city;
      if (city) cities.add(city);
      stageCounts[c.stageId] = (stageCounts[c.stageId] || 0) + 1;
    });
    return { cities: [...cities], stageCounts };
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
      hideFollowUps: !this.canViewFollowUps(actor),
      hideActivitySummary: !this.canViewActivities(actor),
      hideLastContact: !this.canViewLastContact(actor),
      fieldVisibility: {
        phone: this.canViewField(actor, 'phone'),
        amount: this.canViewField(actor, 'amount'),
        deposit: this.canViewField(actor, 'deposit'),
      },
      hideCreator: !this.canViewCreator(customer, actor),
    });
  }

  private canViewCreator(customer: any, actor?: any) {
    if (!actor || isPartner(actor)) return false;
    if (isAdmin(actor)) return true;
    if (customer.createdById && customer.createdById === actor.id) return true;
    return Boolean(actor.permissions?.includes('customers.viewCreatedBy') || actor.permissions?.includes('customers.viewAll'));
  }

  private async attachActivitySummaries(customers: any[]) {
    const ids = customers.map((customer) => customer.id).filter(Boolean);
    if (!ids.length || !this.prisma.activity?.findMany) return customers;
    const activities = await this.prisma.activity.findMany({
      where: { customerId: { in: ids }, type: { in: LAST_CONTACT_ACTIVITY_TYPES } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        customerId: true,
        type: true,
        message: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    const latestByCustomer = new Map<string, any>();
    for (const activity of activities) {
      if (!latestByCustomer.has(activity.customerId)) latestByCustomer.set(activity.customerId, activity);
    }
    return customers.map((customer) => ({
      ...customer,
      latestActivity: latestByCustomer.get(customer.id) || null,
      lastContact: latestByCustomer.get(customer.id) || null,
    }));
  }

  private ensureCoreEdit(body: any, actor?: any) {
    if (canEditCustomerCore(actor)) return;
    const coreFields = [
      'name', 'firstName', 'lastName', 'phone', 'phone2', 'telegram', 'email',
      'service', 'programs', 'amount', 'depositAmount', 'notes', 'note', 'status',
      'currencyId', 'currencyCode', 'address', 'latitude', 'longitude',
      'birthDate', 'telegramUsername', 'instagram', 'source', 'customFields',
    ];
    if (coreFields.some((field) => body[field] !== undefined)) {
      throw new ForbiddenException('Customer asosiy ma\'lumotlarini o\'zgartirishga ruxsat yo\'q');
    }
  }

  private canViewComments(actor?: any) {
    return Boolean(actor && (['ADMIN', 'SUPER_ADMIN'].includes(String(actor.role || '').toUpperCase()) || actor.permissions?.includes('comments.view')));
  }

  private canViewFollowUps(actor?: any) {
    return Boolean(actor && (isAdmin(actor) || actor.permissions?.includes('reminders.view') || actor.permissions?.includes('calls.view')));
  }

  private canViewActivities(actor?: any) {
    return Boolean(actor && (isAdmin(actor) || actor.permissions?.includes('activities.view')));
  }

  private canViewLastContact(actor?: any) {
    if (!actor || isPartner(actor)) return false;
    return Boolean(
      isAdmin(actor)
      || actor.permissions?.includes('activities.view')
      || actor.permissions?.includes('history.view')
      || actor.permissions?.includes('calls.view')
      || actor.permissions?.includes('comments.view'),
    );
  }

  private canViewField(actor: any, field: 'phone' | 'amount' | 'deposit') {
    if (!actor || isAdmin(actor)) return true;
    if (isPartner(actor)) return field === 'phone';
    if (field === 'amount') return canViewCustomerAmount(actor);
    if (field === 'deposit') return canViewCustomerDeposit(actor);
    const permission = field === 'phone' ? 'customers.viewPhone' : field === 'amount' ? 'customers.viewAmount' : 'customers.viewDeposit';
    return actor.permissions?.includes(permission) || actor.permissions?.includes(`${field}.view`);
  }

  private ensurePartnerConfigured(actor?: any) {
    if (String(actor?.role || '').toUpperCase() === 'PARTNER' && !this.partnerGroupId(actor)) {
      throw new ForbiddenException('Partner guruhi biriktirilmagan');
    }
  }

  private ensurePartnerCannotWrite(actor?: any) {
    this.ensurePartnerConfigured(actor);
    if (isPartner(actor)) throw new ForbiddenException('Partner faqat biriktirilgan mijozlarni ko\'rishi mumkin');
  }

  private async resolveCreateGroupIds(body: any, actor?: any) {
    const requested = this.normalizeGroupIds(body.groupIds, body.groupId || body.currentGroupId);
    if (isAdmin(actor)) return requested;
    if (isPartner(actor)) throw new ForbiddenException('Partner yangi mijoz qo\'sha olmaydi');
    const role = String(actor?.role || '').toUpperCase();
    if (role !== 'EMPLOYEE') return requested;
    const visibility = String(actor?.customerVisibility || 'ASSIGNED').toUpperCase();
    const allowed = this.allowedGroupIds(actor);
    if (requested.some((groupId) => !allowed.includes(groupId))) {
      throw new ForbiddenException('Siz faqat ruxsat berilgan guruhga mijoz qo\'sha olasiz');
    }
    if (visibility === 'GROUPS') {
      if (!allowed.length) throw new ForbiddenException('Sizga ruxsat berilgan guruh biriktirilmagan');
      return requested.length ? requested : allowed;
    }
    if (requested.length) throw new ForbiddenException('Sizga guruhga mijoz qo\'shishga ruxsat berilmagan');
    return [];
  }

  private async assertEmployeeGroupWrite(groupIds: string[], actor?: any) {
    if (!actor || isAdmin(actor) || isPartner(actor)) return;
    if (String(actor.role || '').toUpperCase() !== 'EMPLOYEE') return;
    const allowed = this.allowedGroupIds(actor);
    if (groupIds.some((groupId) => !allowed.includes(groupId))) {
      throw new ForbiddenException('Siz faqat ruxsat berilgan guruhlar bilan ishlay olasiz');
    }
  }

  private allowedGroupIds(actor?: any) {
    if (Array.isArray(actor?.allowedGroupIds)) return actor.allowedGroupIds;
    return Array.isArray(actor?.allowedGroups) ? actor.allowedGroups.map((item: any) => item.groupId || item.group?.id).filter(Boolean) : [];
  }

  private async persistQuickActions(customer: any, actions: any, actor?: any) {
    if (!Array.isArray(actions) || !actions.length) return [];
    const errors: any[] = [];
    for (const action of actions) {
      try {
        const type = String(action?.type || '').toUpperCase();
        if (type === 'CALL' || type === 'REMINDER') {
          const permission = type === 'CALL' ? 'calls.create' : 'reminders.create';
          if (!isAdmin(actor) && !actor?.permissions?.includes(permission)) throw new ForbiddenException('Bu eslatma turini yaratishga ruxsat yo\'q');
          const remindAt = this.toDate(action.remindAt || action.date);
          const reminder = await this.scheduleReminder(customer, remindAt, actor, type === 'CALL' ? 'CALL' : 'REPEAT_SALE', action.note || action.comment);
          await this.prisma.customer.update({ where: { id: customer.id }, data: { nextContactAt: remindAt } });
          if (!reminder) throw new ForbiddenException('Eslatma uchun mas\'ul xodim topilmadi');
        } else if (type === 'TASK') {
          if (!isAdmin(actor) && !actor?.permissions?.includes('tasks.create')) throw new ForbiddenException('Vazifa yaratishga ruxsat yo\'q');
          const title = String(action.title || '').trim();
          if (!title) throw new ForbiddenException('Vazifa sarlavhasi kiritilishi shart');
          const assignedToId = action.assignedToId || action.assignedEmployeeId || actor?.id;
          if (!isAdmin(actor) && assignedToId !== actor?.id) throw new ForbiddenException('Vazifani faqat o\'zingizga biriktirishingiz mumkin');
          const task = await this.prisma.task.create({
            data: {
              title,
              description: action.note || action.description || null,
              status: 'TODO' as any,
              priority: action.priority || 'MEDIUM',
              dueDate: action.dueDate || action.deadline || null,
              assignedToId,
              assignedEmployeeId: assignedToId,
              createdById: actor?.id || null,
              customerId: customer.id,
            } as any,
          });
          await this.createActivity(customer.id, 'TASK_CREATED', `Vazifa yaratildi: ${title}`, actor?.id, { taskId: task.id });
        } else if (type === 'NOTE') {
          if (!isAdmin(actor) && !actor?.permissions?.includes('comments.create')) throw new ForbiddenException('Izoh qo\'shishga ruxsat yo\'q');
          const message = String(action.text || action.message || action.note || '').trim();
          if (!message) throw new ForbiddenException('Izoh matni bo\'sh bo\'lishi mumkin emas');
          await this.createActivity(customer.id, 'NOTE', message, actor?.id);
        }
      } catch (error: any) {
        // The customer is already committed. Return a machine-readable warning
        // so a failed optional action never rolls back or hides the customer.
        errors.push({ type: action?.type || 'UNKNOWN', message: error?.message || 'Quick action saqlanmadi' });
      }
    }
    return errors;
  }

  private ownershipWhere(actor?: any) {
    return customerScopeWhere(actor);
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

  private async resolveBusinessTypeIds(values: any, legacyValue?: any) {
    const rawValues = Array.isArray(values)
      ? values
      : values !== undefined
        ? values === null || values === '' ? [] : [values]
        : legacyValue === undefined || legacyValue === null || legacyValue === '' ? [] : [legacyValue];
    const ids = [...new Set(rawValues.map((value) => String(value || '').trim()).filter(Boolean))];
    if (!ids.length) return [];
    const items = await this.prisma.businessType.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const found = new Set(items.map((item) => item.id));
    if (ids.some((id) => !found.has(id))) throw new ConflictException('Biznes turi topilmadi');
    return ids;
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

  private async syncPartnerReward(customerId: string, completedAt: Date, previousWasFinal = false) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, include: { groups: true, stage: true } });
    if (!customer?.stage) return;
    // A customer coming back from a completed/final stage is not a new
    // referral flow, even if the configured reward stage is reached again.
    if (previousWasFinal || (await this.hasPriorFinalStageHistory(customerId, completedAt))) return;
    const period = `${completedAt.getUTCFullYear()}-${String(completedAt.getUTCMonth() + 1).padStart(2, '0')}`;
    await Promise.all(
      customer.groups.filter((group: any) => group.rewardStageId && group.rewardStageId === customer.stageId).map((group) =>
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

  private async hasPriorFinalStageHistory(customerId: string, before: Date) {
    const history = (this.prisma as any).customerStageHistory;
    if (!history?.findFirst) return false;
    const priorFinal = await history.findFirst({
      where: {
        customerId,
        changedAt: { lt: before },
        OR: [{ fromIsFinal: true }, { toIsFinal: true }],
      },
      select: { id: true },
    });
    return Boolean(priorFinal);
  }

  private async recordStageHistory(customerId: string, fromStageId: string | null, toStage: any, changedAt: Date, fromIsFinal = false, toIsFinal = false) {
    const history = (this.prisma as any).customerStageHistory;
    if (!history?.create || !toStage?.id) return;
    await history.create({
      data: {
        customerId,
        fromStageId,
        toStageId: toStage.id,
        fromIsFinal,
        toIsFinal,
        changedAt,
      },
    });
  }
}
