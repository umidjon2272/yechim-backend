import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from '../reminders/reminders.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, private readonly reminders: RemindersService) {}

  async list(query: any, user: any) {
    await this.reminders.ensureDueNotifications(user);
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 50), 1), 200);
    const where = { userId: user.id };
    const [total, items] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        include: { reminder: { select: { remindAt: true, customer: { select: { id: true, name: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: items.map((item) => this.dto(item)), total, page, pageSize };
  }

  async unreadCount(user: any) {
    await this.reminders.ensureDueNotifications(user);
    return { count: await this.prisma.notification.count({ where: { userId: user.id, isRead: false } }) };
  }

  async markRead(id: string, user: any) {
    const item = await this.prisma.notification.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Bildirishnoma topilmadi');
    if (item.userId !== user.id) throw new ForbiddenException('Bu bildirishnomaga ruxsat yo\'q');
    return this.prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } }).then((value) => this.dto(value));
  }

  async markAllRead(user: any) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true, readAt: new Date() } });
    return { ok: true };
  }

  private dto(item: any) {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      isRead: item.isRead,
      readAt: item.readAt || null,
      entityType: item.entityType || null,
      entityId: item.entityId || null,
      createdAt: item.createdAt,
      remindAt: item.reminder?.remindAt || null,
      customer: item.reminder?.customer || null,
      isOverdue: item.type === 'reminder_overdue',
    };
  }
}
