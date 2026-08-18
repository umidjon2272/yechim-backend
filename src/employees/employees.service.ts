import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { pagination, paged } from '../common/pagination';
import { ALL_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from '../common/defaults';
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
      this.prisma.user.findMany({ where, include: { team: true, partnerGroup: true }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(users.map((u) => publicUser(u)), total, page, pageSize);
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { team: true, partnerGroup: true } });
    if (!user) throw new NotFoundException('Xodim topilmadi');
    return publicUser(user);
  }

  async create(body: any) {
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!name) throw new BadRequestException('Ism kiritilishi shart');
    if (!/^\+998\d{9}$/.test(phone)) throw new BadRequestException('Telefon raqami +998XXXXXXXXX formatida bo\'lishi kerak');
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(username)) throw new BadRequestException('Login kamida 3 belgi va faqat lotin harflari, raqam, nuqta, tire yoki pastki chiziqdan iborat bo\'lishi kerak');
    if (password.length < 6) throw new BadRequestException('Parol kamida 6 belgidan iborat bo\'lishi kerak');
    try {
      const role = (body.role || 'EMPLOYEE').toUpperCase();
      const user = await this.prisma.user.create({
        data: {
          name,
          email: body.email || null,
          phone,
          username,
          passwordHash: await bcrypt.hash(password, 12),
          role: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'SUPPORT', 'INSTALLER', 'DEVELOPER', 'EMPLOYEE'].includes(role) ? role : 'EMPLOYEE',
          permissions: this.sanitizePermissions(body.permissions ?? ROLE_DEFAULT_PERMISSIONS[role] ?? ROLE_DEFAULT_PERMISSIONS.EMPLOYEE),
          status: body.status || 'active',
          isActive: body.isActive !== false && body.status !== 'inactive',
          teamId: body.teamId || null,
          partnerGroupId: body.partnerGroupId || null,
        } as any,
        include: { team: true, partnerGroup: true },
      });
      return publicUser(user);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException(this.uniqueMessage(error));
      throw error;
    }
  }

  async update(id: string, body: any, actor?: any) {
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(String(actor?.role || '').toUpperCase());
    if (!isAdmin && actor?.id !== id) throw new ForbiddenException('Faqat admin boshqa xodimlarni boshqarishi mumkin');
    try {
      const data: any = isAdmin
        ? {
            name: body.name,
            email: body.email,
            phone: body.phone,
            username: body.username,
            role: body.role,
            permissions: body.permissions,
            status: body.status,
            isActive: body.isActive === undefined && body.status === undefined ? undefined : body.isActive ?? body.status === 'active',
            avatarUrl: body.avatarUrl,
            teamId: body.teamId === '' ? null : body.teamId,
            partnerGroupId: body.partnerGroupId === '' ? null : body.partnerGroupId,
          }
        : {
            name: body.name,
            email: body.email,
            phone: body.phone,
            avatarUrl: body.avatarUrl,
          };
      Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
      if (data.permissions) data.permissions = this.sanitizePermissions(data.permissions);
      if (data.role !== undefined && !['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'SUPPORT', 'INSTALLER', 'DEVELOPER', 'EMPLOYEE'].includes(String(data.role).toUpperCase())) delete data.role;
      const user = await this.prisma.user.update({ where: { id }, data, include: { team: true, partnerGroup: true } });
      if (data.status === 'inactive' || data.isActive === false) await this.revokeSessions(id);
      return publicUser(user);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException(this.uniqueMessage(error));
      throw error;
    }
  }

  async setStatus(id: string, status: string, actor?: any) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(String(actor?.role || '').toUpperCase())) throw new ForbiddenException('Xodim holatini faqat admin o\'zgartiradi');
    const user = await this.prisma.user.update({
      where: { id },
      data: { status, isActive: status === 'active' },
      include: { team: true, partnerGroup: true },
    });
    if (status !== 'active') await this.revokeSessions(id);
    return publicUser(user);
  }

  async resetPassword(id: string, password: string, actor?: any) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(String(actor?.role || '').toUpperCase())) throw new ForbiddenException('Parolni faqat admin almashtiradi');
    if (!password || String(password).length < 6) throw new ConflictException('Parol kamida 6 belgidan iborat bo\'lishi kerak');
    const user = await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 12) },
      include: { team: true, partnerGroup: true },
    });
    await this.revokeSessions(id);
    return publicUser(user);
  }

  async remove(id: string, actor?: any) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(String(actor?.role || '').toUpperCase())) throw new ForbiddenException('Xodimni faqat admin o\'chirishi mumkin');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Xodim topilmadi');
    if (actor?.id === id) throw new ForbiddenException('O\'zingizni o\'chira olmaysiz');

    // All employee relations in the schema use SetNull, so deleting the user
    // does not delete customers, tasks, deals, or installations assigned to it.
    await this.prisma.user.delete({ where: { id } });
    return { ok: true, id };
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

  private sanitizePermissions(value: any) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((permission) => ALL_PERMISSIONS.includes(permission)))];
  }

  private revokeSessions(userId: string) {
    return this.prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private uniqueMessage(error: any) {
    const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(',') : String(error?.meta?.target || '');
    if (target.includes('username')) return 'Bu login band';
    if (target.includes('phone')) return 'Bu telefon raqami band';
    if (target.includes('email')) return 'Bu email band';
    return 'Email, telefon yoki login allaqachon mavjud';
  }
}
