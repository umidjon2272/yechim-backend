import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
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

  @RequirePermissions('settings.edit')
  @Post('meta/customer-stages')
  createMetaStage(@Body() body: any) {
    return this.pipelines.createStage(body);
  }

  @RequirePermissions('settings.edit')
  @Patch('meta/customer-stages/:id')
  updateMetaStage(@Param('id') id: string, @Body() body: any) {
    return this.pipelines.updateStage(id, body);
  }

  @RequirePermissions('settings.edit')
  @Delete('meta/customer-stages/:id')
  deleteMetaStage(@Param('id') id: string, @Body() body: any) {
    return this.pipelines.deleteStage(id, body?.replacementStageId);
  }

  @RequirePermissions('settings.edit')
  @Post('pipelines/:pipelineId/stages')
  createStage(@Param('pipelineId') pipelineId: string, @Body() body: any) {
    return this.pipelines.createStage(body, pipelineId);
  }

  @RequirePermissions('settings.edit')
  @Patch('stages/:id')
  updateStage(@Param('id') id: string, @Body() body: any) {
    return this.pipelines.updateStage(id, body);
  }

  @RequirePermissions('settings.edit')
  @Patch('stages/reorder')
  reorder(@Body() body: any) {
    return this.pipelines.reorder(body);
  }

  @RequirePermissions('settings.edit')
  @Delete('stages/:id')
  deleteStage(@Param('id') id: string, @Body() body: any) {
    return this.pipelines.deleteStage(id, body?.replacementStageId);
  }
}
