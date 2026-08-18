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
const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
    // A browser can intentionally switch the active account. This only clears
    // that browser's cookies; it never revokes sessions on the server.
    this.clearCookies(res);
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

    const session = payload?.sid
      ? await this.prisma.userSession.findUnique({
          where: { id: payload.sid },
          include: { user: { include: { team: true, partnerGroup: true } } },
        })
      : null;
    const user = session?.user;
    if (
      !session ||
      !user ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      user.status !== 'active' ||
      user.isActive === false
    ) {
      this.clearCookies(res);
      throw new UnauthorizedException('Sessiya topilmadi');
    }

    const ok = await bcrypt.compare(refreshToken, session.tokenHash);
    if (!ok) {
      this.clearCookies(res);
      throw new UnauthorizedException('Sessiya topilmadi');
    }

    // The refresh token belongs to this UserSession only. It is intentionally
    // not rotated in the database: concurrent tabs sharing a browser cookie
    // must not invalidate each other during an access-token refresh.
    await this.issueAccessToken(user, session.id, res);
    return publicUser(user);
  }

  async logout(userId: string | undefined, refreshToken: string | undefined, res: Response, accessToken?: string) {
    let sessionId: string | undefined;
    let resolvedUserId = userId;

    if (refreshToken) {
      try {
        const payload: any = await this.jwt.verifyAsync(refreshToken, { secret: this.refreshSecret });
        sessionId = payload?.sid;
        resolvedUserId ||= payload?.sub;
      } catch {
        // The cookies are cleared below even when the refresh token is stale.
      }
    }
    if (!sessionId && accessToken) {
      try {
        const payload: any = await this.jwt.verifyAsync(accessToken, { secret: this.accessSecret });
        sessionId = payload?.sid;
        resolvedUserId ||= payload?.sub;
      } catch {
        // The cookies are cleared below even when the access token is stale.
      }
    }

    if (sessionId) {
      await this.prisma.userSession
        .updateMany({
          where: { id: sessionId, ...(resolvedUserId ? { userId: resolvedUserId } : {}) },
          data: { revokedAt: new Date() },
        })
        .catch(() => null);
    }
    this.clearCookies(res);
    return { ok: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, actor?: any) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(String(actor?.role || '').toUpperCase())) throw new ForbiddenException('Parolni faqat admin almashtiradi');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Joriy parol noto'g'ri");
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    await this.revokeAllSessions(userId);
    return { ok: true };
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async issueTokens(user: { id: string; role: string }, res: Response) {
    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash: 'pending',
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, sid: session.id },
      { secret: this.refreshSecret, expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d' },
    );
    await this.prisma.userSession.update({ where: { id: session.id }, data: { tokenHash: await bcrypt.hash(refreshToken, 12) } });

    await this.issueAccessToken(user, session.id, res);
    const cookieOptions = this.cookieOptions();
    res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: REFRESH_TTL_MS });
  }

  private async issueAccessToken(user: { id: string; role: string }, sessionId: string, res: Response) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, sid: sessionId },
      { secret: this.accessSecret, expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '15m' },
    );
    const cookieOptions = this.cookieOptions();
    res.cookie(ACCESS_COOKIE, accessToken, { ...cookieOptions, maxAge: ACCESS_TTL_MS });
  }

  clearCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, this.cookieOptions());
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    // Cookies used by older/demo builds cannot be read by the frontend when
    // they are httpOnly, so expire the common legacy names server-side too.
    ['token', 'authToken', 'auth_token', 'sid', 'session', 'sessionId'].forEach((name) => res.clearCookie(name, { path: '/' }));
  }

  private cookieOptions() {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || '';
    const secure = this.config.get<string>('NODE_ENV') === 'production' || frontendUrl.split(',').some((origin) => origin.trim().startsWith('https://'));
    return { httpOnly: true, sameSite: secure ? ('none' as const) : ('lax' as const), secure, path: '/' };
  }

  private get accessSecret() {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret && this.isProduction) throw new Error('JWT_SECRET production muhitida majburiy');
    return secret || 'dev-access-secret';
  }

  private get refreshSecret() {
    const secret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!secret && this.isProduction) throw new Error('JWT_REFRESH_SECRET production muhitida majburiy');
    return secret || 'dev-refresh-secret';
  }

  private get isProduction() {
    return this.config.get<string>('NODE_ENV') === 'production';
  }
}
