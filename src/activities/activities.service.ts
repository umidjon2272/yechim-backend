import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { paged, pagination } from '../common/pagination';
import { customerScopeWhere, isAdmin, isPartner } from '../common/access';
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
    if (!this.canViewComments(user)) where.type = { not: 'NOTE' };
    if (query.type && (this.canViewComments(user) || query.type !== 'NOTE')) where.type = query.type;
    const [total, items] = await Promise.all([
      this.prisma.activity.count({ where }),
      this.prisma.activity.findMany({ where, include: { createdBy: { include: { team: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items.map((item) => this.dto(item, user)), total, page, pageSize);
  }

  async get(id: string, user: any) {
    if (this.isPartner(user)) throw new ForbiddenException('Partner ichki tarixni ko\'ra olmaydi');
    const item = await this.prisma.activity.findUnique({ where: { id }, include: { createdBy: { include: { team: true } } } });
    if (!item) throw new NotFoundException('Faoliyat topilmadi');
    if (item.type === 'NOTE' && !this.canViewComments(user)) throw new ForbiddenException('Izohlarni ko\'rishga ruxsat yo\'q');
    await this.ensureCustomerAccess(item.customerId, user);
    return this.dto(item, user);
  }

  async create(body: any, user: any) {
    const customerId = String(body.customerId || '').trim();
    if (!customerId) throw new NotFoundException('Mijoz tanlanmagan');
    const type = String(body.type || 'NOTE').toUpperCase();
    const requiredPermission = type === 'NOTE' ? 'comments.create' : ['CALL', 'FOLLOW_UP'].includes(type) ? 'calls.create' : 'activities.create';
    if (!this.isAdmin(user) && !user?.permissions?.includes(requiredPermission)) {
      throw new ForbiddenException('Bu faoliyat turini yaratishga ruxsat yo\'q');
    }
    await this.ensureCustomerAccess(customerId, user);
    const message = String(body.message || body.text || [body.title, body.description].filter(Boolean).join(': ') || '').trim();
    if (!message) throw new ForbiddenException('Izoh matni bo\'sh bo\'lishi mumkin emas');
    const item = await this.prisma.activity.create({
      data: { customerId, type, message, metadata: body.metadata || undefined, createdById: user.id },
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
      where: { customerId, ...(this.canViewComments(user) ? {} : { type: { not: 'NOTE' } }) },
      include: { createdBy: { include: { team: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { items: items.map((item) => this.dto(item, user)), total: items.length };
  }

  private dto(item: any, user?: any) {
    const canViewComments = this.canViewComments(user);
    const message = canViewComments ? item.message : String(item.message || '').replace(/\nIzoh:[\s\S]*$/i, '').trim();
    const canViewCreator = isAdmin(user)
      || item.createdById === user?.id
      || user?.permissions?.includes('customers.viewCreatedBy')
      || user?.permissions?.includes('customers.viewAll');
    const rawMetadata = canViewComments ? item.metadata || null : this.hideCommentMetadata(item.metadata);
    const metadata = item.type === 'CUSTOMER_CREATED' && !canViewCreator && rawMetadata && typeof rawMetadata === 'object'
      ? (() => { const { createdById: _createdById, createdByName: _createdByName, ...safe } = rawMetadata; return safe; })()
      : rawMetadata;
    const employeeName = item.type === 'CUSTOMER_CREATED'
      ? canViewCreator ? item.createdBy?.name || item.metadata?.createdByName || null : null
      : item.createdBy?.name || null;
    return {
      id: item.id,
      type: item.type,
      title: item.type === 'CUSTOMER_CREATED' ? null : item.type,
      description: message,
      message,
      text: message,
      date: item.createdAt,
      createdAt: item.createdAt,
      employeeName,
      author: item.createdBy ? { id: item.createdBy.id, name: item.createdBy.name, avatarUrl: item.createdBy.avatarUrl } : null,
      metadata,
    };
  }

  private async ensureCustomerAccess(customerId: string, user: any) {
    const role = String(user?.role || '').toUpperCase();
    const canViewAll = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role) || user.permissions?.includes('customers.viewAll');
    if (role === 'PARTNER' && !user?.partnerGroupId) throw new ForbiddenException('Partner guruhi biriktirilmagan');
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        deletedAt: null,
        ...(canViewAll ? {} : customerScopeWhere(user)),
      },
      select: { id: true },
    });
    if (!customer) throw new ForbiddenException('Bu mijoz ma\'lumotlarini ko\'rishga ruxsat yo\'q');
  }

  private isPartner(user: any) {
    return isPartner(user);
  }

  private canViewComments(user: any) {
    return ['ADMIN', 'SUPER_ADMIN'].includes(String(user?.role || '').toUpperCase()) || user?.permissions?.includes('comments.view');
  }

  private isAdmin(user: any) {
    return isAdmin(user);
  }

  private hideCommentMetadata(metadata: any) {
    if (!metadata || typeof metadata !== 'object') return metadata || null;
    const { note: _note, description: _description, ...safe } = metadata;
    return safe;
  }
}
