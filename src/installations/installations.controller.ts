import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { InstallationsService } from './installations.service';

type AuthRequest = Request & { user?: any };

@Controller('installations')
export class InstallationsController {
  constructor(private readonly installations: InstallationsService) {}

  @RequirePermissions('customers.view')
  @Get()
  list(@Query() query: any, @Req() req: AuthRequest) {
    return this.installations.list(query, req.user);
  }

  @RequirePermissions('customers.view')
  @Get(':id')
  get(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.installations.get(id, req.user);
  }

  @RequirePermissions('customers.edit')
  @Post()
  create(@Body() body: any, @Req() req: AuthRequest) {
    return this.installations.create(body, req.user);
  }

  @RequirePermissions('customers.edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: AuthRequest) {
    return this.installations.update(id, body, req.user);
  }
}
