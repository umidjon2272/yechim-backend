import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { CreateEmployeeDto } from './dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @RequirePermissions('employees.view')
  @Get()
  list(@Query() query: any) {
    return this.employees.list(query);
  }

  @RequirePermissions('employees.view')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.employees.get(id);
  }

  @RequirePermissions('employees.create')
  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @RequirePermissions('employees.edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.employees.update(id, body, req.user);
  }

  @RequirePermissions('employees.edit')
  @Post(':id/activate')
  activate(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.employees.setStatus(id, 'active', req.user);
  }

  @RequirePermissions('employees.edit')
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.employees.setStatus(id, 'inactive', req.user);
  }

  @RequirePermissions('employees.edit')
  @Post(':id/password-reset')
  resetPassword(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.employees.resetPassword(id, body.password, req.user);
  }

  @RequirePermissions('employees.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.employees.remove(id, req.user);
  }

  @RequirePermissions('employees.view')
  @Get(':id/tasks')
  tasks(@Param('id') id: string) {
    return this.employees.tasks(id);
  }

  @RequirePermissions('employees.view')
  @Get(':id/leads')
  leads(@Param('id') id: string) {
    return this.employees.leads(id);
  }

  @RequirePermissions('employees.view')
  @Get(':id/deals')
  deals(@Param('id') id: string) {
    return this.employees.deals(id);
  }

  @RequirePermissions('employees.view')
  @Get(':id/installations')
  installations(@Param('id') id: string) {
    return this.employees.installations(id);
  }
}
