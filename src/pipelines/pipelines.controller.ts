import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { PipelinesService } from './pipelines.service';

@Controller()
export class PipelinesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @RequirePermissions('settings.view')
  @Get('pipelines')
  listPipelines() {
    return this.pipelines.pipelines();
  }

  @RequirePermissions('customers.view')
  @Get('meta/customer-stages')
  listStages() {
    return this.pipelines.stages();
  }

  @RequirePermissions('customers.edit')
  @Post('meta/customer-stages')
  createMetaStage(@Body() body: any, @Req() req: Request & { user?: any }) {
    return this.pipelines.createStage(body, undefined, req.user);
  }

  @RequirePermissions('customers.edit')
  @Patch('meta/customer-stages/:id')
  updateMetaStage(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.pipelines.updateStage(id, body, req.user);
  }

  @RequirePermissions('customers.edit')
  @Delete('meta/customer-stages/:id')
  deleteMetaStage(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.pipelines.deleteStage(id, body?.replacementStageId, req.user);
  }

  @RequirePermissions('settings.edit')
  @Post('pipelines/:pipelineId/stages')
  createStage(@Param('pipelineId') pipelineId: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.pipelines.createStage(body, pipelineId, req.user);
  }

  @RequirePermissions('customers.edit')
  @Patch('stages/reorder')
  reorder(@Body() body: any, @Req() req: Request & { user?: any }) {
    return this.pipelines.reorder(body, req.user);
  }

  @RequirePermissions('customers.edit')
  @Patch('stages/:id')
  updateStage(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.pipelines.updateStage(id, body, req.user);
  }

  @RequirePermissions('customers.edit')
  @Delete('stages/:id')
  deleteStage(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.pipelines.deleteStage(id, body?.replacementStageId, req.user);
  }
}
