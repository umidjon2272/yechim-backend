import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { installationDto } from '../common/mappers';
import { canViewFinancials, customerScopeWhere, isPartner } from '../common/access';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstallationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any, user: any) {
    this.ensureNotPartner(user);
    const canViewAll = this.canViewAll(user);
    const where: any = {
      ...(canViewAll ? {} : { assignedEmployeeId: user.id }),
      ...(query.assignedToMe === 'true' || query.assignedToMe === true ? { assignedEmployeeId: user.id } : {}),
    };
    if (query.customerId) where.customerId = query.customerId;
    if (query.status) where.status = query.status;
    if (query.assignedEmployeeId && canViewAll) where.assignedEmployeeId = query.assignedEmployeeId;
    const rows = await this.prisma.installation.findMany({ where, include: { customer: true, business: true, deal: true, assignedEmployee: { include: { team: true } } }, orderBy: { scheduledDate: 'asc' }, take: Number(query.pageSize || 100) });
    const items = query.today === 'true' || query.today === true ? rows.filter((item) => this.isToday(item.scheduledDate)) : rows;
    return { items: items.map((item) => installationDto(item, { hideFinancials: !canViewFinancials(user) })), total: items.length };
  }

  async get(id: string, user: any) {
    this.ensureNotPartner(user);
    const item = await this.prisma.installation.findUnique({ where: { id }, include: { customer: true, business: true, deal: true, assignedEmployee: { include: { team: true } } } });
    if (!item) throw new NotFoundException('O\'rnatish topilmadi');
    if (!this.canViewAll(user) && item.assignedEmployeeId !== user.id) throw new ForbiddenException('Bu o\'rnatishga ruxsat yo\'q');
    return installationDto(item, { hideFinancials: !canViewFinancials(user) });
  }

  async create(body: any, user: any) {
    const customer = body.customerId ? await this.ensureCustomerAccess(body.customerId, user) : null;
    const assignedEmployeeId = body.assignedEmployeeId || customer?.assignedEmployeeId || user.id;
    if (!this.canViewAll(user) && assignedEmployeeId !== user.id) throw new ForbiddenException('O\'rnatishni faqat o\'zingizga biriktirishingiz mumkin');
    const item = await this.prisma.installation.create({ data: { customerId: body.customerId || null, dealId: body.dealId || null, businessId: body.businessId || null, assignedEmployeeId, address: body.address || null, scheduledDate: body.scheduledDate || body.installationAt || null, status: body.status || 'SCHEDULED', notes: body.notes || null }, include: { customer: true, business: true, deal: true, assignedEmployee: { include: { team: true } } } });
    if (item.customerId) await this.prisma.activity.create({ data: { customerId: item.customerId, type: 'INSTALLATION_SCHEDULED', message: `O'rnatish rejalashtirildi: ${item.scheduledDate || 'sana belgilanmagan'}`, createdById: user.id, metadata: { installationId: item.id } } });
    return installationDto(item, { hideFinancials: !canViewFinancials(user) });
  }

  async update(id: string, body: any, user: any) {
    const current: any = await this.prisma.installation.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('O\'rnatish topilmadi');
    if (!this.canViewAll(user) && current.assignedEmployeeId !== user.id) throw new ForbiddenException('Bu o\'rnatishga ruxsat yo\'q');
    const assignedEmployeeId = body.assignedEmployeeId === undefined ? undefined : body.assignedEmployeeId || null;
    if (!this.canViewAll(user) && assignedEmployeeId && assignedEmployeeId !== user.id) throw new ForbiddenException('O\'rnatishni boshqa xodimga biriktirishga ruxsat yo\'q');
    const item = await this.prisma.installation.update({ where: { id }, data: { assignedEmployeeId, scheduledDate: body.scheduledDate, startedDate: body.startedDate, completedDate: body.completedDate, status: body.status, notes: body.notes }, include: { customer: true, business: true, deal: true, assignedEmployee: { include: { team: true } } } });
    return installationDto(item, { hideFinancials: !canViewFinancials(user) });
  }

  private canViewAll(user: any) {
    return ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(String(user?.role || '').toUpperCase()) || user.permissions?.includes('installations.viewAll');
  }

  private ensureNotPartner(user: any) {
    if (isPartner(user)) {
      throw new ForbiddenException('Partner o\'rnatish ma\'lumotlarini ko\'ra olmaydi');
    }
  }

  private async ensureCustomerAccess(customerId: string, user: any) {
    const customer: any = await this.prisma.customer.findFirst({ where: { AND: [{ id: customerId, deletedAt: null }, this.canViewAll(user) ? {} : customerScopeWhere(user)] }, select: { id: true, assignedEmployeeId: true } });
    if (!customer) throw new ForbiddenException('Bu mijoz uchun o\'rnatishga ruxsat yo\'q');
    return customer;
  }

  private isToday(value: string | null) {
    if (!value) return false;
    const date = new Date(value);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  }
}
