import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { publicUser, uniqueConflict } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateMe(userId: string, body: any) {
    if (body.newPassword) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const ok = await bcrypt.compare(body.currentPassword || '', user.passwordHash);
      if (!ok) throw new UnauthorizedException("Joriy parol noto'g'ri");
    }
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: body.name,
          phone: body.phone || null,
          email: body.email || null,
          username: body.username || null,
          avatarUrl: body.avatarUrl || null,
          ...(body.newPassword ? { passwordHash: await bcrypt.hash(body.newPassword, 12), refreshTokenHash: null } : {}),
        },
        include: { team: true },
      });
      return publicUser(updated);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Email, telefon yoki login allaqachon mavjud');
      throw error;
    }
  }
}
