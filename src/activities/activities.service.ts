import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { paged, pagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any, user: any) {
    const customerId = String(query.customerId || '').trim();
    if (!customerId) return { items: [], total: 0 };
    if (this.isPartner(user)) return { items: [], total: 0 };
    await this.ensureCustomerAccess(customerId, user);
    const { page, pageSize, skip, take } = pagination(query);
    const where: any = { customerId };
    if (query.type) where.type = query.type;
    const [total, items] = await Promise.all([
      this.prisma.activity.count({ where }),
      this.prisma.activity.findMany({ where, include: { createdBy: { include: { team: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items.map((item) => this.dto(item)), total, page, pageSize);
  }

  async get(id: string, user: any) {
    if (this.isPartner(user)) throw new ForbiddenException('Partner ichki tarixni ko\'ra olmaydi');
    const item = await this.prisma.activity.findUnique({ where: { id }, include: { createdBy: { include: { team: true } } } });
    if (!item) throw new NotFoundException('Faoliyat topilmadi');
    await this.ensureCustomerAccess(item.customerId, user);
    return this.dto(item);
  }

  async create(body: any, user: any) {
    const customerId = String(body.customerId || '').trim();
    if (!customerId) throw new NotFoundException('Mijoz tanlanmagan');
    await this.ensureCustomerAccess(customerId, user);
    const message = String(body.message || body.text || [body.title, body.description].filter(Boolean).join(': ') || '').trim();
    if (!message) throw new ForbiddenException('Izoh matni bo\'sh bo\'lishi mumkin emas');
    const item = await this.prisma.activity.create({
      data: { customerId, type: body.type || 'NOTE', message, metadata: body.metadata || undefined, createdById: user.id },
      include: { createdBy: { include: { team: true } } },
    });
    return this.dto(item);
  }

  async remove(id: string, user: any) {
    const item = await this.prisma.activity.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Faoliyat topilmadi');
    await this.ensureCustomerAccess(item.customerId, user);
    const canDelete = ['SUPER_ADMIN', 'ADMIN'].includes(String(user?.role || '').toUpperCase()) || item.createdById === user.id;
    if (!canDelete) throw new ForbiddenException('Bu izohni o\'chirishga ruxsat yo\'q');
    await this.prisma.activity.delete({ where: { id } });
    return { ok: true };
  }

  async comments(query: any, user: any) {
    return this.list({ ...query, type: 'NOTE' }, user);
  }

  async timeline(customerId: string, user: any) {
    if (this.isPartner(user)) return { items: [], total: 0 };
    await this.ensureCustomerAccess(customerId, user);
    const items = await this.prisma.activity.findMany({
      where: { customerId },
      include: { createdBy: { include: { team: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { items: items.map((item) => this.dto(item)), total: items.length };
  }

  private dto(item: any) {
    return {
      id: item.id,
      type: item.type,
      title: item.type,
      description: item.message,
      message: item.message,
      date: item.createdAt,
      createdAt: item.createdAt,
      employeeName: item.createdBy?.name || null,
      author: item.createdBy ? { id: item.createdBy.id, name: item.createdBy.name, avatarUrl: item.createdBy.avatarUrl } : null,
      metadata: item.metadata || null,
    };
  }

  private async ensureCustomerAccess(customerId: string, user: any) {
    const role = String(user?.role || '').toUpperCase();
    const canViewAll = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role) || user.permissions?.includes('customers.viewAll');
    const isPartner = Boolean(user.partnerGroupId) && !['SUPER_ADMIN', 'ADMIN'].includes(role);
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        deletedAt: null,
        ...(canViewAll ? {} : isPartner ? { groups: { some: { id: user.partnerGroupId } } } : { assignedEmployeeId: user.id }),
      },
      select: { id: true },
    });
    if (!customer) throw new ForbiddenException('Bu mijoz ma\'lumotlarini ko\'rishga ruxsat yo\'q');
  }

  private isPartner(user: any) {
    return Boolean(user?.partnerGroupId) && !['SUPER_ADMIN', 'ADMIN'].includes(String(user?.role || '').toUpperCase());
  }
}
