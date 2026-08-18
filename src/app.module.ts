import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { EmployeesModule } from './employees/employees.module';
import { GroupsModule } from './groups/groups.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PermissionsGuard } from './permissions/permissions.guard';
import { PipelinesModule } from './pipelines/pipelines.module';
import { PrismaModule } from './prisma/prisma.module';
import { StagesModule } from './stages/stages.module';
import { StatisticsModule } from './statistics/statistics.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { CommonModule } from './common/common.module';
import { ActivitiesModule } from './activities/activities.module';
import { RemindersModule } from './reminders/reminders.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InstallationsModule } from './installations/installations.module';
import { PartnersModule } from './partners/partners.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    PermissionsModule,
    UsersModule,
    EmployeesModule,
    CustomersModule,
    PipelinesModule,
    StagesModule,
    GroupsModule,
    TasksModule,
    StatisticsModule,
    CommonModule,
    ActivitiesModule,
    RemindersModule,
    NotificationsModule,
    InstallationsModule,
    PartnersModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: PermissionsGuard }],
})
export class AppModule {}
