import { Module } from '@nestjs/common';
import { ActivitiesController, CommentsController, TimelineController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  controllers: [ActivitiesController, CommentsController, TimelineController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
