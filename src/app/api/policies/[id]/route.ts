import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability, requireSession } from '@/lib/auth';
import { PolicyParseError, parsePolicyYaml } from '@/lib/policy/engine';
import { UpdatePolicySchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const policy = await prisma.policy.findFirst({
      where: { id: params.id, organizationId: session.organizationId },
      include: { agents: { include: { agent: { select: { id: true, name: true } } } } }
    });
    if (!policy) return fail('Policy not found', 404);
    return ok(policy);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireCapability('policy:write');
    const body = UpdatePolicySchema.parse(await request.json());

    const existing = await prisma.policy.findFirst({
      where: { id: params.id, organizationId: session.organizationId }
    });
    if (!existing) return fail('Policy not found', 404);

    if (body.rulesYaml) {
      try {
        parsePolicyYaml(body.rulesYaml);
      } catch (error) {
        if (error instanceof PolicyParseError) return fail(`Invalid policy: ${error.message}`, 422);
        throw error;
      }
    }

    const policy = await prisma.policy.update({
      where: { id: params.id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.framework ? { framework: body.framework } : {}),
        ...(body.rulesYaml ? { rulesYaml: body.rulesYaml } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {})
      }
    });

    if (body.agentIds) {
      await prisma.agentPolicy.deleteMany({ where: { policyId: params.id } });
      if (body.agentIds.length) {
        await prisma.agentPolicy.createMany({
          data: body.agentIds.map((agentId) => ({ policyId: params.id, agentId }))
        });
      }
    }

    return ok(policy);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireCapability('policy:delete');
    const existing = await prisma.policy.findFirst({
      where: { id: params.id, organizationId: session.organizationId }
    });
    if (!existing) return fail('Policy not found', 404);
    await prisma.policy.delete({ where: { id: params.id } });
    return ok({ deleted: params.id });
  } catch (error) {
    return handleRouteError(error);
  }
}

