import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability, requireSession } from '@/lib/auth';
import { evaluationDashboard } from '@/lib/services/evaluations';
import { CreateEvaluationSchema, EvaluationQuerySchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const query = EvaluationQuerySchema.parse(Object.fromEntries(url.searchParams));
    return ok(await evaluationDashboard(session.organizationId, query.agentId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCapability('agent:write');
    const body = CreateEvaluationSchema.parse(await request.json());

    const agent = await prisma.agent.findFirst({
      where: { id: body.agentId, organizationId: session.organizationId }
    });
    if (!agent) return fail('Agent not found', 404);

    const evaluation = await prisma.evaluation.upsert({
      where: { agentId_metric_period: { agentId: body.agentId, metric: body.metric, period: body.period } },
      create: { agentId: body.agentId, metric: body.metric, value: body.value, sampleSize: body.sampleSize, period: body.period },
      update: { value: body.value, sampleSize: body.sampleSize }
    });

    return ok(evaluation, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

