import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(workspaceId: string, filters?: { startDate?: string; endDate?: string }) {
    const startDate = filters?.startDate
      ? new Date(filters.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = filters?.endDate ? new Date(filters.endDate) : new Date();

    const [totalLeads, totalSales, totalRevenue, leadsCount, salesCount] = await Promise.all([
      this.prisma.lead.count({
        where: { workspaceId, createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.payment.count({
        where: {
          lead: { workspaceId },
          status: 'APPROVED',
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          lead: { workspaceId },
          status: 'APPROVED',
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      }),
      this.prisma.lead.count({ where: { workspaceId } }),
      this.prisma.payment.count({
        where: { lead: { workspaceId }, status: 'APPROVED' },
      }),
    ]);

    const conversionRate = totalLeads > 0 ? (totalSales / totalLeads) * 100 : 0;
    const averageTicket = totalSales > 0 ? Number(totalRevenue._sum.amount || 0) / totalSales : 0;

    return {
      period: { startDate, endDate },
      leads: { total: totalLeads, totalAll: leadsCount },
      sales: { total: totalSales, totalAll: salesCount },
      revenue: {
        total: Number(totalRevenue._sum.amount || 0),
      },
      conversionRate: Math.round(conversionRate * 100) / 100,
      averageTicket: Math.round(averageTicket * 100) / 100,
    };
  }

  async getLeadsByDay(workspaceId: string, filters?: { startDate?: string; endDate?: string }) {
    const startDate = filters?.startDate
      ? new Date(filters.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = filters?.endDate ? new Date(filters.endDate) : new Date();

    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, createdAt: { gte: startDate, lte: endDate } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const grouped = new Map<string, number>();
    leads.forEach((lead) => {
      const day = lead.createdAt.toISOString().split('T')[0];
      grouped.set(day, (grouped.get(day) || 0) + 1);
    });

    return Array.from(grouped, ([date, count]) => ({ date, count }));
  }

  async getSalesByDay(workspaceId: string, filters?: { startDate?: string; endDate?: string }) {
    const startDate = filters?.startDate
      ? new Date(filters.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = filters?.endDate ? new Date(filters.endDate) : new Date();

    const sales = await this.prisma.payment.findMany({
      where: {
        lead: { workspaceId },
        status: 'APPROVED',
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { createdAt: true, amount: true },
      orderBy: { createdAt: 'asc' },
    });

    const grouped = new Map<string, { count: number; revenue: number }>();
    sales.forEach((sale) => {
      const day = sale.createdAt.toISOString().split('T')[0];
      const current = grouped.get(day) || { count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += Number(sale.amount);
      grouped.set(day, current);
    });

    return Array.from(grouped, ([date, data]) => ({
      date,
      sales: data.count,
      revenue: Math.round(data.revenue * 100) / 100,
    }));
  }

  async getSalesBySource(workspaceId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { lead: { workspaceId }, status: 'APPROVED' },
      include: {
        lead: {
          include: { tracking: true },
        },
      },
    });

    const bySource = new Map<string, { count: number; revenue: number }>();

    payments.forEach((payment) => {
      const source = payment.lead?.tracking?.utmSource || 'direct';
      const current = bySource.get(source) || { count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += Number(payment.amount);
      bySource.set(source, current);
    });

    return Array.from(bySource, ([source, data]) => ({
      source,
      sales: data.count,
      revenue: Math.round(data.revenue * 100) / 100,
    }));
  }
}
