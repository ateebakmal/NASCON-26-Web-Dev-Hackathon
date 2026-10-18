import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ESCALATED_REPEATEDLY_THRESHOLD } from "@ubp/shared";

/**
 * Each figure is computed once here and its drill-down reads the SAME filter,
 * so a number and the list behind it can never disagree (F5.2, F5.3, Q12).
 * `scopeUserId` is set for a plain User so they see personal figures, and left
 * undefined for Owner/Admin who see company-wide ones (F5.4).
 */
/** Local-calendar day key (YYYY-MM-DD), never UTC-shifted. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(workspaceId: string, scopeUserId?: string) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const leadScope: Prisma.LeadWhereInput = scopeUserId ? { currentOwnerId: scopeUserId } : {};
    const dealScope: Prisma.OpportunityWhereInput = scopeUserId ? { ownerId: scopeUserId } : {};

    const [
      newLeadsToday,
      openLeads,
      escalations24h,
      recoveryCount,
      responseStats,
      stages,
      availability,
      collected,
      upcomingAppointments,
      revenueSeries,
      escalationSeries,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { workspaceId, ...leadScope, createdAt: { gte: startOfToday } } }),
      this.prisma.lead.count({
        where: { workspaceId, ...leadScope, status: { in: ["NEW", "ASSIGNED", "ESCALATED"] } },
      }),
      this.prisma.auditLog.count({
        where: { workspaceId, eventType: "lead.escalated", createdAt: { gte: last24h } },
      }),
      this.prisma.lead.count({
        where: {
          workspaceId,
          ...leadScope,
          status: { in: ["NEW", "ASSIGNED", "ESCALATED"] },
          escalationCount: { gte: ESCALATED_REPEATEDLY_THRESHOLD },
        },
      }),
      this.prisma.lead.findMany({
        where: { workspaceId, ...leadScope, firstAssignedAt: { not: null }, firstAckAt: { not: null } },
        select: { firstAssignedAt: true, firstAckAt: true },
        take: 500,
      }),
      this.prisma.stage.findMany({
        where: { pipeline: { workspaceId } },
        orderBy: { position: "asc" },
        include: {
          opportunities: {
            where: { workspaceId, ...dealScope },
            select: { value: true },
          },
        },
      }),
      this.prisma.employeeStatus.groupBy({
        by: ["availability"],
        where: { workspaceId },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { workspaceId, status: "PAID", paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.appointment.findMany({
        where: { workspaceId, startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 5,
        include: { contact: { select: { name: true } } },
      }),
      this.revenueSeries(workspaceId),
      this.escalationSeries(workspaceId),
    ]);

    // Time to first response: first assignment -> first acknowledgement.
    const responseMs = responseStats
      .map((l) => (l.firstAckAt!.getTime() - l.firstAssignedAt!.getTime()))
      .filter((ms) => ms >= 0);
    const avgResponseSeconds = responseMs.length
      ? Math.round(responseMs.reduce((a, b) => a + b, 0) / responseMs.length / 1000)
      : 0;

    // Open pipeline value by stage, plus won/lost counts, from stage TYPE so
    // a renamed stage never breaks the figure (A2.2). Stages that share a name
    // across pipelines (every pipeline has its own "Won") are merged, otherwise
    // the chart shows the same label twice.
    const merged = new Map<string, { stageId: string; name: string; type: string; color: string; count: number; value: number }>();
    for (const s of stages) {
      const key = `${s.name}:${s.type}`;
      const entry = merged.get(key) ?? {
        stageId: s.id,
        name: s.name,
        type: s.type,
        color: s.color,
        count: 0,
        value: 0,
      };
      entry.count += s.opportunities.length;
      entry.value += s.opportunities.reduce((sum, o) => sum + Number(o.value), 0);
      merged.set(key, entry);
    }
    const byStage = Array.from(merged.values()).filter((s) => s.count > 0);

    const openPipelineValue = byStage
      .filter((s) => s.type === "OPEN")
      .reduce((sum, s) => sum + s.value, 0);
    const wonCount = byStage.filter((s) => s.type === "WON").reduce((n, s) => n + s.count, 0);
    const lostCount = byStage.filter((s) => s.type === "LOST").reduce((n, s) => n + s.count, 0);
    const openCount = byStage.filter((s) => s.type === "OPEN").reduce((n, s) => n + s.count, 0);
    const totalClosed = wonCount + lostCount;

    return {
      newLeadsToday,
      openLeads,
      escalations24h,
      recoveryCount,
      avgResponseSeconds,
      openPipelineValue,
      collectedThisMonth: Number(collected._sum.amount ?? 0),
      conversionRate: totalClosed > 0 ? Math.round((wonCount / totalClosed) * 100) : 0,
      leadsManagement: { open: openCount, inProgress: openLeads, lost: lostCount, won: wonCount },
      byStage,
      availability: availability.map((a) => ({ availability: a.availability, count: a._count })),
      upcomingAppointments,
      revenueSeries,
      escalationSeries,
    };
  }

  /** Collected revenue per month for the last 12 months. */
  private async revenueSeries(workspaceId: string) {
    const since = new Date();
    since.setMonth(since.getMonth() - 11);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const payments = await this.prisma.payment.findMany({
      where: { workspaceId, status: "PAID", paidAt: { gte: since } },
      select: { amount: true, paidAt: true },
    });

    const buckets = new Map<string, number>();
    for (let i = 0; i < 12; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
    }
    for (const p of payments) {
      if (!p.paidAt) continue;
      const key = `${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, "0")}`;
      if (buckets.has(key)) buckets.set(key, buckets.get(key)! + Number(p.amount));
    }
    return Array.from(buckets.entries()).map(([month, value]) => ({ month, value }));
  }

  /** Escalations per day for the last 7 days, bucketed in the server's local day. */
  private async escalationSeries(workspaceId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);

    const rows = await this.prisma.auditLog.findMany({
      where: { workspaceId, eventType: "lead.escalated", createdAt: { gte: since } },
      select: { createdAt: true },
    });

    // Both the buckets and the rows must be keyed the same way. Using
    // toISOString() here would format a LOCAL midnight as a UTC instant,
    // shifting every key back a day east of Greenwich and silently dropping
    // today's escalations.
    const buckets = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      buckets.set(localDayKey(d), 0);
    }
    for (const r of rows) {
      const key = localDayKey(r.createdAt);
      if (buckets.has(key)) buckets.set(key, buckets.get(key)! + 1);
    }
    return Array.from(buckets.entries()).map(([day, count]) => ({ day, count }));
  }
}
