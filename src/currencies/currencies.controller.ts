import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequireAnyPermission, RequirePermissions } from '../permissions/permissions.decorator';
import { CurrenciesService } from './currencies.service';

type AuthRequest = Request & { user?: any };

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currencies: CurrenciesService) {}

  @RequireAnyPermission('customers.view', 'settings.view')
  @Get()
  list(@Req() req: AuthRequest) {
    return this.currencies.list(req.user);
  }

  @RequirePermissions('settings.edit')
  @Post()
  create(@Body() body: any, @Req() req: AuthRequest) {
    return this.currencies.create(body, req.user);
  }

  @RequirePermissions('settings.edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: AuthRequest) {
    return this.currencies.update(id, body, req.user);
  }
}
