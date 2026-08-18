import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from '../reminders/reminders.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, private readonly reminders: RemindersService) {}

  async list(query: any, user: any) {
    await this.reminders.ensureDueNotifications(user);
    const items = await this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: Number(query.pageSize || 50) });
    return { items: items.map((item) => this.dto(item)), total: items.length };
  }

  async unreadCount(user: any) {
    await this.reminders.ensureDueNotifications(user);
    return { count: await this.prisma.notification.count({ where: { userId: user.id, read: false } }) };
  }

  async markRead(id: string, user: any) {
    const item = await this.prisma.notification.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Bildirishnoma topilmadi');
    if (item.userId !== user.id) throw new ForbiddenException('Bu bildirishnomaga ruxsat yo\'q');
    return this.prisma.notification.update({ where: { id }, data: { read: true } }).then((value) => this.dto(value));
  }

  async markAllRead(user: any) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
    return { ok: true };
  }

  private dto(item: any) {
    return { ...item, read: item.read };
  }
}
