import { Controller, Get, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { StatisticsService } from './statistics.service';

@Controller('analytics')
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  @RequirePermissions('dashboard.view')
  @Get('dashboard-summary')
  dashboard(@Req() req: Request & { user?: any }) {
    return this.statistics.dashboardSummary(req.user);
  }

  @RequirePermissions('dashboard.view')
  @Get('leads-by-status')
  leadsByStatus() {
    return this.statistics.byStatus('lead');
  }

  @RequirePermissions('dashboard.view')
  @Get('deals-by-stage')
  dealsByStage() {
    return this.statistics.dealsByStage();
  }

  @RequirePermissions('profit.view')
  @Get('revenue')
  revenue(@Req() req: Request & { user?: any }) {
    return this.statistics.revenue(req.user);
  }

  @RequirePermissions('dashboard.view')
  @Get('installations-by-status')
  installationsByStatus() {
    return this.statistics.byStatus('installation');
  }

  @RequirePermissions('employees.view')
  @Get('employee-performance/:id')
  employeePerformance(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.statistics.employeePerformance(id, req.user);
  }
}
