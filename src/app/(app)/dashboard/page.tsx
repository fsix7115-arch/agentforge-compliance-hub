import Link from 'next/link';
import { Bot, CircleDollarSign, Clock, FileCheck2, ShieldAlert, TrendingUp } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { refreshBudgetSpend } from '@/lib/services/costs';
import { formatRelative, formatUsd } from '@/lib/format-client';
import { ActionStatusBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireSession();
  const org = session.organizationId;

  await refreshBudgetSpend(org);

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [totalAgents, actionsToday, violations, monthSpend, pendingApprovals, slaBreached, recent] =
    await Promise.all([
      prisma.agent.count({ where: { organizationId: org } }),
      prisma.agentAction.count({ where: { agent: { organizationId: org }, createdAt: { gte: today } } }),
      prisma.agentAction.count({
        where: { agent: { organizationId: org }, createdAt: { gte: month }, status: 'BLOCKED' }
      }),
      prisma.agentAction.aggregate({
        where: { agent: { organizationId: org }, createdAt: { gte: month } },
        _sum: { tokenCost: true }
      }),
      prisma.approvalRequest.count({ where: { agent: { organizationId: org }, status: 'PENDING' } }),
      prisma.approvalRequest.count({
        where: { agent: { organizationId: org }, status: 'PENDING', expiresAt: { lt: now } }
      }),
      prisma.agentAction.findMany({
        where: { agent: { organizationId: org } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { agent: { select: { id: true, name: true } } }
      })
    ]);

  const stats = [
    { label: 'Total agents', value: String(totalAgents), icon: Bot, href: '/agents' },
    { label: 'Actions today', value: String(actionsToday), icon: TrendingUp, href: '/audit' },
    {
      label: 'Policy violations',
      value: String(violations),
      icon: ShieldAlert,
      href: '/policies',
      tone: violations > 0 ? 'warn' : undefined
    },
    {
      label: 'Cost this month',
      value: formatUsd(monthSpend._sum.tokenCost ?? 0),
      icon: CircleDollarSign,
      href: '/costs'
    },
    { label: 'Pending approvals', value: String(pendingApprovals), icon: FileCheck2, href: '/approvals' },
    {
      label: 'SLA breached',
      value: String(slaBreached),
      icon: Clock,
      href: '/approvals',
      tone: slaBreached > 0 ? 'warn' : undefined
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Compliance posture across your agent fleet, live.</p>
        </div>
        <Button asChild>
          <Link href="/agents/new">Register an agent</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, href, tone }) => (
          <Link key={label} href={href}>
            <Card className="p-5 transition-colors hover:border-primary/50">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className={`mt-1 text-2xl font-bold ${tone === 'warn' ? 'text-destructive' : ''}`}>
                    {value}
                  </p>
                </div>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent agent actions</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/audit">View full audit log</Link>
          </Button>
        </div>
        <Card>
          {recent.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No actions logged yet. Register an agent and POST to{' '}
              <code className="text-xs">/api/agents/&lt;id&gt;/actions</code> to start the audit chain.
            </p>
          ) : (
            <ul className="divide-y">
              {recent.map((action) => (
                <li key={action.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Badge variant="outline" className="font-mono text-xs">
                    #{action.sequence}
                  </Badge>
                  <Link href={`/agents/${action.agentId}`} className="font-medium hover:underline">
                    {action.agent.name}
                  </Link>
                  <span className="text-muted-foreground">{action.actionType}</span>
                  <ActionStatusBadge status={action.status} />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatUsd(action.tokenCost)} · {formatRelative(action.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
