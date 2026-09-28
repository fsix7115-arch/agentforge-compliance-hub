import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability, requireSession } from '@/lib/auth';
import { UpdateAgentSchema } from '@/lib/schemas';
import { parseJson } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadOwned(id: string, organizationId: string) {
  const agent = await prisma.agent.findFirst({
    where: { id, organizationId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      policies: { include: { policy: true } },
      dependencies: { include: { target: { select: { id: true, name: true, slug: true } } } },
      dependents: { include: { agent: { select: { id: true, name: true, slug: true } } } },
      _count: { select: { actions: true } }
    }
  });
  return agent;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const agent = await loadOwned(params.id, session.organizationId);
    if (!agent) return fail('Agent not found', 404);
    return ok({
      ...agent,
      tags: parseJson<string[]>(agent.tags, []),
      config: parseJson<Record<string, unknown>>(agent.config, {})
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireCapability('agent:write');
    const body = UpdateAgentSchema.parse(await request.json());

    const existing = await prisma.agent.findFirst({
      where: { id: params.id, organizationId: session.organizationId }
    });
    if (!existing) return fail('Agent not found', 404);

    const agent = await prisma.agent.update({
      where: { id: params.id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.version ? { version: body.version } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.tags ? { tags: JSON.stringify(body.tags) } : {}),
        ...(body.config ? { config: JSON.stringify(body.config) } : {}),
        ...(body.ownerId ? { ownerId: body.ownerId } : {})
      }
    });

    return ok({ ...agent, tags: parseJson<string[]>(agent.tags, []) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireCapability('agent:delete');
    const existing = await prisma.agent.findFirst({
      where: { id: params.id, organizationId: session.organizationId }
    });
    if (!existing) return fail('Agent not found', 404);

    await prisma.agent.delete({ where: { id: params.id } });
    return ok({ deleted: params.id });
  } catch (error) {
    return handleRouteError(error);
  }
}

