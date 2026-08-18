import { Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { NotificationsService } from './notifications.service';

type AuthRequest = Request & { user?: any };

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // Notifications contain task/reminder details and are not part of the
  // partner-facing customer view.
  @RequirePermissions('tasks.view')
  @Get()
  list(@Query() query: any, @Req() req: AuthRequest) {
    return this.notifications.list(query, req.user);
  }

  @RequirePermissions('tasks.view')
  @Get('unread-count')
  unreadCount(@Req() req: AuthRequest) {
    return this.notifications.unreadCount(req.user);
  }

  @RequirePermissions('tasks.view')
  @Patch(':id/read')
  markRead(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.notifications.markRead(id, req.user);
  }

  @RequirePermissions('tasks.view')
  @Post('read-all')
  markAllRead(@Req() req: AuthRequest) {
    return this.notifications.markAllRead(req.user);
  }
}
