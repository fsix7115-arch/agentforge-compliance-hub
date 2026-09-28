import { prisma } from '@/lib/prisma';
import { handleRouteError } from '@/lib/api-response';
import { requireCapability } from '@/lib/auth';
import { AuditExportSchema } from '@/lib/schemas';
import { parseJson, toCsv } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** CSV or JSON audit export for external auditors. */
export async function GET(request: Request) {
  try {
    const session = await requireCapability('audit:export');
    const url = new URL(request.url);
    const query = AuditExportSchema.parse(Object.fromEntries(url.searchParams));

    const actions = await prisma.agentAction.findMany({
      where: {
        agent: { organizationId: session.organizationId },
        ...(query.agentId ? { agentId: query.agentId } : {}),
        ...(query.startDate || query.endDate
          ? {
              createdAt: {
                ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
                ...(query.endDate ? { lte: new Date(query.endDate) } : {})
              }
            }
          : {})
      },
      orderBy: { createdAt: 'asc' },
      take: query.limit,
      include: { agent: { select: { name: true, slug: true } } }
    });

    const rows = actions.map((a) => ({
      actionId: a.id,
      agent: a.agent.name,
      agentSlug: a.agent.slug,
      actionType: a.actionType,
      status: a.status,
      sequence: a.sequence,
      actor: a.actor,
      model: a.model,
      latencyMs: a.latencyMs,
      tokenCost: a.tokenCost,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      input: a.input,
      output: a.output,
      policyChecks: a.policyChecks,
      hash: a.hash,
      previousHash: a.previousHash,
      timestamp: a.createdAt.toISOString()
    }));

    const stamp = new Date().toISOString().slice(0, 10);

    if (query.format === 'json') {
      return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, actions: rows.map((r) => ({ ...r, input: parseJson(r.input, {}), output: parseJson(r.output, {}), policyChecks: parseJson(r.policyChecks, []) })) }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="agentforge-audit-${stamp}.json"`,
          'Cache-Control': 'no-store'
        }
      });
    }

    return new Response(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="agentforge-audit-${stamp}.csv"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

