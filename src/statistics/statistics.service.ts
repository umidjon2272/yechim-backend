import { Injectable } from '@nestjs/common';
import { toNumber } from '../common/mappers';
import { canViewFinancials } from '../common/access';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async employeePerformance(id: string, actor?: any) {
    const [customers, deals, tasksCompleted, tasksInProgress, installationsCompleted, stages] = await Promise.all([
      this.prisma.customer.count({ where: { assignedEmployeeId: id, deletedAt: null } }),
      this.prisma.deal.findMany({ where: { salesEmployeeId: id } }),
      this.prisma.task.count({ where: { assignedToId: id, status: 'COMPLETED' } }),
      this.prisma.task.count({ where: { assignedToId: id, status: { in: ['TODO', 'IN_PROGRESS'] } } }),
      this.prisma.installation.count({ where: { assignedEmployeeId: id, status: { in: ['COMPLETED', 'DONE', 'INSTALLED'] } } }),
      this.prisma.stage.findMany({ orderBy: { order: 'asc' }, include: { _count: { select: { customers: { where: { assignedEmployeeId: id, deletedAt: null } } } } } }),
    ]);
    const revenue = deals.reduce((sum, deal) => sum + toNumber(deal.value), 0);
    return {
      customers,
      deals: deals.length,
      ...(canViewFinancials(actor) ? { revenue, salesAmount: revenue } : {}),
      installationsCompleted,
      tasksCompleted,
      tasksInProgress,
      activeTasks: tasksInProgress,
      stageStats: stages.map((s) => ({ id: s.id, label: s.label, count: s._count.customers })),
    };
  }

  async dashboardSummary(actor?: any) {
    const [totalLeads, activeDeals, wonDeals, revenueRows, pendingPayments, installations, tasks] = await Promise.all([
      this.prisma.lead.count(),
      this.prisma.deal.count({ where: { stage: { notIn: ['WON', 'LOST'] } } }),
      this.prisma.deal.count({ where: { stage: 'WON' } }),
      this.prisma.payment.findMany({ where: { status: { in: ['PAID', 'PARTIAL'] } } }),
      this.prisma.payment.count({ where: { status: 'PENDING' } }),
      this.prisma.installation.count(),
      this.prisma.task.count({ where: { status: { in: ['TODO', 'IN_PROGRESS'] } } }),
    ]);
    return {
      totalLeads,
      activeDeals,
      wonDeals,
      ...(canViewFinancials(actor) ? { revenue: revenueRows.reduce((s, p) => s + toNumber(p.amount), 0), pendingPayments } : {}),
      installations,
      tasks,
    };
  }

  async byStatus(model: 'lead' | 'installation', field = 'status') {
    const rows = model === 'lead' ? await this.prisma.lead.findMany() : await this.prisma.installation.findMany();
    const counts: Record<string, number> = {};
    rows.forEach((row: any) => (counts[row[field]] = (counts[row[field]] || 0) + 1));
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }

  async dealsByStage() {
    const rows = await this.prisma.deal.findMany();
    const counts: Record<string, number> = {};
    rows.forEach((row) => (counts[row.stage] = (counts[row.stage] || 0) + 1));
    return Object.entries(counts).map(([stage, count]) => ({ stage, count }));
  }

  async revenue(actor?: any) {
    if (!canViewFinancials(actor)) return [];
    const rows = await this.prisma.payment.findMany({ where: { status: { in: ['PAID', 'PARTIAL'] } } });
    return [{ period: 'Shu oy', amount: rows.reduce((sum, row) => sum + toNumber(row.amount), 0) }];
  }
}
