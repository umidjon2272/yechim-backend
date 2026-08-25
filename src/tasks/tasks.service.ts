import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { taskDto } from '../common/mappers';
import { customerScopeWhere } from '../common/access';
import { paged, pagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any, user: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const canViewAll = this.canViewAll(user);
    const where: any = {};
    if (!canViewAll || query.assignedToMe === 'true' || query.assignedToMe === true) {
      where.OR = [{ assignedToId: user.id }, { assignedEmployeeId: user.id }];
    }
    if (query.status) where.status = this.normalizeStatus(query.status);
    if (query.priority) where.priority = query.priority;
    if (query.customerId) where.customerId = query.customerId;
    if (query.businessId) where.businessId = query.businessId;
    if (query.leadId) where.leadId = query.leadId;
    if (query.dealId) where.dealId = query.dealId;
    if (query.installationId) where.installationId = query.installationId;
    const include = { assignedTo: { include: { team: true } }, createdBy: { include: { team: true } }, customer: true, deal: true };
    const [total, items] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return { ...paged(items.map(taskDto), total, page, pageSize), canViewAll };
  }

  async get(id: string, user: any) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { assignedTo: { include: { team: true } }, createdBy: { include: { team: true } }, customer: true, deal: true },
    });
    if (!task) throw new NotFoundException('Vazifa topilmadi');
    this.ensureCanSee(task, user);
    return taskDto(task);
  }

  async create(body: any, user: any) {
    const assignedToId = body.assignedToId || body.assignedEmployeeId || user.id;
    const canViewAll = this.canManageTasks(user);
    if (!canViewAll && assignedToId !== user.id) throw new ForbiddenException('Vazifani faqat ozingizga biriktirishingiz mumkin');
    await this.ensureAssignee(assignedToId);
    if (body.customerId) await this.ensureCustomerAccess(body.customerId, user);
    const task = await this.prisma.task.create({
      data: {
        title: body.title,
        description: body.description ?? body.comment ?? body.note ?? null,
        status: this.normalizeStatus(body.status || 'TODO'),
        priority: body.priority || 'MEDIUM',
        dueDate: body.dueDate || null,
        assignedToId,
        assignedEmployeeId: assignedToId,
        createdById: user.id,
        customerId: body.customerId || null,
        businessId: body.businessId || null,
        leadId: body.leadId || null,
        dealId: body.dealId || null,
        installationId: body.installationId || null,
        automationKey: body.automationKey || null,
      } as any,
      include: { assignedTo: { include: { team: true } }, createdBy: { include: { team: true } }, customer: true, deal: true },
    });
    if (task.customerId) {
      const comment = task.description ? `\nIzoh: ${task.description}` : '';
      await this.prisma.activity.create({ data: { customerId: task.customerId, type: 'TASK_CREATED', message: `Vazifa yaratildi: ${task.title}${comment}`, createdById: user.id, metadata: { taskId: task.id, description: task.description || null } } });
    }
    if (task.assignedToId && task.assignedToId !== user.id) await this.notifyAssignee(task.assignedToId, task.title, task.id, task.dueDate);
    return taskDto(task);
  }

  async update(id: string, body: any, user: any) {
    const current = await this.prisma.task.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Vazifa topilmadi');
    const canEdit = this.isAdmin(user) || user.permissions?.includes('tasks.edit');
    const nextStatus = body.status ? this.normalizeStatus(body.status) : undefined;
    if (nextStatus === 'CANCELLED' && !this.isAdmin(user)) {
      throw new ForbiddenException('Vazifani faqat admin bekor qila oladi');
    }
    const ownStatusOnly =
      (current.assignedToId === user.id || current.assignedEmployeeId === user.id) &&
      Object.keys(body).every((key) => key === 'status') &&
      ['IN_PROGRESS', 'COMPLETED'].includes(nextStatus || '');
    if (!canEdit && !ownStatusOnly) throw new ForbiddenException('Bu vazifani tahrirlashga ruxsat yoq');
    const hasAssignee = body.assignedToId !== undefined || body.assignedEmployeeId !== undefined;
    const assignedToId = hasAssignee ? body.assignedToId || body.assignedEmployeeId || null : undefined;
    const canViewAll = this.canManageTasks(user);
    if (!canViewAll && assignedToId && assignedToId !== user.id) throw new ForbiddenException('Vazifani boshqa xodimga biriktirishga ruxsat yo\'q');
    if (assignedToId) await this.ensureAssignee(assignedToId);
    if (body.customerId) await this.ensureCustomerAccess(body.customerId, user);
    const task = await this.prisma.task.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description ?? body.comment ?? body.note,
        status: nextStatus,
        priority: body.priority,
        dueDate: body.dueDate,
        assignedToId,
        assignedEmployeeId: assignedToId,
        customerId: body.customerId,
        businessId: body.businessId,
        leadId: body.leadId,
        dealId: body.dealId,
        installationId: body.installationId,
      } as any,
      include: { assignedTo: { include: { team: true } }, createdBy: { include: { team: true } }, customer: true, deal: true },
    });
    if (task.customerId && (body.description !== undefined || body.comment !== undefined || body.note !== undefined)) {
      await this.prisma.activity.create({ data: { customerId: task.customerId, type: 'TASK_UPDATED', message: `Vazifa izohi yangilandi: ${task.title}${task.description ? `\nIzoh: ${task.description}` : ''}`, createdById: user.id, metadata: { taskId: task.id, description: task.description || null } } });
    }
    if (task.assignedToId && task.assignedToId !== current.assignedToId && task.assignedToId !== user.id) {
      await this.notifyAssignee(task.assignedToId, task.title, task.id, task.dueDate);
    }
    return taskDto(task);
  }

  async cancel(id: string, user: any) {
    if (!this.isAdmin(user)) throw new ForbiddenException('Vazifani faqat admin bekor qila oladi');
    const current = await this.prisma.task.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Vazifa topilmadi');
    if (current.status === 'CANCELLED') return this.get(id, user);

    const task = await this.prisma.task.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: { assignedTo: { include: { team: true } }, createdBy: { include: { team: true } }, customer: true, deal: true },
    });
    if (task.assignedToId && task.assignedToId !== user.id) {
      await this.notifyAssignee(task.assignedToId, task.title, task.id, task.dueDate, 'Vazifa bekor qilindi', 'task_cancelled');
    }
    return taskDto(task);
  }

  async remove(id: string, user: any) {
    if (!this.isAdmin(user)) throw new ForbiddenException('Vazifani faqat admin o\'chira oladi');
    const task = await this.prisma.task.findUnique({ where: { id }, select: { id: true } });
    if (!task) throw new NotFoundException('Vazifa topilmadi');
    await this.prisma.task.delete({ where: { id } });
    return { ok: true, id };
  }

  private normalizeStatus(status: string) {
    const normalized = status === 'NEW' ? 'TODO' : status;
    if (!['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(normalized)) throw new BadRequestException('Vazifa holati noto\'g\'ri');
    return normalized;
  }

  private ensureCanSee(task: any, user: any) {
    const canViewAll = this.canViewAll(user);
    if (!canViewAll && task.assignedToId !== user.id && task.assignedEmployeeId !== user.id) throw new ForbiddenException('Bu vazifani korishga ruxsat yoq');
  }

  private async ensureAssignee(userId: string) {
    const assignee = await this.prisma.user.findFirst({ where: { id: userId, status: 'active', isActive: true }, select: { id: true } });
    if (!assignee) throw new BadRequestException('Mas\'ul xodim topilmadi yoki faol emas');
  }

  private notifyAssignee(
    userId: string,
    title: string,
    taskId: string,
    dueDate?: string | null,
    notificationTitle = 'Yangi vazifa',
    notificationType = 'task_assigned',
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        type: notificationType,
        title: notificationTitle,
        message: `${title}${dueDate ? `\nDeadline: ${dueDate}` : ''}`,
        entityType: 'task',
        entityId: taskId,
      },
    });
  }

  private async ensureCustomerAccess(customerId: string, user: any) {
    const canViewAll = this.isAdmin(user) || String(user?.role || '').toUpperCase() === 'MANAGER' || user.permissions?.includes('customers.viewAll');
    const customer = await this.prisma.customer.findFirst({ where: { AND: [{ id: customerId, deletedAt: null }, canViewAll ? {} : customerScopeWhere(user)] }, select: { id: true } });
    if (!customer) throw new ForbiddenException('Bu mijoz uchun vazifa yaratishga ruxsat yo\'q');
  }

  private isAdmin(user: any) {
    return ['SUPER_ADMIN', 'ADMIN'].includes(String(user?.role || '').toUpperCase());
  }

  private canViewAll(user: any) {
    return this.isAdmin(user) || user?.permissions?.includes('tasks.viewAll');
  }

  private canManageTasks(user: any) {
    return this.isAdmin(user) || String(user?.role || '').toUpperCase() === 'MANAGER' || user?.permissions?.includes('tasks.viewAll');
  }
}
