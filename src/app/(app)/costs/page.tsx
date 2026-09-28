import Link from 'next/link';
import { AlertTriangle, Wallet } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { costDashboard } from '@/lib/services/costs';
import { formatUsd } from '@/lib/format-client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SpendChart } from './spend-chart';
import { SpendByModelChart } from './spend-by-model-chart';

export const dynamic = 'force-dynamic';

export default async function CostsPage() {
  const session = await requireSession();
  const dashboard = await costDashboard(session.organizationId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cost governance</h1>
        <p className="text-sm text-muted-foreground">
          Spend is derived from the audit trail, so cost data is as tamper-evident as the actions
          themselves.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Spend this month</p>
          <p className="mt-1 text-2xl font-bold">{formatUsd(dashboard.monthSpend)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Active budgets</p>
          <p className="mt-1 text-2xl font-bold">{dashboard.budgets.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Throttled agents</p>
          <p className="mt-1 text-2xl font-bold">
            {dashboard.budgets.filter((b) => b.throttled).length}
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Daily spend</h2>
        <SpendChart data={dashboard.dailySpend} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Spend by model</h2>
          <SpendByModelChart
            data={Object.entries(dashboard.spendByModel).map(([model, v]) => ({ model, cost: v.cost }))}
          />
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Spend by agent</h2>
          {dashboard.spendByAgent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spend recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {dashboard.spendByAgent.map((row) => (
                <li key={row.agentId} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/agents/${row.agentId}`} className="font-medium hover:underline">
                    {row.agentName}
                  </Link>
                  <span className="text-muted-foreground">
                    {row.tokens.toLocaleString()} tokens · {row.actions} actions
                  </span>
                  <span className="w-20 text-right font-semibold">{formatUsd(row.cost)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Wallet className="h-5 w-5 text-muted-foreground" />
          Budgets
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {dashboard.budgets.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground md:col-span-2">
              No budgets yet. Create one from an agent&apos;s Costs tab.
            </Card>
          )}
          {dashboard.budgets.map((budget) => (
            <Card key={budget.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{budget.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {budget.agentName ?? 'organization-wide'} · alert at{' '}
                    {Math.round(budget.alertThreshold * 100)}%
                  </p>
                </div>
                <Badge
                  variant={
                    budget.level === 'exhausted'
                      ? 'destructive'
                      : budget.level === 'critical'
                        ? 'destructive'
                        : budget.level === 'warning'
                          ? 'secondary'
                          : 'success'
                  }
                >
                  {budget.level}
                </Badge>
              </div>

              <p className="mt-3 text-2xl font-bold">
                {formatUsd(budget.currentSpend)}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  / {formatUsd(budget.monthlyLimit)}
                </span>
              </p>
              <Progress
                value={budget.percentUsed}
                className="mt-3"
                indicatorClassName={
                  budget.percentUsed >= 100 ? 'bg-destructive' : budget.percentUsed >= 80 ? 'bg-amber-500' : undefined
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">{budget.percentUsed.toFixed(1)}% used</p>

              {budget.autoThrottle && (
                <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Auto-throttle is on — once spend reaches the limit, this agent&apos;s actions are
                  blocked.
                </p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
