import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DEFAULT_PIPELINE_NAME } from '../common/defaults';
import { customerDto, uniqueConflict } from '../common/mappers';
import { paged, pagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

const includeCustomer = {
  assignedEmployee: { include: { team: true } },
  groups: true,
  businesses: true,
} as const;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any) {
    const { page, pageSize } = pagination(query);
    const search = String(query.search || '').trim().toLowerCase();
    const baseWhere: any = { deletedAt: null };
    if (query.status) baseWhere.status = query.status;
    if (query.stage) baseWhere.stageId = query.stage;
    if (query.assignedEmployeeId) baseWhere.assignedEmployeeId = query.assignedEmployeeId;
    if (query.groupId) baseWhere.groups = { some: { id: query.groupId } };
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
    if (query.program) customers = customers.filter((c) => Array.isArray(c.programs) && c.programs.some((p: any) => p.name === query.program));
    const sort = String(query.sort || '-createdAt');
    customers.sort((a: any, b: any) => {
      const key = sort.replace('-', '');
      const av = key === 'name' ? a.name : new Date(a.createdAt).getTime();
      const bv = key === 'name' ? b.name : new Date(b.createdAt).getTime();
      return sort.startsWith('-') ? (av < bv ? 1 : -1) : av > bv ? 1 : -1;
    });
    const start = (page - 1) * pageSize;
    return paged(customers.slice(start, start + pageSize).map(customerDto), customers.length, page, pageSize);
  }

  async get(id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, deletedAt: null }, include: includeCustomer });
    if (!customer) throw new NotFoundException('Mijoz topilmadi');
    return customerDto(customer);
  }

  async create(body: any) {
    const pipeline = await this.defaultPipeline();
    const stageId = body.stageId || body.stage || 'NEW';
    await this.ensureStage(stageId);
    const programs = this.normalizePrograms(body.programs);
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
          amount: Number(body.amount || 0),
          notes: body.notes || body.note || null,
          note: body.note || body.notes || null,
          address: body.address || {},
          birthDate: body.birthDate || null,
          telegramUsername: body.telegramUsername || null,
          instagram: body.instagram || null,
          source: body.source || null,
          customFields: body.customFields || {},
          programs,
          status: body.status || 'active',
          pipelineId: body.pipelineId || pipeline.id,
          stageId,
          assignedEmployeeId: body.assignedEmployeeId || null,
          groups: Array.isArray(body.groupIds) ? { connect: body.groupIds.map((id: string) => ({ id })) } : undefined,
        },
        include: includeCustomer,
      });
      return customerDto(customer);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Email yoki telefon allaqachon mavjud');
      throw error;
    }
  }

  async update(id: string, body: any) {
    await this.get(id);
    if (body.stage || body.stageId) await this.ensureStage(body.stageId || body.stage);
    const data: any = {
      name: body.name,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone || null,
      phone2: body.phone2,
      telegram: body.telegram,
      email: body.email || null,
      service: body.service,
      amount: body.amount == null ? undefined : Number(body.amount),
      notes: body.notes ?? body.note,
      note: body.note ?? body.notes,
      address: body.address,
      birthDate: body.birthDate,
      telegramUsername: body.telegramUsername,
      instagram: body.instagram,
      source: body.source,
      customFields: body.customFields,
      programs: body.programs ? this.normalizePrograms(body.programs) : undefined,
      status: body.status,
      stageId: body.stageId || body.stage,
      assignedEmployeeId: body.assignedEmployeeId === '' ? null : body.assignedEmployeeId,
    };
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    try {
      const customer = await this.prisma.customer.update({ where: { id }, data, include: includeCustomer });
      return customerDto(customer);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Email yoki telefon allaqachon mavjud');
      throw error;
    }
  }

  async softDelete(id: string) {
    await this.get(id);
    const customer = await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date(), status: 'inactive' }, include: includeCustomer });
    return customerDto(customer);
  }

  async deactivate(id: string) {
    const current: any = await this.get(id);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { status: current.status === 'active' ? 'inactive' : 'active' },
      include: includeCustomer,
    });
    return customerDto(customer);
  }

  async setStage(id: string, stage: string) {
    await this.ensureStage(stage);
    const customer = await this.prisma.customer.update({ where: { id }, data: { stageId: stage }, include: includeCustomer });
    return customerDto(customer);
  }

  async setGroups(id: string, groupIds: string[]) {
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { groups: { set: groupIds.map((groupId) => ({ id: groupId })) } },
      include: includeCustomer,
    });
    return customerDto(customer);
  }

  async bulkMove(body: any) {
    if (!Array.isArray(body.customerIds) || !body.customerIds.length) return { ok: true };
    if (body.stage) await this.ensureStage(body.stage);
    await this.prisma.$transaction(
      body.customerIds.map((id: string) =>
        this.prisma.customer.update({
          where: { id },
          data: {
            ...(body.stage ? { stageId: body.stage } : {}),
            ...(body.targetGroupId ? { groups: { connect: { id: body.targetGroupId } } } : {}),
          },
        }),
      ),
    );
    return { ok: true };
  }

  async programs(id: string) {
    const customer: any = await this.get(id);
    return { items: customer.programs || [], total: customer.programs?.length || 0 };
  }

  async addProgram(id: string, body: any) {
    const current: any = await this.get(id);
    return this.update(id, { programs: [...(current.programs || []), { id: randomUUID(), status: 'NEW', createdAt: new Date().toISOString(), ...body }] });
  }

  async updateProgram(id: string, programId: string, body: any) {
    const current: any = await this.get(id);
    return this.update(id, { programs: (current.programs || []).map((p: any) => (p.id === programId ? { ...p, ...body } : p)) });
  }

  async removeProgram(id: string, programId: string) {
    const current: any = await this.get(id);
    return this.update(id, { programs: (current.programs || []).filter((p: any) => p.id !== programId) });
  }

  async filterOptions() {
    const customers = await this.prisma.customer.findMany({ where: { deletedAt: null } });
    const cities = new Set<string>();
    const programs = new Set<string>();
    const stageCounts: Record<string, number> = {};
    customers.forEach((c) => {
      const city = (c.address as any)?.city;
      if (city) cities.add(city);
      if (Array.isArray(c.programs)) c.programs.forEach((p: any) => p.name && programs.add(p.name));
      stageCounts[c.stageId] = (stageCounts[c.stageId] || 0) + 1;
    });
    return { cities: [...cities], programs: [...programs], stageCounts };
  }

  private normalizePrograms(programs: any[]) {
    if (!Array.isArray(programs)) return [];
    return programs.map((p) => ({ id: p.id || randomUUID(), status: p.status || 'NEW', createdAt: p.createdAt || new Date().toISOString(), ...p }));
  }

  private async defaultPipeline() {
    return this.prisma.pipeline.findFirstOrThrow({ where: { name: DEFAULT_PIPELINE_NAME } });
  }

  private async ensureStage(stageId: string) {
    const stage = await this.prisma.stage.findUnique({ where: { id: stageId } });
    if (!stage) throw new NotFoundException('Bosqich topilmadi');
    return stage;
  }
}
