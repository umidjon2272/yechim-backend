import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { CreateTaskDto } from './dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @RequirePermissions('tasks.view')
  @Get()
  list(@Query() query: any, @Req() req: Request & { user?: any }) {
    return this.tasks.list(query, req.user);
  }

  @RequirePermissions('tasks.view')
  @Get(':id')
  get(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.tasks.get(id, req.user);
  }

  @RequirePermissions('tasks.create')
  @Post()
  create(@Body() body: CreateTaskDto, @Req() req: Request & { user?: any }) {
    return this.tasks.create(body, req.user);
  }

  @RequirePermissions('tasks.edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.tasks.update(id, body, req.user);
  }

  @RequirePermissions('tasks.edit')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.tasks.cancel(id, req.user);
  }

  @RequirePermissions('tasks.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.tasks.remove(id, req.user);
  }
}
