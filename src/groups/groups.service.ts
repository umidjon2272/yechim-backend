import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { toNumber } from '../common/mappers';
import { pagination, paged } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any, actor?: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const search = String(query.search || '').trim();
    const partnerGroupId = this.partnerGroupId(actor);
    const where: any = search ? { name: { contains: search, mode: 'insensitive' as const } } : {};
    if (partnerGroupId) where.id = partnerGroupId;
    const [total, items] = await Promise.all([
      this.prisma.customerGroup.count({ where }),
      this.prisma.customerGroup.findMany({ where, include: { partnerUsers: { select: { id: true, name: true, username: true, status: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items.map((item) => this.dto(item, Boolean(partnerGroupId))), total, page, pageSize);
  }

  create(body: any) {
    return this.prisma.customerGroup.create({ data: { name: String(body.name || '').trim(), partnerRewardPerCustomer: this.optionalNumber(body.partnerRewardPerCustomer) } }).then((item) => this.dto(item));
  }

  update(id: string, body: any) {
    return this.prisma.customerGroup
      .update({ where: { id }, data: { name: body.name === undefined ? undefined : String(body.name).trim(), partnerRewardPerCustomer: body.partnerRewardPerCustomer === undefined ? undefined : this.optionalNumber(body.partnerRewardPerCustomer) } })
      .then((item) => this.dto(item));
  }

  async remove(id: string) {
    const group = await this.prisma.customerGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    await this.prisma.customerGroup.delete({ where: { id } });
    return { ok: true };
  }

  async partnerSummary(id: string, query: any, actor?: any) {
    const partnerGroupId = this.partnerGroupId(actor);
    if (partnerGroupId && partnerGroupId !== id) throw new ForbiddenException('Faqat o\'zingizga biriktirilgan guruhni ko\'rishingiz mumkin');
    const group = await this.prisma.customerGroup.findUnique({ where: { id }, include: { partnerUsers: { select: { id: true, name: true, username: true, status: true } } } });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    const period = this.normalizePeriod(query.period);
    const { start, end } = this.periodBounds(period);
    const [newCustomers, rewards, historyRows] = await Promise.all([
      this.prisma.customer.count({ where: { deletedAt: null, createdAt: { gte: start, lt: end }, groups: { some: { id } } } }),
      this.prisma.partnerReward.findMany({ where: { groupId: id, period }, include: { customer: { select: { id: true, name: true, phone: true, stageId: true } } }, orderBy: { completedAt: 'asc' } }),
      this.prisma.partnerReward.findMany({ where: { groupId: id }, select: { period: true, amount: true }, orderBy: { period: 'desc' } }),
    ]);
    const historyMap = new Map<string, { period: string; completedCustomers: number; payableAmount: number }>();
    historyRows.forEach((row) => {
      const current = historyMap.get(row.period) || { period: row.period, completedCustomers: 0, payableAmount: 0 };
      current.completedCustomers += 1;
      current.payableAmount += toNumber(row.amount);
      historyMap.set(row.period, current);
    });
    return {
      group: this.dto(group, Boolean(partnerGroupId)),
      period,
      newCustomers,
      completedCustomers: rewards.length,
      payableAmount: rewards.reduce((sum, reward) => sum + toNumber(reward.amount), 0),
      completed: rewards.map((reward) => ({ ...reward.customer, completedAt: reward.completedAt, amount: toNumber(reward.amount) })),
      history: [...historyMap.values()],
    };
  }

  private dto(item: any, partner = false) {
    if (!item) return null;
    if (partner) {
      return {
        id: item.id,
        name: item.name,
        partnerRewardPerCustomer: item.partnerRewardPerCustomer == null ? 0 : toNumber(item.partnerRewardPerCustomer),
      };
    }
    return {
      ...item,
      partnerRewardPerCustomer: item.partnerRewardPerCustomer == null ? 0 : toNumber(item.partnerRewardPerCustomer),
      partnerUsers: item.partnerUsers || [],
    };
  }

  private partnerGroupId(actor?: any) {
    if (!actor?.partnerGroupId || ['SUPER_ADMIN', 'ADMIN'].includes(actor.role)) return null;
    return actor.partnerGroupId;
  }

  private optionalNumber(value: any) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  private normalizePeriod(value: any) {
    const candidate = String(value || '');
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(candidate)) return candidate;
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private periodBounds(period: string) {
    const [year, month] = period.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    return { start, end: new Date(Date.UTC(year, month, 1)) };
  }
}
