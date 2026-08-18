import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { NotificationsService } from './notifications.service';

type AuthRequest = Request & { user?: any };

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @RequirePermissions('customers.view')
  @Get()
  list(@Query() query: any, @Req() req: AuthRequest) {
    return this.notifications.list(query, req.user);
  }

  @RequirePermissions('customers.view')
  @Get('unread-count')
  unreadCount(@Req() req: AuthRequest) {
    return this.notifications.unreadCount(req.user);
  }

  @RequirePermissions('customers.view')
  @Post(':id/read')
  markRead(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.notifications.markRead(id, req.user);
  }

  @RequirePermissions('customers.view')
  @Post('mark-all-read')
  markAllRead(@Req() req: AuthRequest) {
    return this.notifications.markAllRead(req.user);
  }
}
