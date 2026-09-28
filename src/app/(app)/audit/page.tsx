import Link from 'next/link';
import { Download, ScrollText, ShieldCheck, ShieldX } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseJson } from '@/lib/utils';
import { formatAbsolute, formatUsd } from '@/lib/format-client';
import { ActionStatusBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

interface PolicyCheck {
  policyName: string;
  passed: boolean;
  blocked: boolean;
  requiresApproval: boolean;
  violations: { message: string; severity: string; field: string }[];
}

export default async function AuditPage({
  searchParams
}: {
  searchParams: { agentId?: string; status?: string; q?: string };
}) {
  const session = await requireSession();
  const org = session.organizationId;

  const [agents, actions, chainIssues] = await Promise.all([
    prisma.agent.findMany({
      where: { organizationId: org },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    }),
    prisma.agentAction.findMany({
      where: {
        agent: { organizationId: org },
        ...(searchParams.agentId ? { agentId: searchParams.agentId } : {}),
        ...(searchParams.status ? { status: searchParams.status } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { agent: { select: { id: true, name: true } } }
    }),
    // Verify the tail of each agent chain so the banner reflects reality.
    Promise.all(
      (
        await prisma.agent.findMany({
          where: { organizationId: org, actions: { some: {} } },
          select: { id: true, name: true }
        })
      ).map(async (agent) => {
        const { verifyAgentChain } = await import('@/lib/services/actions');
        const result = await verifyAgentChain(agent.id);
        return { id: agent.id, name: agent.name, valid: result.valid, breaks: result.breaks.length };
      })
    )
  ]);

  const filtered = searchParams.q
    ? actions.filter((a) => a.actionType.toLowerCase().includes(searchParams.q!.toLowerCase()))
    : actions;

  const tampered = chainIssues.filter((c) => !c.valid);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            Every action, hash-chained. {filtered.length} shown.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/audit/export?format=csv">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/audit/export?format=json">Export JSON</a>
          </Button>
        </div>
      </div>

      {tampered.length > 0 ? (
        <Card className="border-destructive/50 bg-destructive/10 p-5">
          <div className="flex items-start gap-3">
            <ShieldX className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">
                Tamper detection: {tampered.length} agent chain(s) failed verification
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {tampered.map((agent) => (
                  <li key={agent.id}>
                    <Link href={`/agents/${agent.id}`} className="font-medium underline">
                      {agent.name}
                    </Link>{' '}
                    — {agent.breaks} break(s) detected
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="flex items-center gap-3 border-success/40 bg-success/5 p-4">
          <ShieldCheck className="h-5 w-5 text-success" />
          <p className="text-sm">
            All {chainIssues.length} agent chain(s) verified intact. No tampering detected.
          </p>
        </Card>
      )}

      <form className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <ScrollText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={searchParams.q ?? ''} placeholder="Search action type…" className="pl-9" />
        </div>
        <select
          name="agentId"
          defaultValue={searchParams.agentId ?? ''}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="SUCCESS">success</option>
          <option value="FAILED">failed</option>
          <option value="BLOCKED">blocked</option>
          <option value="PENDING_APPROVAL">pending approval</option>
        </select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <Card>
        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No actions match these filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Policy result</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((action) => {
                const checks = parseJson<PolicyCheck[]>(action.policyChecks, []);
                const failed = checks.filter((c) => !c.passed);
                return (
                  <TableRow key={action.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatAbsolute(action.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Link href={`/agents/${action.agentId}`} className="font-medium hover:underline">
                        {action.agent.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{action.actionType}</TableCell>
                    <TableCell>
                      <ActionStatusBadge status={action.status} />
                    </TableCell>
                    <TableCell>
                      {checks.length === 0 ? (
                        <span className="text-xs text-muted-foreground">no policies</span>
                      ) : failed.length === 0 ? (
                        <Badge variant="success">{checks.length} passed</Badge>
                      ) : (
                        <Badge variant="destructive">{failed.length} violated</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{formatUsd(action.tokenCost)}</TableCell>
                    <TableCell
                      className="max-w-[110px] truncate font-mono text-xs text-muted-foreground"
                      title={action.hash}
                    >
                      {action.hash.slice(0, 10)}…
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        hash = SHA256(previousHash | action). Editing or deleting any row breaks every subsequent hash
        in that agent&apos;s chain — the verification endpoint recomputes and reports the exact break.
      </p>
    </div>
  );
}
