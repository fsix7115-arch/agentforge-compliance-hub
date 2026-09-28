import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability, requireSession } from '@/lib/auth';
import { logAgentAction } from '@/lib/services/actions';
import { refreshBudgetSpend } from '@/lib/services/costs';
import { ActionQuerySchema, LogActionSchema } from '@/lib/schemas';
import { parseJson } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const query = ActionQuerySchema.parse(Object.fromEntries(url.searchParams));

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, organizationId: session.organizationId }
    });
    if (!agent) return fail('Agent not found', 404);

    const where = {
      agentId: params.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.actionType ? { actionType: query.actionType } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {})
            }
          }
        : {})
    };

    const actions = await prisma.agentAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
      include: { policies: { include: { policy: { select: { id: true, name: true, framework: true } } } } }
    });

    const filtered =
      query.onlyViolations
        ? actions.filter((a) => a.status === 'BLOCKED' || parseJson<unknown[]>(a.policyChecks, []).length > 0)
        : actions;

    return ok({
      actions: filtered.map((a) => ({
        ...a,
        input: parseJson(a.input, {}),
        output: parseJson(a.output, {}),
        policyChecks: parseJson(a.policyChecks, [])
      })),
      total: filtered.length
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Called by agents themselves to log an action into the immutable chain. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireCapability('agent:write');
    const body = LogActionSchema.parse(await request.json());

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, organizationId: session.organizationId }
    });
    if (!agent) return fail('Agent not found', 404);

    const result = await logAgentAction(params.id, body);

    // Keep budgets current without waiting for the aggregation job.
    await refreshBudgetSpend(session.organizationId);

    return ok(result, { status: result.blocked ? 403 : 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

