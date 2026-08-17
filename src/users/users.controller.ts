import { Body, Controller, Patch, Req } from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  updateMe(@Req() req: Request & { user?: any }, @Body() body: any) {
    return this.users.updateMe(req.user.id, body);
  }
}
