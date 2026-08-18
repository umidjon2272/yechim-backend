import { ConflictException, Injectable } from '@nestjs/common';
import { publicUser, uniqueConflict } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateMe(userId: string, body: any) {
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: body.name,
          phone: body.phone || null,
          email: body.email || null,
          avatarUrl: body.avatarUrl || null,
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
