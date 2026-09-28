import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability, requireSession } from '@/lib/auth';
import { budgetStatus, refreshBudgetSpend } from '@/lib/services/costs';
import { CreateBudgetSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireSession();
    await refreshBudgetSpend(session.organizationId);
    const budgets = await prisma.costBudget.findMany({
      where: { organizationId: session.organizationId },
      include: { agent: { select: { id: true, name: true } }, alerts: { orderBy: { createdAt: 'desc' }, take: 5 } }
    });
    return ok(budgets.map(budgetStatus));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCapability('cost:write');
    const body = CreateBudgetSchema.parse(await request.json());

    if (body.agentId) {
      const agent = await prisma.agent.findFirst({
        where: { id: body.agentId, organizationId: session.organizationId }
      });
      if (!agent) return fail('Agent not found', 404);
    }

    const budget = await prisma.costBudget.create({
      data: {
        organizationId: session.organizationId,
        agentId: body.agentId ?? null,
        label: body.label,
        monthlyLimit: body.monthlyLimit,
        alertThreshold: body.alertThreshold,
        autoThrottle: body.autoThrottle
      },
      include: { agent: { select: { id: true, name: true } } }
    });

    return ok(budgetStatus(budget), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

