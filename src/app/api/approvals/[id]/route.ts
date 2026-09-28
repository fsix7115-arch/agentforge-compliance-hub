import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability } from '@/lib/auth';
import { DecideApprovalSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireCapability('approval:decide');
    const body = DecideApprovalSchema.parse(await request.json());

    const existing = await prisma.approvalRequest.findFirst({
      where: { id: params.id, agent: { organizationId: session.organizationId } },
      include: { action: { select: { id: true, status: true, actionType: true } } }
    });
    if (!existing) return fail('Approval request not found', 404);

    if (existing.status !== 'PENDING') {
      return fail(`Request already ${existing.status.toLowerCase()}`, 409);
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      await prisma.approvalRequest.update({
        where: { id: params.id },
        data: { status: 'EXPIRED', decidedAt: new Date() }
      });
      return fail('Request expired without a decision', 409);
    }

    // A rejection must leave the action blocked, not silently succeed.
    if (body.decision === 'reject') {
      await prisma.agentAction.update({
        where: { id: existing.actionId },
        data: { status: 'BLOCKED' }
      });
    } else if (existing.action.status === 'PENDING_APPROVAL') {
      await prisma.agentAction.update({
        where: { id: existing.actionId },
        data: { status: 'SUCCESS' }
      });
    }

    const approval = await prisma.approvalRequest.update({
      where: { id: params.id },
      data: {
        status: body.decision === 'approve' ? 'APPROVED' : 'REJECTED',
        approvedBy: session.userId,
        decisionNote: body.reason,
        decidedAt: new Date()
      },
      include: { agent: { select: { id: true, name: true } }, approver: { select: { name: true, email: true } } }
    });

    return ok(approval);
  } catch (error) {
    return handleRouteError(error);
  }
}

