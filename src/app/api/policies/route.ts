import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability, requireSession } from '@/lib/auth';
import { PolicyParseError, parsePolicyYaml } from '@/lib/policy/engine';
import { CreatePolicySchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireSession();
    const policies = await prisma.policy.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { evaluations: true, agents: true } },
        evaluations: { where: { passed: false }, select: { id: true } }
      }
    });

    return ok(
      policies.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        framework: p.framework,
        enabled: p.enabled,
        rulesYaml: p.rulesYaml,
        createdAt: p.createdAt,
        agentCount: p._count.agents,
        evaluationCount: p._count.evaluations,
        violationCount: p.evaluations.length
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCapability('policy:write');
    const body = CreatePolicySchema.parse(await request.json());

    // Reject malformed YAML at write time rather than at evaluation time.
    try {
      parsePolicyYaml(body.rulesYaml);
    } catch (error) {
      if (error instanceof PolicyParseError) return fail(`Invalid policy: ${error.message}`, 422);
      throw error;
    }

    const policy = await prisma.policy.create({
      data: {
        name: body.name,
        description: body.description,
        framework: body.framework,
        rulesYaml: body.rulesYaml,
        enabled: body.enabled,
        organizationId: session.organizationId
      }
    });

    if (body.agentIds.length) {
      await prisma.agentPolicy.createMany({
        data: body.agentIds.map((agentId) => ({ policyId: policy.id, agentId }))
      });
    }

    return ok(policy, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

