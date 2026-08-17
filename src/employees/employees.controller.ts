import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  update(@Param('id') id: string, @Body() body: any) {
    return this.employees.update(id, body);
  }

  @RequirePermissions('employees.edit')
  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.employees.setStatus(id, 'active');
  }

  @RequirePermissions('employees.edit')
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.employees.setStatus(id, 'inactive');
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
