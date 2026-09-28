import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability } from '@/lib/auth';
import { verifyAgentChain } from '@/lib/services/actions';
import { notify } from '@/lib/services/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireCapability('audit:read');

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, organizationId: session.organizationId }
    });
    if (!agent) return fail('Agent not found', 404);

    const url = new URL(request.url);
    const start = url.searchParams.get('startDate');
    const end = url.searchParams.get('endDate');

    const verification = await verifyAgentChain(
      params.id,
      {
        ...(start ? { start: new Date(start) } : {}),
        ...(end ? { end: new Date(end) } : {})
      }
    );

    if (!verification.valid) {
      await notify({
        title: `Audit chain broken for ${agent.name}`,
        body: `${verification.breaks.length} tamper indicator(s) detected. First break at sequence ${verification.breaks[0]?.sequence}.`,
        severity: 'critical',
        link: `/audit?agentId=${params.id}`
      });
    }

    return ok({
      agentId: agent.id,
      agentName: agent.name,
      valid: verification.valid,
      checked: verification.checked,
      breaks: verification.breaks,
      headHash: verification.headHash,
      verifiedAt: new Date().toISOString()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

