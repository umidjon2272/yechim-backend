import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { isAdmin, isPartner } from '../common/access';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: any }>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Avtorizatsiya talab qilinadi');

    let payload: any;
    try {
      const secret = this.config.get<string>('JWT_SECRET');
      if (!secret && this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error('JWT_SECRET production muhitida majburiy');
      }
      payload = await this.jwt.verifyAsync(token, { secret: secret || 'dev-access-secret' });
    } catch {
      throw new UnauthorizedException('Sessiya muddati tugagan');
    }

    const session = payload.sid
      ? await this.prisma.userSession.findUnique({
          where: { id: payload.sid },
          include: { user: { include: { team: true, partnerGroup: true } } },
        })
      : null;
    const user = session?.user;
    if (!session || !user || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date() || user.status !== 'active' || user.isActive === false) {
      throw new UnauthorizedException('Sessiya faol emas');
    }
    req.user = user;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) || [];
    if (!required.length || isAdmin(user)) return true;
    if (isPartner(user) && required.some((permission) => permission !== 'customers.view')) {
      throw new ForbiddenException('Partner faqat biriktirilgan guruh mijozlarini ko\'rishi mumkin');
    }
    const own = user.permissions || [];
    if (required.every((permission) => own.includes(permission))) return true;
    throw new ForbiddenException('Bu amal uchun ruxsat yoq');
  }

  private extractToken(req: Request) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    // Auth is deliberately header-only. Origin-wide cookies would make two
    // tabs share one account even when their frontend sessions are separate.
    return undefined;
  }
}
