import { Injectable, NotFoundException } from '@nestjs/common';
import { pagination, paged } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: any) {
    const { page, pageSize, skip, take } = pagination(query);
    const search = String(query.search || '').trim();
    const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : {};
    const [total, items] = await Promise.all([
      this.prisma.customerGroup.count({ where }),
      this.prisma.customerGroup.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return paged(items, total, page, pageSize);
  }

  create(body: any) {
    return this.prisma.customerGroup.create({ data: { name: body.name } });
  }

  update(id: string, body: any) {
    return this.prisma.customerGroup.update({ where: { id }, data: { name: body.name } });
  }

  async remove(id: string) {
    const group = await this.prisma.customerGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    await this.prisma.customerGroup.delete({ where: { id } });
    return { ok: true };
  }
}
