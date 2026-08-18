import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: any }>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Avtorizatsiya talab qilinadi');

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET || 'dev-access-secret' });
    } catch {
      throw new UnauthorizedException('Sessiya muddati tugagan');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { team: true, partnerGroup: true } });
    if (!user || user.status !== 'active' || user.isActive === false) throw new UnauthorizedException('Foydalanuvchi faol emas');
    req.user = user;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) || [];
    if (!required.length || ['SUPER_ADMIN', 'ADMIN'].includes(user.role)) return true;
    const isPartner = Boolean(user.partnerGroupId) && !['SUPER_ADMIN', 'ADMIN'].includes(user.role);
    if (isPartner && required.some((permission) => permission !== 'customers.view')) {
      throw new ForbiddenException('Partner faqat biriktirilgan guruh mijozlarini ko\'rishi mumkin');
    }
    const own = user.permissions || [];
    if (required.every((permission) => own.includes(permission))) return true;
    throw new ForbiddenException('Bu amal uchun ruxsat yoq');
  }

  private extractToken(req: Request) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return (req as any).cookies?.accessToken;
  }
}
