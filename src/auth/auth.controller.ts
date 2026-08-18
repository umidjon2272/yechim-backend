import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { publicUser } from '../common/mappers';
import { Public } from '../permissions/public.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
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
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh((req as any).cookies?.refreshToken, res);
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request & { user?: any }, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req.user?.id, (req as any).cookies?.refreshToken, res);
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
