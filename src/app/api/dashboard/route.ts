import { prisma } from '@/lib/prisma';
import { handleRouteError, ok } from '@/lib/api-response';
import { requireSession } from '@/lib/auth';
import { refreshBudgetSpend } from '@/lib/services/costs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startOfToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const startOfMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

export async function GET() {
  try {
    const session = await requireSession();
    const org = session.organizationId;

    await refreshBudgetSpend(org);

    const today = startOfToday();
    const month = startOfMonth();

    const [totalAgents, actionsToday, blockedThisMonth, monthSpend, pendingApprovals, expiringApprovals, recentActions, orgRecord] =
      await Promise.all([
        prisma.agent.count({ where: { organizationId: org } }),
        prisma.agentAction.count({ where: { agent: { organizationId: org }, createdAt: { gte: today } } }),
        prisma.agentAction.count({ where: { agent: { organizationId: org }, createdAt: { gte: month }, status: 'BLOCKED' } }),
        prisma.agentAction.aggregate({ where: { agent: { organizationId: org }, createdAt: { gte: month } }, _sum: { tokenCost: true } }),
        prisma.approvalRequest.count({ where: { agent: { organizationId: org }, status: 'PENDING' } }),
        prisma.approvalRequest.count({ where: { agent: { organizationId: org }, status: 'PENDING', expiresAt: { lt: new Date() } } }),
        prisma.agentAction.findMany({
          where: { agent: { organizationId: org } },
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: { agent: { select: { id: true, name: true } } }
        }),
        prisma.organization.findUnique({ where: { id: org } })
      ]);

    return ok({
      organization: orgRecord ? { id: orgRecord.id, name: orgRecord.name, slug: orgRecord.slug, plan: orgRecord.plan } : null,
      stats: {
        totalAgents,
        actionsToday,
        policyViolationsThisMonth: blockedThisMonth,
        costThisMonth: monthSpend._sum.tokenCost ?? 0,
        pendingApprovals,
        slaBreached: expiringApprovals
      },
      recentActions: recentActions.map((a) => ({
        id: a.id,
        agentId: a.agentId,
        agentName: a.agent.name,
        actionType: a.actionType,
        status: a.status,
        tokenCost: a.tokenCost,
        createdAt: a.createdAt
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

