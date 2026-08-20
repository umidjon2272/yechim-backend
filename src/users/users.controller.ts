import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { Request } from 'express';
import { publicUser } from '../common/mappers';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@Req() req: Request & { user?: any }) {
    return publicUser(req.user);
  }

  @Patch('me')
  updateMe(@Req() req: Request & { user?: any }, @Body() body: any) {
    return this.users.updateMe(req.user.id, body);
  }

  @Patch('me/login')
  updateMyLogin(@Req() req: Request & { user?: any }, @Body() body: any) {
    return this.users.updateMyLogin(req.user, body.username);
  }
}
