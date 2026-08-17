import { Controller, Get, Param } from '@nestjs/common';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { StatisticsService } from './statistics.service';

@Controller('analytics')
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  @RequirePermissions('dashboard.view')
  @Get('dashboard-summary')
  dashboard() {
    return this.statistics.dashboardSummary();
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
  revenue() {
    return this.statistics.revenue();
  }

  @RequirePermissions('dashboard.view')
  @Get('installations-by-status')
  installationsByStatus() {
    return this.statistics.byStatus('installation');
  }

  @RequirePermissions('employees.view')
  @Get('employee-performance/:id')
  employeePerformance(@Param('id') id: string) {
    return this.statistics.employeePerformance(id);
  }
}
