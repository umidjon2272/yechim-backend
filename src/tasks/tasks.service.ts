import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { taskDto } from '../common/mappers';
import { paged, pagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any, user: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const canViewAll = ['SUPER_ADMIN', 'ADMIN'].includes(user.role) || user.permissions?.includes('tasks.viewAll');
    const where: any = {};
    if (!canViewAll || query.assignedToMe === 'true' || query.assignedToMe === true) where.assignedToId = user.id;
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
    const canViewAll = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role) || user.permissions?.includes('tasks.viewAll');
    if (!canViewAll && assignedToId !== user.id) throw new ForbiddenException('Vazifani faqat ozingizga biriktirishingiz mumkin');
    if (body.customerId) await this.ensureCustomerAccess(body.customerId, user);
    const task = await this.prisma.task.create({
      data: {
        title: body.title,
        description: body.description || null,
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
    if (task.customerId) await this.prisma.activity.create({ data: { customerId: task.customerId, type: 'TASK_CREATED', message: `Vazifa yaratildi: ${task.title}`, createdById: user.id, metadata: { taskId: task.id } } });
    return taskDto(task);
  }

  async update(id: string, body: any, user: any) {
    const current = await this.prisma.task.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Vazifa topilmadi');
    const canEdit = ['SUPER_ADMIN', 'ADMIN'].includes(user.role) || user.permissions?.includes('tasks.edit');
    const ownStatusOnly = current.assignedToId === user.id && Object.keys(body).every((key) => key === 'status');
    if (!canEdit && !ownStatusOnly) throw new ForbiddenException('Bu vazifani tahrirlashga ruxsat yoq');
    const assignedToId = body.assignedToId || body.assignedEmployeeId;
    const canViewAll = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role) || user.permissions?.includes('tasks.viewAll');
    if (!canViewAll && assignedToId && assignedToId !== user.id) throw new ForbiddenException('Vazifani boshqa xodimga biriktirishga ruxsat yo\'q');
    if (body.customerId) await this.ensureCustomerAccess(body.customerId, user);
    const task = await this.prisma.task.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        status: body.status ? this.normalizeStatus(body.status) : undefined,
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
    return taskDto(task);
  }

  private normalizeStatus(status: string) {
    return status === 'NEW' ? 'TODO' : status;
  }

  private ensureCanSee(task: any, user: any) {
    const canViewAll = ['SUPER_ADMIN', 'ADMIN'].includes(user.role) || user.permissions?.includes('tasks.viewAll');
    if (!canViewAll && task.assignedToId !== user.id) throw new ForbiddenException('Bu vazifani korishga ruxsat yoq');
  }

  private async ensureCustomerAccess(customerId: string, user: any) {
    const canViewAll = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role) || user.permissions?.includes('customers.viewAll');
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null, ...(canViewAll ? {} : { assignedEmployeeId: user.id }) }, select: { id: true } });
    if (!customer) throw new ForbiddenException('Bu mijoz uchun vazifa yaratishga ruxsat yo\'q');
  }
}
