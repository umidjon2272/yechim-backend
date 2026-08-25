import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { GroupsService } from './groups.service';

@Controller('customer-groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @RequirePermissions('customers.view')
  @Get()
  list(@Query() query: any, @Req() req: Request & { user?: any }) {
    return this.groups.list(query, req.user);
  }

  @RequirePermissions('customers.view')
  @Get(':id/partner-summary')
  partnerSummary(@Param('id') id: string, @Query() query: any, @Req() req: Request & { user?: any }) {
    return this.groups.partnerSummary(id, query, req.user);
  }

  @RequirePermissions('customers.create')
  @Post()
  create(@Body() body: any, @Req() req: Request & { user?: any }) {
    return this.groups.create(body, req.user);
  }

  @RequirePermissions('customers.edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.groups.update(id, body, req.user);
  }

  @RequirePermissions('customers.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.groups.remove(id, req.user);
  }
}
