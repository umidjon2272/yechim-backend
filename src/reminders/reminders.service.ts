import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any, user: any) {
    const where: any = { status: 'PENDING' as any };
    if (!this.canViewAll(user)) where.assignedUserId = user.id;
    if (query.customerId) {
      await this.ensureCustomerAccess(query.customerId, user);
      where.customerId = query.customerId;
    }
    const bounds = this.dayBounds();
    if (query.overdue === 'true' || query.overdue === true) where.remindAt = { lt: bounds.start };
    else if (query.today === 'true' || query.today === true) where.remindAt = { lt: bounds.end };
    const items = await this.prisma.reminder.findMany({
      where,
      include: { customer: { include: { stage: true, assignedEmployee: true } }, assignedUser: true },
      orderBy: { remindAt: 'asc' },
      take: Number(query.limit || 100),
    });
    return { items: items.map((item) => this.dto(item)), total: items.length };
  }

  async create(body: any, user: any) {
    const customerId = String(body.customerId || '').trim();
    if (!customerId) throw new NotFoundException('Mijoz tanlanmagan');
    const customer: any = await this.ensureCustomerAccess(customerId, user);
    const remindAt = this.toDate(body.remindAt);
    const assignedUserId = body.assignedUserId || customer.assignedEmployeeId || user.id;
    if (!this.canViewAll(user) && assignedUserId !== user.id) throw new ForbiddenException('Eslatmani faqat ozingizga biriktirishingiz mumkin');
    await this.cancelNextContactReminders(customerId);
    const item = await this.prisma.reminder.create({
      data: {
        customerId,
        assignedUserId,
        createdById: user.id,
        type: body.type || 'CALL',
        title: body.title || (body.type === 'REPEAT_SALE' ? `${customer.name} uchun qayta sotuv eslatmasi` : `${customer.name}ga qo'ng'iroq qilish`),
        remindAt,
      },
      include: { customer: true, assignedUser: true },
    });
    await this.prisma.customer.update({ where: { id: customerId }, data: { nextContactAt: remindAt } });
    await this.activity(customerId, 'REMINDER_CREATED', `Eslatma rejalashtirildi: ${remindAt.toISOString()}`, user.id, { reminderId: item.id, type: item.type });
    return this.dto(item);
  }

  async complete(id: string, user: any) {
    const current: any = await this.findOwned(id, user);
    if (current.status !== 'PENDING') return this.dto(current);
    const completedAt = new Date();
    const item = await this.prisma.reminder.update({ where: { id }, data: { status: 'COMPLETED' as any, completedAt }, include: { customer: true, assignedUser: true } });
    const customerUpdate: any = { lastContactAt: completedAt };
    if (item.customer.nextContactAt && new Date(item.customer.nextContactAt).getTime() === new Date(item.remindAt).getTime()) customerUpdate.nextContactAt = null;
    await this.prisma.customer.update({ where: { id: item.customerId }, data: customerUpdate });
    await this.activity(item.customerId, 'REMINDER_COMPLETED', `Eslatma bajarildi: ${item.title}`, user.id, { reminderId: item.id });
    return this.dto(item);
  }

  async cancel(id: string, user: any) {
    const current: any = await this.findOwned(id, user);
    if (current.status !== 'PENDING') return this.dto(current);
    const item = await this.prisma.reminder.update({ where: { id }, data: { status: 'CANCELLED' as any }, include: { customer: true, assignedUser: true } });
    if (item.customer.nextContactAt && new Date(item.customer.nextContactAt).getTime() === new Date(item.remindAt).getTime()) await this.prisma.customer.update({ where: { id: item.customerId }, data: { nextContactAt: null } });
    return this.dto(item);
  }

  async ensureDueNotifications(user: any) {
    const bounds = this.dayBounds();
    const where: any = { status: 'PENDING' as any, remindAt: { lt: bounds.end }, assignedUserId: user.id };
    const due = await this.prisma.reminder.findMany({ where, include: { customer: true } });
    for (const reminder of due) {
      await this.prisma.notification.upsert({
        where: { reminderId: reminder.id },
        update: { title: reminder.title, message: reminder.title },
        create: {
          userId: user.id,
          reminderId: reminder.id,
          type: reminder.type === 'CALL' || reminder.type === 'FOLLOW_UP' ? 'follow_up' : 'reminder',
          title: reminder.title,
          message: reminder.title,
          relatedEntityType: 'customer',
          relatedEntityId: reminder.customerId,
        },
      });
    }
  }

  async todayWork(user: any) {
    const bounds = this.dayBounds();
    const taskWhere: any = { dueDate: { not: null }, status: { in: ['TODO', 'IN_PROGRESS'] }, ...(this.canViewAll(user) ? {} : { assignedToId: user.id }) };
    const installationWhere: any = { scheduledDate: { not: null }, status: { notIn: ['COMPLETED', 'CANCELLED', 'DONE', 'INSTALLED'] }, ...(this.canViewAll(user) ? {} : { assignedEmployeeId: user.id }) };
    const [tasks, installations, reminders] = await Promise.all([
      this.prisma.task.findMany({ where: taskWhere, include: { customer: true }, orderBy: { dueDate: 'asc' }, take: 200 }),
      this.prisma.installation.findMany({ where: installationWhere, include: { customer: true }, orderBy: { scheduledDate: 'asc' }, take: 200 }),
      this.list({ today: true }, user),
    ]);
    const isToday = (value: any) => {
      if (!value) return false;
      const date = new Date(value);
      return !Number.isNaN(date.getTime()) && date >= bounds.start && date < bounds.end;
    };
    const todayTasks = tasks.filter((item) => isToday(item.dueDate));
    const todayInstallations = installations.filter((item) => isToday(item.scheduledDate));
    return {
      counts: { calls: reminders.items.length, tasks: todayTasks.length, installations: todayInstallations.length },
      items: { reminders: reminders.items, tasks: todayTasks, installations: todayInstallations },
    };
  }

  private async findOwned(id: string, user: any) {
    const item = await this.prisma.reminder.findUnique({ where: { id }, include: { customer: true, assignedUser: true } });
    if (!item) throw new NotFoundException('Eslatma topilmadi');
    const canView = this.canViewAll(user) || item.assignedUserId === user.id;
    if (!canView) throw new ForbiddenException('Bu eslatmaga ruxsat yo\'q');
    return item;
  }

  private async ensureCustomerAccess(customerId: string, user: any) {
    const canViewAll = this.canViewAll(user);
    const isPartner = Boolean(user.partnerGroupId) && !['SUPER_ADMIN', 'ADMIN'].includes(user.role);
    const customer: any = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null, ...(canViewAll ? {} : isPartner ? { groups: { some: { id: user.partnerGroupId } } } : { assignedEmployeeId: user.id }) },
      select: { id: true, name: true, assignedEmployeeId: true },
    });
    if (!customer) throw new ForbiddenException('Bu mijozga eslatma qo\'yishga ruxsat yo\'q');
    return customer;
  }

  private canViewAll(user: any) {
    return ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role) || user.permissions?.includes('reminders.viewAll');
  }

  private async cancelNextContactReminders(customerId: string) {
    await this.prisma.reminder.updateMany({ where: { customerId, status: 'PENDING' as any, type: { in: ['CALL', 'FOLLOW_UP'] } }, data: { status: 'CANCELLED' as any } });
  }

  private async activity(customerId: string, type: string, message: string, createdById: string, metadata?: any) {
    await this.prisma.activity.create({ data: { customerId, type, message, createdById, metadata: metadata || undefined } });
  }

  private dto(item: any) {
    return {
      id: item.id,
      customerId: item.customerId,
      customer: item.customer ? { id: item.customer.id, name: item.customer.name } : null,
      assignedUserId: item.assignedUserId,
      assignedUser: item.assignedUser ? { id: item.assignedUser.id, name: item.assignedUser.name } : null,
      type: item.type,
      title: item.title,
      remindAt: item.remindAt,
      status: item.status,
      completedAt: item.completedAt,
      createdAt: item.createdAt,
    };
  }

  private toDate(value: any) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) throw new ForbiddenException('Eslatma sanasi noto\'g\'ri');
    return date;
  }

  private dayBounds() {
    const now = new Date();
    return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) };
  }
}
