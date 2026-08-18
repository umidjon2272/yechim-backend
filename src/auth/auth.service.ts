import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { ROLE_DEFAULT_PERMISSIONS } from '../common/defaults';
import { publicUser, uniqueConflict } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto';

const ACCESS_COOKIE = 'accessToken';
const REFRESH_COOKIE = 'refreshToken';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto, res: Response) {
    try {
      const passwordHash = await bcrypt.hash(dto.password, 12);
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email || null,
          username: dto.username || null,
          phone: dto.phone || null,
          passwordHash,
          role: 'ADMIN',
          permissions: ROLE_DEFAULT_PERMISSIONS.ADMIN,
        },
      });
      await this.issueTokens(user, res);
      return publicUser(user);
    } catch (error) {
      if (uniqueConflict(error)) throw new ConflictException('Email, telefon yoki login allaqachon mavjud');
      throw error;
    }
  }

  async login(identifier: string, password: string, res: Response) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }, { phone: identifier }],
      },
      include: { team: true, partnerGroup: true },
    });
    if (!user || user.status !== 'active' || user.isActive === false) throw new UnauthorizedException("Login yoki parol noto'g'ri");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Login yoki parol noto'g'ri");
    await this.issueTokens(user, res);
    return publicUser(user);
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      this.clearCookies(res);
      throw new UnauthorizedException('Refresh token topilmadi');
    }
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: this.refreshSecret });
    } catch {
      this.clearCookies(res);
      throw new UnauthorizedException('Refresh token eskirgan');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { team: true, partnerGroup: true } });
    if (!user?.refreshTokenHash || user.status !== 'active' || user.isActive === false) {
      this.clearCookies(res);
      throw new UnauthorizedException('Sessiya topilmadi');
    }
    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) {
      this.clearCookies(res);
      throw new UnauthorizedException('Sessiya topilmadi');
    }
    // Do not rotate the refresh token here. Several tabs can refresh an
    // expired access token at the same time; rotating a single stored hash
    // would make the slower tab look logged out even though the session is
    // still valid. The refresh JWT is still verified and compared with the
    // stored hash before this point.
    await this.issueAccessToken(user, res);
    return publicUser(user);
  }

  async logout(userId: string | undefined, refreshToken: string | undefined, res: Response) {
    let resolvedUserId = userId;
    if (!resolvedUserId && refreshToken) {
      try {
        const payload: any = await this.jwt.verifyAsync(refreshToken, { secret: this.refreshSecret });
        resolvedUserId = payload.sub;
      } catch {
        // The cookie is cleared below even when it is already expired.
      }
    }
    if (resolvedUserId) await this.prisma.user.update({ where: { id: resolvedUserId }, data: { refreshTokenHash: null } }).catch(() => null);
    this.clearCookies(res);
    return { ok: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, actor?: any) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(actor?.role)) throw new ForbiddenException('Parolni faqat admin almashtiradi');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Joriy parol noto'g'ri");
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12), refreshTokenHash: null } });
    return { ok: true };
  }

  async issueTokens(user: { id: string; role: string }, res: Response) {
    await this.issueAccessToken(user, res);
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: this.refreshSecret, expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d' },
    );
    await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: await bcrypt.hash(refreshToken, 12) } });
    const cookieOptions = this.cookieOptions();
    res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
  }

  private async issueAccessToken(user: { id: string; role: string }, res: Response) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: this.accessSecret, expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '15m' },
    );
    const cookieOptions = this.cookieOptions();
    res.cookie(ACCESS_COOKIE, accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
  }

  clearCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, this.cookieOptions());
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private cookieOptions() {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || '';
    const secure = this.config.get<string>('NODE_ENV') === 'production' || frontendUrl.split(',').some((origin) => origin.trim().startsWith('https://'));
    return { httpOnly: true, sameSite: secure ? ('none' as const) : ('lax' as const), secure, path: '/' };
  }

  private get accessSecret() {
    return this.config.get<string>('JWT_SECRET') || 'dev-access-secret';
  }

  private get refreshSecret() {
    return this.config.get<string>('JWT_REFRESH_SECRET') || 'dev-refresh-secret';
  }
}
