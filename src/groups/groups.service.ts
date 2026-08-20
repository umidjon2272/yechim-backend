import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { toNumber } from '../common/mappers';
import { isAdmin, partnerGroupIdOf } from '../common/access';
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
    else if (String(actor?.role || '').toUpperCase() === 'EMPLOYEE' && String(actor?.customerVisibility || '').toUpperCase() === 'GROUPS') {
      const allowedGroupIds = Array.isArray(actor?.allowedGroupIds)
        ? actor.allowedGroupIds
        : Array.isArray(actor?.allowedGroups) ? actor.allowedGroups.map((item: any) => item.groupId || item.group?.id).filter(Boolean) : [];
      where.id = { in: allowedGroupIds };
    }
    const [total, items] = await Promise.all([
      this.prisma.customerGroup.count({ where }),
      this.prisma.customerGroup.findMany({ where, include: { partnerUsers: { select: { id: true, name: true, username: true, status: true } }, rewardStage: true }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items.map((item) => this.dto(item, Boolean(partnerGroupId))), total, page, pageSize);
  }

  async create(body: any, actor?: any) {
    if (!isAdmin(actor)) throw new ForbiddenException('Guruh reward sozlamalarini faqat admin boshqaradi');
    const rewardStageId = await this.resolveRewardStageId(body.rewardStageId);
    const item = await this.prisma.customerGroup.create({ data: { name: String(body.name || '').trim(), partnerRewardPerCustomer: this.optionalNumber(body.partnerRewardPerCustomer), rewardStageId } });
    return this.dto(item);
  }

  async update(id: string, body: any, actor?: any) {
    if (!isAdmin(actor)) throw new ForbiddenException('Guruh reward sozlamalarini faqat admin boshqaradi');
    const item = await this.prisma.customerGroup.update({ where: { id }, data: { name: body.name === undefined ? undefined : String(body.name).trim(), partnerRewardPerCustomer: body.partnerRewardPerCustomer === undefined ? undefined : this.optionalNumber(body.partnerRewardPerCustomer), rewardStageId: body.rewardStageId === undefined ? undefined : await this.resolveRewardStageId(body.rewardStageId) } });
    return this.dto(item);
  }

  async remove(id: string, actor?: any) {
    if (!isAdmin(actor)) throw new ForbiddenException('Guruhni faqat admin boshqarishi mumkin');
    const group = await this.prisma.customerGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    await this.prisma.customerGroup.delete({ where: { id } });
    return { ok: true };
  }

  async partnerSummary(id: string, query: any, actor?: any) {
    if (!isAdmin(actor) && !this.isPartner(actor)) throw new ForbiddenException('Partner hisoboti faqat Partner yoki admin uchun');
    const partnerGroupId = this.partnerGroupId(actor);
    if (partnerGroupId && partnerGroupId !== id) throw new ForbiddenException('Faqat o\'zingizga biriktirilgan guruhni ko\'rishingiz mumkin');
    const group = await this.prisma.customerGroup.findUnique({ where: { id }, include: { partnerUsers: { select: { id: true, name: true, username: true, status: true } }, rewardStage: true } });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    const range = this.resolveRange(query);
    const period = range.period;
    const [newCustomers, rewards, historyRows] = await Promise.all([
      this.prisma.customer.count({ where: { deletedAt: null, createdAt: { gte: range.start, lt: range.end }, groups: { some: { id } } } }),
      this.prisma.partnerReward.findMany({ where: { groupId: id, completedAt: { gte: range.start, lt: range.end } }, include: { customer: { select: { id: true, name: true, phone: true, stageId: true } } }, orderBy: { completedAt: 'asc' } }),
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
      from: range.start.toISOString(),
      to: new Date(range.end.getTime() - 1).toISOString(),
      newCustomers,
      completedCustomers: rewards.length,
      rewardedCustomers: rewards.length,
      payableAmount: rewards.reduce((sum, reward) => sum + toNumber(reward.amount), 0),
      totalReward: rewards.reduce((sum, reward) => sum + toNumber(reward.amount), 0),
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
        rewardStageId: item.rewardStageId || null,
      };
    }
    return {
      ...item,
      partnerRewardPerCustomer: item.partnerRewardPerCustomer == null ? 0 : toNumber(item.partnerRewardPerCustomer),
      rewardStageId: item.rewardStageId || null,
      rewardStage: item.rewardStage ? { id: item.rewardStage.id, label: item.rewardStage.label } : null,
      partnerUsers: item.partnerUsers || [],
    };
  }

  private partnerGroupId(actor?: any) {
    return partnerGroupIdOf(actor);
  }

  private isPartner(actor?: any) {
    return String(actor?.role || '').toUpperCase() === 'PARTNER' && Boolean(actor?.partnerGroupId);
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

  private async resolveRewardStageId(value: any) {
    if (value === null || value === '') return null;
    if (value !== undefined) {
      const stage = await this.prisma.stage.findUnique({ where: { id: String(value) }, select: { id: true } });
      if (!stage) throw new NotFoundException('Mukofot bosqichi topilmadi');
      return stage.id;
    }
    const stage = await this.prisma.stage.findFirst({ where: { isFinal: true }, orderBy: { order: 'asc' }, select: { id: true } });
    return stage?.id || null;
  }

  private resolveRange(query: any) {
    const requestedPeriod = String(query.period || '').trim();
    if (!query.from && !query.to && requestedPeriod && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedPeriod)) {
      const { start, end } = this.periodBounds(requestedPeriod);
      return { start, end, period: requestedPeriod };
    }
    const preset = String(query.range || '').toLowerCase();
    const now = new Date();
    if (preset === 'today') {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      return { start, end: new Date(start.getTime() + 86400000), period: requestedPeriod || this.periodKey(start) };
    }
    if (preset === '7d' || preset === '7days') return this.daysRange(7, now, requestedPeriod);
    if (preset === '30d' || preset === '30days') return this.daysRange(30, now, requestedPeriod);
    if (preset === 'previousmonth' || preset === 'lastmonth') {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      return { start, end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), period: this.periodKey(start) };
    }
    if (preset === 'currentmonth' || preset === 'month' || !query.from && !query.to) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { start, end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)), period: this.periodKey(start) };
    }
    const start = this.dateStart(query.from) || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endInput = this.dateStart(query.to) || start;
    const end = new Date(endInput.getTime() + 86400000);
    return { start, end, period: `${query.from || this.formatDate(start)}..${query.to || this.formatDate(endInput)}` };
  }

  private daysRange(days: number, now: Date, period?: string) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return { start: new Date(end.getTime() - days * 86400000), end, period: period || this.periodKey(new Date(end.getTime() - days * 86400000)) };
  }

  private dateStart(value: any) {
    if (!value) return null;
    const match = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value).split('-').map(Number) : null;
    if (!match) return null;
    return new Date(Date.UTC(match[0], match[1] - 1, match[2]));
  }

  private periodKey(value: Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

}
