import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability, requireSession } from '@/lib/auth';
import { notify } from '@/lib/services/notifications';
import { ApprovalQuerySchema, CreateApprovalSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const query = ApprovalQuerySchema.parse(Object.fromEntries(url.searchParams));

    const where = {
      agent: { organizationId: session.organizationId },
      ...(query.status ? { status: query.status } : {})
    };

    const [approvals, total] = await Promise.all([
      prisma.approvalRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        take: query.limit,
        skip: query.offset,
        include: {
          agent: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true, email: true } },
          approver: { select: { id: true, name: true, email: true } },
          action: { select: { id: true, actionType: true, tokenCost: true, input: true, output: true } }
        }
      }),
      prisma.approvalRequest.count({ where })
    ]);

    // SLA: how long each pending request has been waiting.
    const now = Date.now();
    return ok({
      approvals: approvals.map((a) => ({
        ...a,
        ageHours: Math.round(((now - a.createdAt.getTime()) / 3600_000) * 10) / 10,
        slaBreached: a.status === 'PENDING' && a.expiresAt.getTime() < now
      })),
      total
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCapability('agent:write');
    const body = CreateApprovalSchema.parse(await request.json());

    const action = await prisma.agentAction.findFirst({
      where: { id: body.actionId, agent: { organizationId: session.organizationId } },
      include: { agent: { select: { id: true, name: true } } }
    });
    if (!action) return fail('Action not found', 404);

    const approval = await prisma.approvalRequest.create({
      data: {
        actionId: body.actionId,
        agentId: body.agentId || action.agentId,
        reason: body.reason,
        riskScore: body.riskScore,
        status: 'PENDING',
        requestedBy: body.requestedBy ?? session.userId,
        expiresAt: new Date(Date.now() + body.expiresInHours * 3600_000)
      },
      include: { agent: { select: { id: true, name: true } } }
    });

    await notify({
      title: `Approval needed: ${action.agent.name}`,
      body: `${action.actionType} — ${body.reason}`,
      severity: 'warning',
      link: '/approvals'
    });

    return ok(approval, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

