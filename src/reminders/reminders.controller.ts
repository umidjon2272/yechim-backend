import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { RemindersService } from './reminders.service';

type AuthRequest = Request & { user?: any };

@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @RequirePermissions('customers.view')
  @Get()
  list(@Query() query: any, @Req() req: AuthRequest) {
    return this.reminders.list(query, req.user);
  }

  @RequirePermissions('customers.view')
  @Get('today')
  today(@Req() req: AuthRequest) {
    return this.reminders.list({ today: true }, req.user);
  }

  @RequirePermissions('customers.view')
  @Get('overdue')
  overdue(@Req() req: AuthRequest) {
    return this.reminders.list({ overdue: true }, req.user);
  }

  @RequirePermissions('customers.edit')
  @Post()
  create(@Body() body: any, @Req() req: AuthRequest) {
    return this.reminders.create(body, req.user);
  }

  @RequirePermissions('customers.edit')
  @Post(':id/complete')
  complete(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.reminders.complete(id, req.user);
  }

  @RequirePermissions('customers.edit')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.reminders.cancel(id, req.user);
  }

  @RequirePermissions('customers.view')
  @Get('/work/today')
  workToday(@Req() req: AuthRequest) {
    return this.reminders.todayWork(req.user);
  }
}
