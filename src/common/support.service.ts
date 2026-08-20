import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ALL_PERMISSIONS, DEFAULT_STAGES } from './defaults';
import { businessDto, customerDto, dealDto, dealItemDto, installationDto, leadDto, paymentDto, toNumber } from './mappers';
import { paged, pagination } from './pagination';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  health() {
    return { ok: true, service: 'yechim-crm-api', time: new Date().toISOString() };
  }

  permissionsSchema() {
    const resources = [...new Set(ALL_PERMISSIONS.map((p) => p.split('.')[0]))];
    return resources.map((resource) => ({
      resource,
      label: resource,
      actions: ALL_PERMISSIONS.filter((p) => p.startsWith(`${resource}.`)).map((p) => p.split('.')[1]),
    }));
  }

  async teams(query: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const [total, items] = await Promise.all([
      this.prisma.team.count(),
      this.prisma.team.findMany({ orderBy: { createdAt: 'desc' }, skip, take, include: { users: true } }),
    ]);
    return paged(
      items.map((t) => ({ ...t, membersCount: t.users.length, members: t.users.map((u) => ({ id: u.id, name: u.name })) })),
      total,
      page,
      pageSize,
    );
  }

  createTeam(body: any) {
    return this.prisma.team.create({ data: { name: body.name, description: body.description, status: body.status || 'active' } });
  }

  updateTeam(id: string, body: any) {
    return this.prisma.team.update({ where: { id }, data: { name: body.name, description: body.description, status: body.status } });
  }

  async customerOptions() {
    const customers = await this.prisma.customer.findMany({ where: { deletedAt: null } });
    const stages = await this.prisma.stage.findMany({ orderBy: { order: 'asc' } });
    const cities = new Set<string>();
    const programs = new Set<string>();
    const stageCounts: Record<string, number> = {};
    customers.forEach((c) => {
      const city = (c.address as any)?.city;
      if (city) cities.add(city);
      if (Array.isArray(c.programs)) c.programs.forEach((p: any) => p.name && programs.add(p.name));
      stageCounts[c.stageId] = (stageCounts[c.stageId] || 0) + 1;
    });
    return { cities: [...cities], programs: [...programs], stageCounts, stages: stages.map((s) => ({ id: s.id, label: s.label })) };
  }

  async fieldDefs(query: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const [total, items] = await Promise.all([
      this.prisma.customerFieldDef.count(),
      this.prisma.customerFieldDef.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items, total, page, pageSize);
  }

  createFieldDef(body: any) {
    return this.prisma.customerFieldDef.create({ data: { label: body.label, type: body.type, options: body.options || [] } });
  }

  updateFieldDef(id: string, body: any) {
    return this.prisma.customerFieldDef.update({ where: { id }, data: { label: body.label, type: body.type, options: body.options } });
  }

  async deleteFieldDef(id: string) {
    await this.prisma.customerFieldDef.delete({ where: { id } });
    return { ok: true };
  }

  async programCatalog(query: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const [total, items] = await Promise.all([
      this.prisma.programCatalog.count(),
      this.prisma.programCatalog.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items, total, page, pageSize);
  }

  createProgram(body: any) {
    return this.prisma.programCatalog.create({ data: { name: body.name, type: body.type, version: body.version, description: body.description } });
  }

  updateProgram(id: string, body: any) {
    return this.prisma.programCatalog.update({ where: { id }, data: { name: body.name, type: body.type, version: body.version, description: body.description } });
  }

  async deleteProgram(id: string) {
    await this.prisma.programCatalog.delete({ where: { id } });
    return { ok: true };
  }

  async businesses(query: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const where: any = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
    const [total, items] = await Promise.all([
      this.prisma.business.count({ where }),
      this.prisma.business.findMany({ where, include: { customer: true }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items.map(businessDto), total, page, pageSize);
  }

  async business(id: string) {
    const item = await this.prisma.business.findUnique({ where: { id }, include: { customer: true } });
    if (!item) throw new NotFoundException('Biznes topilmadi');
    return businessDto(item);
  }

  async createBusiness(body: any) {
    const customer = body.customerId ? await this.prisma.customer.findUnique({ where: { id: body.customerId } }) : null;
    const item = await this.prisma.business.create({
      data: {
        name: body.name,
        businessType: body.businessType,
        phone: body.phone || customer?.phone,
        email: body.email || customer?.email,
        address: body.address,
        city: body.city,
        status: body.status || 'active',
        notes: body.notes,
        customerId: body.customerId || null,
        assignedEmployeeId: body.assignedEmployeeId || customer?.assignedEmployeeId || null,
      },
      include: { customer: true },
    });
    return businessDto(item);
  }

  updateBusiness(id: string, body: any) {
    return this.prisma.business.update({ where: { id }, data: body, include: { customer: true } }).then(businessDto);
  }

  async leads(query: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const where: any = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.businessId) where.businessId = query.businessId;
    const [total, items] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({ where, include: { customer: true, business: true }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items.map(leadDto), total, page, pageSize);
  }

  lead(id: string) {
    return this.prisma.lead.findUnique({ where: { id }, include: { customer: true, business: true } }).then((item) => {
      if (!item) throw new NotFoundException('Murojaat topilmadi');
      return leadDto(item);
    });
  }

  createLead(body: any) {
    return this.prisma.lead.create({ data: { ...body, expectedValue: Number(body.expectedValue || 0) }, include: { customer: true, business: true } }).then(leadDto);
  }

  updateLead(id: string, body: any) {
    return this.prisma.lead.update({ where: { id }, data: { ...body, expectedValue: body.expectedValue == null ? undefined : Number(body.expectedValue) }, include: { customer: true, business: true } }).then(leadDto);
  }

  async deleteLead(id: string) {
    await this.prisma.lead.delete({ where: { id } });
    return { ok: true };
  }

  async convertLead(id: string, body: any) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Murojaat topilmadi');
    const deal = await this.prisma.deal.create({
      data: {
        name: body.name || lead.title,
        customerId: lead.customerId,
        businessId: lead.businessId,
        salesEmployeeId: body.salesEmployeeId || body.assignedEmployeeId || lead.assignedEmployeeId,
        stage: 'NEW',
        value: Number(body.value || body.expectedValue || lead.expectedValue || 0),
        productsNote: body.productsNote || lead.interestedProduct,
      },
    });
    await this.prisma.lead.update({ where: { id }, data: { dealId: deal.id, status: 'WON' } });
    return { id: deal.id, dealId: deal.id };
  }

  async deals(query: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const where: any = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.businessId) where.businessId = query.businessId;
    const [total, items] = await Promise.all([
      this.prisma.deal.count({ where }),
      this.prisma.deal.findMany({ where, include: { customer: true, business: true, salesEmployee: { include: { team: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items.map(dealDto), total, page, pageSize);
  }

  deal(id: string) {
    return this.prisma.deal.findUnique({ where: { id }, include: { customer: true, business: true, salesEmployee: { include: { team: true } } } }).then((item) => {
      if (!item) throw new NotFoundException('Savdo topilmadi');
      return dealDto(item);
    });
  }

  createDeal(body: any) {
    return this.prisma.deal.create({
      data: {
        name: body.name,
        customerId: body.customerId || null,
        businessId: body.businessId || null,
        salesEmployeeId: body.salesEmployeeId || null,
        stage: body.stage || 'NEW',
        value: Number(body.value || 0),
        expectedCloseDate: body.expectedCloseDate || null,
      },
      include: { customer: true, business: true, salesEmployee: { include: { team: true } } },
    }).then(dealDto);
  }

  updateDeal(id: string, body: any) {
    return this.prisma.deal.update({ where: { id }, data: { ...body, value: body.value == null ? undefined : Number(body.value) }, include: { customer: true, business: true, salesEmployee: { include: { team: true } } } }).then(dealDto);
  }

  async dealItems(dealId: string) {
    const items = await this.prisma.dealItem.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } });
    return { items: items.map(dealItemDto), total: items.length };
  }

  async createDealItem(dealId: string, body: any) {
    const total = Math.max(0, Number(body.quantity || 0) * Number(body.unitPrice || 0) - Number(body.discount || 0));
    const item = await this.prisma.dealItem.create({ data: { dealId, product: body.product, quantity: Number(body.quantity || 1), unitPrice: Number(body.unitPrice || 0), discount: Number(body.discount || 0), total } });
    await this.syncDealValue(dealId);
    return dealItemDto(item);
  }

  async updateDealItem(dealId: string, itemId: string, body: any) {
    const current = await this.prisma.dealItem.findUniqueOrThrow({ where: { id: itemId } });
    const quantity = body.quantity == null ? current.quantity : Number(body.quantity);
    const unitPrice = body.unitPrice == null ? toNumber(current.unitPrice) : Number(body.unitPrice);
    const discount = body.discount == null ? toNumber(current.discount) : Number(body.discount);
    const item = await this.prisma.dealItem.update({ where: { id: itemId }, data: { ...body, quantity, unitPrice, discount, total: Math.max(0, quantity * unitPrice - discount) } });
    await this.syncDealValue(dealId);
    return dealItemDto(item);
  }

  async deleteDealItem(dealId: string, itemId: string) {
    await this.prisma.dealItem.delete({ where: { id: itemId } });
    await this.syncDealValue(dealId);
    return { ok: true };
  }

  async payments(query: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const where: any = {};
    if (query.dealId) where.dealId = query.dealId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.businessId) where.businessId = query.businessId;
    if (query.status) where.status = query.status;
    const [total, items] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({ where, include: { deal: true, employee: { include: { team: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items.map(paymentDto), total, page, pageSize);
  }

  async payment(id: string) {
    const item = await this.prisma.payment.findUnique({ where: { id }, include: { deal: true, employee: { include: { team: true } } } });
    if (!item) throw new NotFoundException("To'lov topilmadi");
    return paymentDto(item);
  }

  async createPayment(body: any, user: any) {
    const deal = await this.prisma.deal.findUnique({ where: { id: body.dealId }, include: { customer: true, business: true } });
    if (!deal) throw new NotFoundException('Savdo topilmadi');
    const payment = await this.prisma.payment.create({
      data: {
        dealId: deal.id,
        customerId: deal.customerId,
        businessId: deal.businessId,
        employeeId: user.id,
        amount: Number(body.amount || 0),
        method: body.method || 'CASH',
        status: body.status || 'PAID',
        date: body.date || new Date().toISOString().slice(0, 10),
        notes: body.notes || null,
      },
      include: { deal: true, employee: { include: { team: true } } },
    });
    return paymentDto(payment);
  }

  async installations(query: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const where: any = {};
    if (query.dealId) where.dealId = query.dealId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.businessId) where.businessId = query.businessId;
    if (query.status) where.status = query.status;
    const [total, items] = await Promise.all([
      this.prisma.installation.count({ where }),
      this.prisma.installation.findMany({ where, include: { customer: true, business: true, deal: true, assignedEmployee: { include: { team: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items.map(installationDto), total, page, pageSize);
  }

  async installation(id: string) {
    const item = await this.prisma.installation.findUnique({
      where: { id },
      include: { customer: true, business: true, deal: true, assignedEmployee: { include: { team: true } } },
    });
    if (!item) throw new NotFoundException("O'rnatish topilmadi");
    return installationDto(item);
  }

  createInstallation(body: any) {
    return this.prisma.installation.create({ data: body, include: { customer: true, business: true, deal: true, assignedEmployee: { include: { team: true } } } }).then(installationDto);
  }

  updateInstallation(id: string, body: any) {
    return this.prisma.installation.update({ where: { id }, data: body, include: { customer: true, business: true, deal: true, assignedEmployee: { include: { team: true } } } }).then(installationDto);
  }

  async messages(customerId: string) {
    const items = await this.prisma.message.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' } });
    return { items, total: items.length };
  }

  createMessage(body: any, user: any) {
    return this.prisma.message.create({ data: { customerId: body.customerId, text: body.text, senderType: 'employee', senderName: user.name } });
  }

  async search(q: string) {
    const term = q.trim();
    if (!term) return { items: [] };
    const customers = await this.prisma.customer.findMany({ where: { deletedAt: null, name: { contains: term, mode: 'insensitive' } }, take: 8 });
    const businesses = await this.prisma.business.findMany({ where: { name: { contains: term, mode: 'insensitive' } }, take: 8 });
    const deals = await this.prisma.deal.findMany({ where: { name: { contains: term, mode: 'insensitive' } }, take: 8 });
    return { items: [...customers.map((c) => ({ type: 'customer', id: c.id, label: c.name })), ...businesses.map((b) => ({ type: 'business', id: b.id, label: b.name })), ...deals.map((d) => ({ type: 'deal', id: d.id, label: d.name }))] };
  }

  async syncDealValue(dealId: string) {
    const items = await this.prisma.dealItem.findMany({ where: { dealId } });
    if (!items.length) return;
    await this.prisma.deal.update({ where: { id: dealId }, data: { value: items.reduce((sum, item) => sum + toNumber(item.total), 0) } });
  }

  async activities(query: any, user: any) {
    const where: any = {};
    if (query.customerId) {
      await this.ensureCustomerAccessible(query.customerId, user);
      where.customerId = query.customerId;
    }
    const items = await this.prisma.activity.findMany({
      where,
      include: { createdBy: { include: { team: true } }, customer: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return { items: items.map((item) => this.activityDto(item)), total: items.length };
  }

  async activity(id: string, user: any) {
    const item = await this.prisma.activity.findUnique({ where: { id }, include: { createdBy: { include: { team: true } }, customer: true } });
    if (!item) throw new NotFoundException('Faoliyat topilmadi');
    if (item.customerId) await this.ensureCustomerAccessible(item.customerId, user);
    return this.activityDto(item);
  }

  async createActivity(body: any, user: any) {
    if (body.customerId) await this.ensureCustomerAccessible(body.customerId, user);
    const item = await this.prisma.activity.create({
      data: {
        type: body.type || 'CALL',
        title: body.title || 'Faoliyat',
        description: body.description || null,
        date: body.date || new Date().toISOString(),
        duration: body.duration === '' || body.duration == null ? null : Number(body.duration),
        result: body.result || null,
        nextAction: body.nextAction || null,
        customerId: body.customerId || null,
        createdById: user.id,
      },
      include: { createdBy: { include: { team: true } }, customer: true },
    });
    return this.activityDto(item);
  }

  async reminders(query: any, user: any) {
    const where: any = {};
    if (query.customerId) {
      await this.ensureCustomerAccessible(query.customerId, user);
      where.customerId = query.customerId;
    }
    const items = await this.prisma.reminder.findMany({ where, orderBy: { remindAt: 'asc' }, include: { customer: true } });
    return { items, total: items.length };
  }

  async createReminder(body: any, user: any) {
    if (body.customerId) await this.ensureCustomerAccessible(body.customerId, user);
    const remindAt = body.remindAt ? new Date(body.remindAt) : null;
    const item = await this.prisma.reminder.create({
      data: {
        title: body.title || 'Mijoz bilan bog\'lanish',
        note: body.note || body.description || null,
        remindAt: remindAt && !Number.isNaN(remindAt.getTime()) ? remindAt : null,
        customerId: body.customerId || null,
        createdById: user.id,
      },
      include: { customer: true },
    });
    return item;
  }

  async comments(query: any, user: any) {
    if (query.entityType === 'customer' && query.entityId) await this.ensureCustomerAccessible(query.entityId, user);
    const items = await this.prisma.comment.findMany({
      where: { entityType: query.entityType, entityId: query.entityId },
      include: { author: true },
      orderBy: { createdAt: 'asc' },
    });
    return { items: items.map((item) => this.commentDto(item)), total: items.length };
  }

  async createComment(body: any, user: any) {
    if (body.entityType === 'customer' && body.entityId) await this.ensureCustomerAccessible(body.entityId, user);
    const item = await this.prisma.comment.create({
      data: { entityType: body.entityType, entityId: body.entityId, text: body.text, authorId: user.id },
      include: { author: true },
    });
    return this.commentDto(item);
  }

  async updateComment(id: string, body: any, user: any) {
    const current = await this.prisma.comment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Izoh topilmadi');
    if (current.authorId !== user.id && !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) throw new ForbiddenException('Bu izohni tahrirlashga ruxsat yoq');
    return this.prisma.comment.update({ where: { id }, data: { text: body.text }, include: { author: true } }).then((item) => this.commentDto(item));
  }

  async deleteComment(id: string, user: any) {
    const current = await this.prisma.comment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Izoh topilmadi');
    if (current.authorId !== user.id && !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) throw new ForbiddenException('Bu izohni o\'chirishga ruxsat yoq');
    await this.prisma.comment.delete({ where: { id } });
    return { ok: true };
  }

  async timeline(query: any, user: any) {
    if (query.entityType === 'customer') await this.ensureCustomerAccessible(query.entityId, user);
    const [activities, comments] = await Promise.all([
      this.prisma.activity.findMany({ where: { customerId: query.entityId }, include: { createdBy: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.comment.findMany({ where: { entityType: query.entityType, entityId: query.entityId }, include: { author: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    const items = [
      ...activities.map((item) => this.activityDto(item)),
      ...comments.map((item) => ({ ...this.commentDto(item), type: 'NOTE', title: 'Izoh', employeeName: item.author?.name })),
    ].sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
    return { items, total: items.length };
  }

  private activityDto(item: any) {
    const { createdBy, customer, ...rest } = item;
    return { ...rest, employeeName: createdBy?.name, customer: customer ? { id: customer.id, name: customer.name } : null };
  }

  private commentDto(item: any) {
    const { author, ...rest } = item;
    return { ...rest, author: author ? { id: author.id, name: author.name, avatarUrl: author.avatarUrl } : null };
  }

  private async ensureCustomerAccessible(id: string, user: any) {
    const customer = await this.prisma.customer.findFirst({ where: { id, deletedAt: null }, include: { groups: true } });
    if (!customer) throw new NotFoundException('Mijoz topilmadi');
    if (!user || ['SUPER_ADMIN', 'ADMIN'].includes(user.role) || user.customerScope === 'ALL' || user.permissions?.includes('customers.viewAll')) return;
    if (user.customerScope === 'GROUPS' || user.permissions?.includes('customers.viewGroups')) {
      const allowed = (user.allowedCustomerGroups || []).map((item: any) => item.groupId);
      if (!customer.groups.some((group: any) => allowed.includes(group.id))) throw new ForbiddenException('Bu mijozni ko\'rishga ruxsat yoq');
      return;
    }
    if (customer.assignedEmployeeId !== user.id) throw new ForbiddenException('Bu mijozni ko\'rishga ruxsat yoq');
  }
}
