import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability, requireSession } from '@/lib/auth';
import { AgentQuerySchema, CreateAgentSchema } from '@/lib/schemas';
import { parseJson, slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const query = AgentQuerySchema.parse(Object.fromEntries(url.searchParams));

    const where = {
      organizationId: session.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { description: { contains: query.search } },
              { tags: { contains: query.search } }
            ]
          }
        : {})
    };

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { actions: true, policies: true } }
        }
      }),
      prisma.agent.count({ where })
    ]);

    return ok({
      agents: agents.map((agent) => ({ ...agent, tags: parseJson<string[]>(agent.tags, []) })),
      total,
      limit: query.limit,
      offset: query.offset
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCapability('agent:write');
    const body = CreateAgentSchema.parse(await request.json());

    const base = slugify(body.name);
    let slug = base;
    let suffix = 1;
    while (await prisma.agent.findUnique({ where: { organizationId_slug: { organizationId: session.organizationId, slug } } })) {
      slug = `${base}-${suffix++}`;
    }

    const ownerId = body.ownerId ?? session.userId;

    const agent = await prisma.agent.create({
      data: {
        name: body.name,
        slug,
        description: body.description,
        version: body.version,
        status: body.status,
        tags: JSON.stringify(body.tags),
        config: JSON.stringify(body.config),
        ownerId,
        organizationId: session.organizationId,
        policies: {
          create: body.policyIds.map((policyId) => ({ policyId }))
        }
      },
      include: { owner: { select: { id: true, name: true, email: true } } }
    });

    if (body.dependsOn.length) {
      await prisma.agentDep.createMany({
        data: body.dependsOn.map((dependsOn) => ({ agentId: agent.id, dependsOn }))
      });
    }

    return ok(agent, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

