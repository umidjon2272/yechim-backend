import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { publicUser, uniqueConflict } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateMe(userId: string, body: any) {
    if (body.username !== undefined || body.password !== undefined || body.newPassword !== undefined) {
      throw new ForbiddenException('Login yoki parolni bu endpoint orqali o\'zgartirib bo\'lmaydi');
    }
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: body.name,
          phone: body.phone || null,
          email: body.email || null,
          avatarUrl: body.avatarUrl || null,
        },
        include: { team: true, partnerGroup: true, allowedGroups: { include: { group: true } } },
      });
      return publicUser(updated);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Email, telefon yoki login allaqachon mavjud');
      throw error;
    }
  }

  async updateMyLogin(actor: any, value: any) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(String(actor?.role || '').toUpperCase())) throw new ForbiddenException('Loginni faqat admin o\'zgartira oladi');
    const username = String(value || '').trim();
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(username)) throw new BadRequestException('Login kamida 3 belgi va faqat lotin harflari, raqam, nuqta, tire yoki pastki chiziqdan iborat bo\'lishi kerak');
    try {
      const updated = await this.prisma.user.update({ where: { id: actor.id }, data: { username }, include: { team: true, partnerGroup: true, allowedGroups: { include: { group: true } } } });
      return publicUser(updated);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Bu login band');
      throw error;
    }
  }
}
