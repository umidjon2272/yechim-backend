import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { GroupsService } from './groups.service';

@Controller('customer-groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @RequirePermissions('customers.view')
  @Get()
  list(@Query() query: any) {
    return this.groups.list(query);
  }

  @RequirePermissions('customers.create')
  @Post()
  create(@Body() body: any) {
    return this.groups.create(body);
  }

  @RequirePermissions('customers.edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.groups.update(id, body);
  }

  @RequirePermissions('customers.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groups.remove(id);
  }
}
