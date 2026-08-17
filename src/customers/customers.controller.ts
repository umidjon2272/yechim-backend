import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @RequirePermissions('customers.view')
  @Get()
  list(@Query() query: any) {
    return this.customers.list(query);
  }

  @RequirePermissions('customers.view')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @RequirePermissions('customers.create')
  @Post()
  create(@Body() body: any) {
    return this.customers.create(body);
  }

  @RequirePermissions('customers.edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.customers.update(id, body);
  }

  @RequirePermissions('customers.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customers.softDelete(id);
  }

  @RequirePermissions('customers.delete')
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.customers.deactivate(id);
  }

  @RequirePermissions('customers.edit')
  @Patch(':id/stage')
  setStage(@Param('id') id: string, @Body() body: any) {
    return this.customers.setStage(id, body.stageId || body.stage);
  }

  @RequirePermissions('customers.edit')
  @Patch(':id/groups')
  setGroups(@Param('id') id: string, @Body() body: any) {
    return this.customers.setGroups(id, body.groupIds || []);
  }

  @RequirePermissions('customers.edit')
  @Post('bulk-move')
  bulkMove(@Body() body: any) {
    return this.customers.bulkMove(body);
  }

  @RequirePermissions('customers.view')
  @Get(':id/programs')
  programs(@Param('id') id: string) {
    return this.customers.programs(id);
  }

  @RequirePermissions('customers.edit')
  @Post(':id/programs')
  addProgram(@Param('id') id: string, @Body() body: any) {
    return this.customers.addProgram(id, body);
  }

  @RequirePermissions('customers.edit')
  @Patch(':id/programs/:programId')
  updateProgram(@Param('id') id: string, @Param('programId') programId: string, @Body() body: any) {
    return this.customers.updateProgram(id, programId, body);
  }

  @RequirePermissions('customers.edit')
  @Delete(':id/programs/:programId')
  removeProgram(@Param('id') id: string, @Param('programId') programId: string) {
    return this.customers.removeProgram(id, programId);
  }
}
