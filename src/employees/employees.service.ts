import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { pagination, paged } from '../common/pagination';
import { ALL_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from '../common/defaults';
import { publicUser, taskDto, uniqueConflict } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';

const employeeInclude = { team: true, partnerGroup: true, allowedGroups: { include: { group: true } } } as const;

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
      this.prisma.user.findMany({ where, include: employeeInclude, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(users.map((u) => publicUser(u, { exposePermissions: true })), total, page, pageSize);
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: employeeInclude });
    if (!user) throw new NotFoundException('Xodim topilmadi');
    return publicUser(user, { exposePermissions: true });
  }

  async create(body: any, actor?: any) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(String(actor?.role || '').toUpperCase())) throw new ForbiddenException('Xodimni faqat admin yaratishi mumkin');
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!name) throw new BadRequestException('Ism kiritilishi shart');
    if (!/^\+998\d{9}$/.test(phone)) throw new BadRequestException('Telefon raqami +998XXXXXXXXX formatida bo\'lishi kerak');
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(username)) throw new BadRequestException('Login kamida 3 belgi va faqat lotin harflari, raqam, nuqta, tire yoki pastki chiziqdan iborat bo\'lishi kerak');
    if (password.length < 6) throw new BadRequestException('Parol kamida 6 belgidan iborat bo\'lishi kerak');
    try {
      const role = this.normalizeRole(body.role || 'EMPLOYEE');
      const access = await this.normalizeAccess(role, body);
      const user = await this.prisma.user.create({
        data: {
          name,
          email: body.email || null,
          phone,
          username,
          passwordHash: await bcrypt.hash(password, 12),
          role,
          permissions: role === 'PARTNER' ? ['customers.view'] : this.sanitizePermissions(body.permissions ?? ROLE_DEFAULT_PERMISSIONS[role] ?? ROLE_DEFAULT_PERMISSIONS.EMPLOYEE),
          customerVisibility: access.visibility,
          status: body.status || 'active',
          isActive: body.isActive !== false && body.status !== 'inactive',
          teamId: body.teamId || null,
          partnerGroupId: access.partnerGroupId,
          allowedGroups: access.allowedGroupIds.length ? { create: access.allowedGroupIds.map((groupId) => ({ groupId })) } : undefined,
        } as any,
        include: employeeInclude,
      });
      const loginUrl = `${String(process.env.FRONTEND_URL || 'https://yechim-crm.vercel.app').split(',')[0].trim().replace(/\/$/, '')}/login`;
      return { employee: publicUser(user, { exposePermissions: true }), credentials: { login: username, password }, loginUrl };
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException(this.uniqueMessage(error));
      throw error;
    }
  }

  async update(id: string, body: any, actor?: any) {
    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(String(actor?.role || '').toUpperCase());
    if (!isAdmin && actor?.id !== id) throw new ForbiddenException('Faqat admin boshqa xodimlarni boshqarishi mumkin');
    if (!isAdmin && (body.username !== undefined || body.password !== undefined || body.newPassword !== undefined)) {
      throw new ForbiddenException('Xodim login yoki parolini o\'zgartira olmaydi');
    }
    try {
      const current: any = await this.prisma.user.findUnique({ where: { id }, include: employeeInclude });
      if (!current) throw new NotFoundException('Xodim topilmadi');
      const nextRole = this.normalizeRole(body.role ?? current.role);
      const access = isAdmin
        ? await this.normalizeAccess(nextRole, {
            ...body,
            partnerGroupId: body.partnerGroupId ?? current.partnerGroupId,
            allowedGroupIds: body.allowedGroupIds ?? current.allowedGroups?.map((item: any) => item.groupId),
          })
        : { visibility: current.customerVisibility, partnerGroupId: current.partnerGroupId, allowedGroupIds: current.allowedGroups?.map((item: any) => item.groupId) || [] };
      const data: any = isAdmin
        ? {
            name: body.name,
            email: body.email,
            phone: body.phone,
            username: body.username,
            role: nextRole,
            permissions: nextRole === 'PARTNER' ? ['customers.view'] : body.permissions,
            customerVisibility: access.visibility,
            status: body.status,
            isActive: body.isActive === undefined && body.status === undefined ? undefined : body.isActive ?? body.status === 'active',
            avatarUrl: body.avatarUrl,
            teamId: body.teamId === '' ? null : body.teamId,
            partnerGroupId: access.partnerGroupId,
            allowedGroups: { deleteMany: {}, create: access.allowedGroupIds.map((groupId) => ({ groupId })) },
          }
        : {
            name: body.name,
            email: body.email,
            phone: body.phone,
            avatarUrl: body.avatarUrl,
          };
      Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
      if (data.permissions !== undefined) data.permissions = this.normalizePermissions(data.permissions);
      const user = await this.prisma.user.update({ where: { id }, data, include: employeeInclude });
      if (data.username !== undefined) await this.revokeSessions(id);
      if (data.status === 'inactive' || data.isActive === false) await this.revokeSessions(id);
      return publicUser(user, { exposePermissions: true });
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException(this.uniqueMessage(error));
      throw error;
    }
  }

  async updatePermissions(id: string, permissions: string[], actor?: any) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(String(actor?.role || '').toUpperCase())) throw new ForbiddenException('Ruxsatlarni faqat admin boshqaradi');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Xodim topilmadi');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { permissions: user.role === 'PARTNER' ? ['customers.view'] : this.normalizePermissions(permissions) },
      include: employeeInclude,
    });
    return publicUser(updated, { exposePermissions: true });
  }

  async setStatus(id: string, status: string, actor?: any) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(String(actor?.role || '').toUpperCase())) throw new ForbiddenException('Xodim holatini faqat admin o\'zgartiradi');
    const user = await this.prisma.user.update({
      where: { id },
      data: { status, isActive: status === 'active' },
      include: employeeInclude,
    });
    if (status !== 'active') await this.revokeSessions(id);
    return publicUser(user, { exposePermissions: true });
  }

  async resetPassword(id: string, password: string, actor?: any) {
    return this.updateCredentials(id, { newPassword: password }, actor);
  }

  async updateCredentials(id: string, body: any, actor?: any) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(String(actor?.role || '').toUpperCase())) throw new ForbiddenException('Xodim login/parolini faqat admin boshqaradi');
    const username = body.username === undefined ? undefined : String(body.username || '').trim();
    const password = body.newPassword ?? body.password;
    if (username !== undefined && !/^[a-zA-Z0-9._-]{3,}$/.test(username)) throw new BadRequestException('Login kamida 3 belgi va faqat lotin harflari, raqam, nuqta, tire yoki pastki chiziqdan iborat bo\'lishi kerak');
    if (password !== undefined && String(password).length < 6) throw new ConflictException('Parol kamida 6 belgidan iborat bo\'lishi kerak');
    if (username === undefined && password === undefined) throw new BadRequestException('Login yoki yangi parol kiritilishi shart');
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          ...(username !== undefined ? { username } : {}),
          ...(password !== undefined ? { passwordHash: await bcrypt.hash(String(password), 12) } : {}),
        },
        include: employeeInclude,
      });
      await this.revokeSessions(id);
      return publicUser(user, { exposePermissions: true });
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException(this.uniqueMessage(error));
      throw error;
    }
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

  private normalizeRole(value: any) {
    const role = String(value || 'EMPLOYEE').toUpperCase();
    const allowed = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'SUPPORT', 'INSTALLER', 'DEVELOPER', 'EMPLOYEE', 'PARTNER'];
    if (!allowed.includes(role)) throw new BadRequestException('Rol noto\'g\'ri');
    return role as any;
  }

  private async normalizeAccess(role: string, body: any) {
    if (role === 'PARTNER') {
      const partnerGroupId = String(body.partnerGroupId || '').trim();
      if (!partnerGroupId) throw new BadRequestException('Partner uchun guruh tanlanishi shart');
      const group = await this.prisma.customerGroup.findUnique({ where: { id: partnerGroupId }, select: { id: true } });
      if (!group) throw new BadRequestException('Partner guruhi topilmadi');
      return { visibility: 'ASSIGNED' as any, partnerGroupId, allowedGroupIds: [] as string[] };
    }

    const visibility = String(body.customerVisibility || 'ASSIGNED').toUpperCase();
    if (role !== 'EMPLOYEE') return { visibility: 'ASSIGNED' as any, partnerGroupId: null, allowedGroupIds: [] as string[] };
    if (!['ALL', 'ASSIGNED', 'GROUPS'].includes(visibility)) throw new BadRequestException('Mijozlar ko\'rinishi noto\'g\'ri');
    const allowedGroupIds: string[] = Array.isArray(body.allowedGroupIds)
      ? [...new Set(body.allowedGroupIds.map((value: any) => String(value || '').trim()).filter(Boolean))] as string[]
      : [];
    if (visibility === 'GROUPS') {
      if (!allowedGroupIds.length) throw new BadRequestException('Kamida bitta ruxsat berilgan guruh tanlang');
      const groups = await this.prisma.customerGroup.findMany({ where: { id: { in: allowedGroupIds } }, select: { id: true } });
      if (groups.length !== allowedGroupIds.length) throw new BadRequestException('Ruxsat berilgan guruh topilmadi');
    }
    return { visibility: visibility as any, partnerGroupId: null, allowedGroupIds: visibility === 'GROUPS' ? allowedGroupIds : [] };
  }

  private sanitizePermissions(value: any) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((permission) => ALL_PERMISSIONS.includes(permission)))];
  }

  private normalizePermissions(value: any) {
    if (!Array.isArray(value)) throw new BadRequestException('Ruxsatlar massivi noto\'g\'ri');
    const permissions = [...new Set(value)];
    const invalid = permissions.filter((permission) => !ALL_PERMISSIONS.includes(permission));
    if (invalid.length) throw new BadRequestException(`Noma'lum ruxsat: ${invalid.join(', ')}`);
    return permissions;
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
