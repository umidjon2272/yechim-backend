import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { uniqueConflict } from '../common/mappers';

@Injectable()
export class CurrenciesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor?: any) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(String(actor?.role || '').toUpperCase());
    if (actor?.partnerGroupId && !isAdmin) throw new ForbiddenException('Partner valyuta sozlamalarini ko\'ra olmaydi');
    const items = await this.prisma.currency.findMany({ where: isAdmin ? {} : { isActive: true }, orderBy: [{ isDefault: 'desc' }, { code: 'asc' }] });
    return { items: items.map((item) => this.dto(item)), total: items.length };
  }

  async create(body: any, actor?: any) {
    this.ensureAdmin(actor);
    const data = this.normalize(body);
    try {
      const hasDefault = await this.prisma.currency.findFirst({ where: { isDefault: true, isActive: true }, select: { id: true } });
      const makeDefault = Boolean(body.isDefault) || !hasDefault;
      const item = await this.prisma.$transaction(async (tx) => {
        if (makeDefault) await tx.currency.updateMany({ data: { isDefault: false } });
        return tx.currency.create({ data: { ...data, isDefault: makeDefault } });
      });
      return this.dto(item);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Bu valyuta kodi allaqachon mavjud');
      throw error;
    }
  }

  async update(id: string, body: any, actor?: any) {
    this.ensureAdmin(actor);
    const current = await this.prisma.currency.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Valyuta topilmadi');
    const nextActive = body.isActive === undefined ? current.isActive : Boolean(body.isActive);
    const wantsDefault = body.isDefault === true;
    if (wantsDefault && !nextActive) throw new BadRequestException('Faol bo‘lmagan valyutani default qilib bo‘lmaydi');

    try {
      const item = await this.prisma.$transaction(async (tx) => {
        const data: any = {};
        if (body.code !== undefined) data.code = this.normalizeCode(body.code);
        if (body.name !== undefined) data.name = this.normalizeText(body.name, 'Nomi');
        if (body.symbol !== undefined) data.symbol = this.normalizeText(body.symbol, 'Belgisi');
        if (body.isActive !== undefined) data.isActive = nextActive;

        if (wantsDefault) {
          await tx.currency.updateMany({ data: { isDefault: false } });
          data.isDefault = true;
          data.isActive = true;
        } else if (body.isDefault === false || (current.isDefault && !nextActive)) {
          const fallback = await tx.currency.findFirst({ where: { id: { not: id }, isActive: true }, orderBy: { createdAt: 'asc' } });
          if (!fallback) throw new BadRequestException('Kamida bitta faol default valyuta qolishi kerak');
          await tx.currency.update({ where: { id: fallback.id }, data: { isDefault: true } });
          data.isDefault = false;
        }
        return tx.currency.update({ where: { id }, data });
      });
      return this.dto(item);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Bu valyuta kodi allaqachon mavjud');
      throw error;
    }
  }

  async defaultId() {
    const item = await this.prisma.currency.findFirst({ where: { isDefault: true, isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!item) throw new NotFoundException('Default valyuta sozlanmagan');
    return item.id;
  }

  private normalize(body: any) {
    return {
      code: this.normalizeCode(body.code),
      name: this.normalizeText(body.name, 'Nomi'),
      symbol: this.normalizeText(body.symbol, 'Belgisi'),
      isActive: body.isActive !== false,
    };
  }

  private normalizeCode(value: any) {
    const code = String(value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(code)) throw new BadRequestException('Valyuta kodi 3-10 ta lotin harfi yoki raqamdan iborat bo‘lishi kerak');
    return code;
  }

  private normalizeText(value: any, label: string) {
    const text = String(value || '').trim();
    if (!text) throw new BadRequestException(`${label} kiritilishi shart`);
    return text;
  }

  private ensureAdmin(actor: any, write = true) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(String(actor?.role || '').toUpperCase())) {
      throw new ForbiddenException(write ? 'Valyutani faqat admin boshqaradi' : 'Valyutalarni ko‘rishga ruxsat yo‘q');
    }
  }

  private dto(item: any) {
    const { customers: _customers, ...publicItem } = item;
    return publicItem;
  }
}
