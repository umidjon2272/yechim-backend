import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { pagination, paged } from '../common/pagination';
import { ROLE_DEFAULT_PERMISSIONS } from '../common/defaults';
import { publicUser, taskDto, uniqueConflict } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const search = String(query.search || '').trim();
    const where = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { email: { contains: search, mode: 'insensitive' as const } }, { username: { contains: search, mode: 'insensitive' as const } }] }
      : {};
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, include: { team: true }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(users.map((u) => publicUser(u)), total, page, pageSize);
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { team: true } });
    if (!user) throw new NotFoundException('Xodim topilmadi');
    return publicUser(user);
  }

  async create(body: any) {
    try {
      const role = (body.role || 'EMPLOYEE').toUpperCase();
      const user = await this.prisma.user.create({
        data: {
          name: body.name,
          email: body.email,
          phone: body.phone,
          username: body.username,
          passwordHash: await bcrypt.hash(body.password, 12),
          role,
          permissions: body.permissions ?? ROLE_DEFAULT_PERMISSIONS[role] ?? ROLE_DEFAULT_PERMISSIONS.EMPLOYEE,
          status: body.status || 'active',
          teamId: body.teamId || null,
        } as any,
        include: { team: true },
      });
      return publicUser(user);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Email, telefon yoki login allaqachon mavjud');
      throw error;
    }
  }

  async update(id: string, body: any) {
    try {
      const data: any = {
        name: body.name,
        email: body.email,
        phone: body.phone,
        username: body.username,
        role: body.role,
        permissions: body.permissions,
        status: body.status,
        avatarUrl: body.avatarUrl,
        teamId: body.teamId === '' ? null : body.teamId,
      };
      Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
      if (body.password) data.passwordHash = await bcrypt.hash(body.password, 12);
      const user = await this.prisma.user.update({ where: { id }, data, include: { team: true } });
      return publicUser(user);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Email, telefon yoki login allaqachon mavjud');
      throw error;
    }
  }

  setStatus(id: string, status: string) {
    return this.prisma.user.update({ where: { id }, data: { status }, include: { team: true } }).then(publicUser);
  }

  async tasks(id: string) {
    const items = await this.prisma.task.findMany({
      where: { assignedToId: id },
      include: { assignedTo: { include: { team: true } }, createdBy: { include: { team: true } }, customer: true, deal: true },
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.map(taskDto), total: items.length };
  }

  async leads(id: string) {
    const items = await this.prisma.lead.findMany({ where: { assignedEmployeeId: id }, include: { customer: true, business: true }, orderBy: { createdAt: 'desc' } });
    return { items, total: items.length };
  }

  async deals(id: string) {
    const items = await this.prisma.deal.findMany({ where: { salesEmployeeId: id }, include: { customer: true, business: true, salesEmployee: { include: { team: true } } }, orderBy: { createdAt: 'desc' } });
    return { items, total: items.length };
  }

  async installations(id: string) {
    const items = await this.prisma.installation.findMany({ where: { assignedEmployeeId: id }, include: { customer: true, business: true, deal: true, assignedEmployee: { include: { team: true } } }, orderBy: { createdAt: 'desc' } });
    return { items, total: items.length };
  }
}
