import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { ActivitiesService } from './activities.service';

type AuthRequest = Request & { user?: any };

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @RequirePermissions('customers.view')
  @Get()
  list(@Query() query: any, @Req() req: AuthRequest) {
    return this.activities.list(query, req.user);
  }

  @RequirePermissions('customers.view')
  @Get(':id')
  get(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.activities.get(id, req.user);
  }

  @RequirePermissions('customers.edit')
  @Post()
  create(@Body() body: any, @Req() req: AuthRequest) {
    return this.activities.create(body, req.user);
  }
}

@Controller('comments')
export class CommentsController {
  constructor(private readonly activities: ActivitiesService) {}

  @RequirePermissions('customers.view')
  @Get()
  list(@Query() query: any, @Req() req: AuthRequest) {
    return this.activities.comments(query, req.user);
  }

  @RequirePermissions('customers.edit')
  @Post()
  create(@Body() body: any, @Req() req: AuthRequest) {
    return this.activities.create({ ...body, type: 'NOTE' }, req.user);
  }

  @RequirePermissions('customers.edit')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.activities.remove(id, req.user);
  }
}

@Controller('timeline')
export class TimelineController {
  constructor(private readonly activities: ActivitiesService) {}

  @RequirePermissions('customers.view')
  @Get()
  get(@Query('entityType') entityType: string, @Query('entityId') entityId: string, @Req() req: AuthRequest) {
    if (entityType && entityType !== 'customer') return { items: [], total: 0 };
    return this.activities.timeline(entityId, req.user);
  }
}
