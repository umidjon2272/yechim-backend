import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @RequirePermissions('customers.view')
  @Get()
  list(@Query() query: any, @Req() req: Request & { user?: any }) {
    return this.customers.list(query, req.user);
  }

  @RequirePermissions('customers.view')
  @Get(':id')
  get(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.customers.get(id, req.user);
  }

  @RequirePermissions('customers.create')
  @Post()
  create(@Body() body: any, @Req() req: Request & { user?: any }) {
    return this.customers.create(body, req.user);
  }

  @RequirePermissions('customers.edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.customers.update(id, body, req.user);
  }

  @RequirePermissions('customers.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.customers.softDelete(id, req.user);
  }

  @RequirePermissions('customers.delete')
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.customers.deactivate(id, req.user);
  }

  @RequirePermissions('customers.edit')
  @Patch(':id/stage')
  setStage(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.customers.setStage(id, body.stageId || body.stage, req.user);
  }

  @RequirePermissions('customers.edit')
  @Patch(':id/groups')
  setGroups(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.customers.setGroups(id, body.groupIds || [], req.user);
  }

  @RequirePermissions('customers.edit')
  @Post('bulk-move')
  bulkMove(@Body() body: any, @Req() req: Request & { user?: any }) {
    return this.customers.bulkMove(body, req.user);
  }

  @RequirePermissions('customers.view')
  @Get(':id/programs')
  programs(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.customers.programs(id, req.user);
  }

  @RequirePermissions('customers.edit')
  @Post(':id/programs')
  addProgram(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.customers.addProgram(id, body, req.user);
  }

  @RequirePermissions('customers.edit')
  @Patch(':id/programs/:programId')
  updateProgram(@Param('id') id: string, @Param('programId') programId: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.customers.updateProgram(id, programId, body, req.user);
  }

  @RequirePermissions('customers.edit')
  @Delete(':id/programs/:programId')
  removeProgram(@Param('id') id: string, @Param('programId') programId: string, @Req() req: Request & { user?: any }) {
    return this.customers.removeProgram(id, programId, req.user);
  }
}
