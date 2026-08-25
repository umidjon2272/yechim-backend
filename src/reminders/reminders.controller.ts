import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequireAnyPermission } from '../permissions/permissions.decorator';
import { RemindersService } from './reminders.service';

type AuthRequest = Request & { user?: any };

@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @RequireAnyPermission('reminders.view', 'calls.view')
  @Get()
  list(@Query() query: any, @Req() req: AuthRequest) {
    return this.reminders.list(query, req.user);
  }

  @RequireAnyPermission('reminders.view', 'calls.view')
  @Get('today')
  today(@Req() req: AuthRequest) {
    return this.reminders.list({ today: true }, req.user);
  }

  @RequireAnyPermission('reminders.view', 'calls.view')
  @Get('overdue')
  overdue(@Req() req: AuthRequest) {
    return this.reminders.list({ overdue: true }, req.user);
  }

  @RequireAnyPermission('reminders.create', 'calls.create')
  @Post()
  create(@Body() body: any, @Req() req: AuthRequest) {
    return this.reminders.create(body, req.user);
  }

  @RequireAnyPermission('reminders.edit', 'calls.create')
  @Post(':id/complete')
  complete(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.reminders.complete(id, req.user);
  }

  @RequireAnyPermission('reminders.edit', 'calls.create')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.reminders.cancel(id, req.user);
  }

  @RequireAnyPermission('reminders.view', 'calls.view')
  @Get('/work/today')
  workToday(@Req() req: AuthRequest) {
    return this.reminders.todayWork(req.user);
  }
}
