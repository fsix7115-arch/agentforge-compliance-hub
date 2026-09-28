import Link from 'next/link';
import { Clock, FileCheck2 } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatAbsolute, formatUsd } from '@/lib/format-client';
import { ApprovalStatusBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ApprovalActions } from './approval-actions';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage({
  searchParams
}: {
  searchParams: { status?: string };
}) {
  const session = await requireSession();
  const now = Date.now();

  const approvals = await prisma.approvalRequest.findMany({
    where: {
      agent: { organizationId: session.organizationId },
      ...(searchParams.status ? { status: searchParams.status } : {})
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      agent: { select: { id: true, name: true } },
      requester: { select: { name: true, email: true } },
      approver: { select: { name: true } },
      action: { select: { id: true, actionType: true, tokenCost: true, input: true, output: true } }
    }
  });

  const pending = approvals.filter((a) => a.status === 'PENDING');
  const breached = pending.filter((a) => a.expiresAt.getTime() < now);
  const oldest = pending.reduce((max, a) => Math.max(max, (now - a.createdAt.getTime()) / 3600_000), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Approval queue</h1>
          <p className="text-sm text-muted-foreground">
            High-risk actions wait for a human decision before they take effect.
          </p>
        </div>
        <div className="flex gap-2">
          {['PENDING', 'APPROVED', 'REJECTED', ''].map((status) => (
            <a
              key={status || 'all'}
              href={status ? `/approvals?status=${status}` : '/approvals'}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                (searchParams.status ?? '') === status
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {status ? status.toLowerCase() : 'all'}
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="mt-1 text-2xl font-bold">{pending.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">SLA breached</p>
          <p className={`mt-1 text-2xl font-bold ${breached.length > 0 ? 'text-destructive' : ''}`}>
            {breached.length}
          </p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Oldest pending
          </p>
          <p className="mt-1 text-2xl font-bold">{oldest.toFixed(1)}h</p>
        </Card>
      </div>

      {approvals.length === 0 ? (
        <Card className="p-12 text-center">
          <FileCheck2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">Nothing waiting</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Actions that trip a critical policy or exceed a cost threshold will appear here.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {approvals.map((approval) => {
            const ageHours = Math.round(((now - approval.createdAt.getTime()) / 3600_000) * 10) / 10;
            const isBreached = approval.status === 'PENDING' && approval.expiresAt.getTime() < now;
            return (
              <li key={approval.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-[240px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{approval.action.actionType}</p>
                        <ApprovalStatusBadge status={approval.status} />
                        {isBreached && <Badge variant="destructive">SLA breached</Badge>}
                        {approval.riskScore >= 60 && (
                          <Badge variant="secondary">risk {approval.riskScore}</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{approval.reason}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <Link href={`/agents/${approval.agent.id}`} className="font-medium hover:underline">
                          {approval.agent.name}
                        </Link>{' '}
                        · requested by {approval.requester.name} · {formatAbsolute(approval.createdAt)} ·{' '}
                        {ageHours}h old · {formatUsd(approval.action.tokenCost)}
                      </p>
                      {approval.status !== 'PENDING' && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {approval.status.toLowerCase()} by {approval.approver?.name ?? 'unknown'}
                          {approval.decisionNote ? ` — "${approval.decisionNote}"` : ''}
                        </p>
                      )}
                    </div>

                    {approval.status === 'PENDING' && (
                      <ApprovalActions
                        approval={{
                          id: approval.id,
                          reason: approval.reason,
                          riskScore: approval.riskScore,
                          ageHours,
                          slaBreached: isBreached,
                          action: {
                            id: approval.action.id,
                            actionType: approval.action.actionType,
                            tokenCost: approval.action.tokenCost,
                            input: approval.action.input,
                            output: approval.action.output
                          },
                          agent: approval.agent,
                          requester: approval.requester
                        }}
                      />
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
