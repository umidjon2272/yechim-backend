import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
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
      include: { team: true, allowedCustomerGroups: true },
    });
    if (!user || user.status !== 'active') throw new UnauthorizedException("Login yoki parol noto'g'ri");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Login yoki parol noto'g'ri");
    await this.issueTokens(user, res);
    return publicUser(user);
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token topilmadi');
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('Refresh token eskirgan');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { team: true, allowedCustomerGroups: true } });
    if (!user?.refreshTokenHash) throw new UnauthorizedException('Sessiya topilmadi');
    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Sessiya topilmadi');
    await this.issueTokens(user, res);
    return publicUser(user);
  }

  async logout(userId: string | undefined, res: Response) {
    if (userId) await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } }).catch(() => null);
    this.clearCookies(res);
    return { ok: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Joriy parol noto'g'ri");
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12), refreshTokenHash: null } });
    return { ok: true };
  }

  async issueTokens(user: { id: string; role: string }, res: Response) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: this.accessSecret, expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '15m' },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: this.refreshSecret, expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d' },
    );
    await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: await bcrypt.hash(refreshToken, 12) } });
    const secure = this.config.get<string>('NODE_ENV') === 'production';
    res.cookie(ACCESS_COOKIE, accessToken, { httpOnly: true, sameSite: secure ? 'none' : 'lax', secure, path: '/', maxAge: 15 * 60 * 1000 });
    res.cookie(REFRESH_COOKIE, refreshToken, { httpOnly: true, sameSite: secure ? 'none' : 'lax', secure, path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
  }

  clearCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  private get accessSecret() {
    return this.config.get<string>('JWT_SECRET') || 'dev-access-secret';
  }

  private get refreshSecret() {
    return this.config.get<string>('JWT_REFRESH_SECRET') || 'dev-refresh-secret';
  }
}
