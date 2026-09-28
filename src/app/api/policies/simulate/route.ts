import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability } from '@/lib/auth';
import { evaluatePolicy, PolicyParseError, parsePolicyYaml } from '@/lib/policy/engine';
import { SimulatePolicySchema } from '@/lib/schemas';

export const runtime = 'nodejs';

/**
 * Ad-hoc simulation against a YAML document the user is drafting, before it is
 * saved. Nothing is persisted.
 */
export async function POST(request: Request) {
  try {
    await requireCapability('audit:read');
    const body = SimulatePolicySchema.parse(await request.json());

    if (!body.rulesYaml) {
      return fail('Provide rulesYaml to simulate an unsaved policy', 400);
    }

    let document;
    try {
      document = parsePolicyYaml(body.rulesYaml);
    } catch (error) {
      if (error instanceof PolicyParseError) return fail(error.message, 422);
      throw error;
    }

    const outcome = evaluatePolicy(document, {
      actionType: body.actionType,
      input: body.input,
      output: body.output,
      status: body.status,
      tokenCost: body.tokenCost
    });

    return ok({ mode: 'unsaved', evaluated: 1, results: [outcome] });
  } catch (error) {
    return handleRouteError(error);
  }
}

