import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability } from '@/lib/auth';
import { evaluatePolicy, PolicyParseError, parsePolicyYaml } from '@/lib/policy/engine';
import { SimulatePolicySchema } from '@/lib/schemas';
import { parseJson } from '@/lib/utils';

export const runtime = 'nodejs';

/**
 * Simulation: run a policy against a synthetic payload or replayed historical
 * actions WITHOUT writing evaluations or changing any enforcement state.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireCapability('audit:read');
    const body = SimulatePolicySchema.parse(await request.json());

    const policy = await prisma.policy.findFirst({
      where: { id: params.id, organizationId: session.organizationId }
    });
    if (!policy) return fail('Policy not found', 404);

    const source = body.rulesYaml ?? policy.rulesYaml;
    let document;
    try {
      document = parsePolicyYaml(source);
    } catch (error) {
      if (error instanceof PolicyParseError) return fail(error.message, 422);
      throw error;
    }

    const synthetic = {
      actionType: body.actionType,
      input: body.input,
      output: body.output,
      status: body.status,
      tokenCost: body.tokenCost
    };

    if (body.historicalActionIds.length > 0) {
      const actions = await prisma.agentAction.findMany({
        where: {
          id: { in: body.historicalActionIds },
          agent: { organizationId: session.organizationId }
        }
      });

      return ok({
        mode: 'historical',
        evaluated: actions.length,
        results: actions.map((action) => ({
          actionId: action.id,
          actionType: action.actionType,
          createdAt: action.createdAt,
          outcome: evaluatePolicy(document, {
            actionType: action.actionType,
            input: parseJson(action.input, {}),
            output: parseJson(action.output, {}),
            status: action.status,
            tokenCost: action.tokenCost
          })
        }))
      });
    }

    return ok({ mode: 'synthetic', evaluated: 1, results: [evaluatePolicy(document, synthetic)] });
  } catch (error) {
    return handleRouteError(error);
  }
}

