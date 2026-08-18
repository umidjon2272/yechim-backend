import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { publicUser } from '../common/mappers';
import { Public } from '../permissions/public.decorator';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, LogoutDto, RefreshDto, RegisterDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Account creation is an admin operation. Keeping this endpoint public
  // would let anyone create an ADMIN account in production.
  @RequirePermissions('employees.create')
  @Post('register')
  register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.register(dto, res);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto.email, dto.password, res);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(dto.refreshToken, res);
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request & { user?: any }, @Body() dto: LogoutDto, @Res({ passthrough: true }) res: Response) {
    const authorization = req.headers.authorization;
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    return this.auth.logout(req.user?.id, dto.refreshToken, res, accessToken);
  }

  @Get('me')
  me(@Req() req: Request & { user?: any }) {
    return publicUser(req.user);
  }

  @Post('change-password')
  changePassword(@Req() req: Request & { user?: any }, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.id, dto.currentPassword, dto.newPassword, req.user);
  }
}
