import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { POLICY_TEMPLATES } from '@/lib/policy/templates';
import { PolicyEditor } from './policy-editor';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FrameworkBadge } from '@/components/status-badge';
import { Progress } from '@/components/ui/progress';

export const dynamic = 'force-dynamic';

export default async function PoliciesPage() {
  const session = await requireSession();

  const policies = await prisma.policy.findMany({
    where: { organizationId: session.organizationId },
    orderBy: [{ framework: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { evaluations: true, agents: true } },
      evaluations: { where: { passed: false }, select: { id: true } }
    }
  });

  const byFramework = new Map<string, { total: number; failed: number }>();
  for (const policy of policies) {
    const entry = byFramework.get(policy.framework) ?? { total: 0, failed: 0 };
    entry.total += policy._count.evaluations;
    entry.failed += policy.evaluations.length;
    byFramework.set(policy.framework, entry);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Policies</h1>
        <p className="text-sm text-muted-foreground">
          Declarative YAML rules evaluated on every agent action. Critical violations block; warnings
          escalate to a human.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...byFramework.entries()].map(([framework, stats]) => {
          const passRate = stats.total > 0 ? ((stats.total - stats.failed) / stats.total) * 100 : 100;
          return (
            <Card key={framework} className="p-5">
              <div className="flex items-center justify-between">
                <FrameworkBadge framework={framework} />
                <span className="text-sm font-semibold">{passRate.toFixed(0)}%</span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {stats.total - stats.failed} passed · {stats.failed} violated · {stats.total} evaluations
              </p>
              <Progress
                value={passRate}
                className="mt-3"
                indicatorClassName={passRate < 90 ? 'bg-destructive' : undefined}
              />
            </Card>
          );
        })}
        {byFramework.size === 0 && (
          <Card className="p-5 sm:col-span-2 lg:col-span-4">
            <p className="text-sm text-muted-foreground">No evaluations yet.</p>
          </Card>
        )}
      </div>

      <PolicyEditor
        templates={POLICY_TEMPLATES.map((t) => ({
          name: t.name,
          framework: t.framework,
          yaml: t.yaml
        }))}
      />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Policies in this workspace ({policies.length})</h2>
        <Card>
          {policies.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No policies yet.</p>
          ) : (
            <ul className="divide-y">
              {policies.map((policy) => (
                <li key={policy.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-[200px] flex-1">
                    <p className="font-medium">{policy.name}</p>
                    <p className="text-xs text-muted-foreground">{policy.description}</p>
                  </div>
                  <FrameworkBadge framework={policy.framework} />
                  <Badge variant={policy.enabled ? 'success' : 'outline'}>
                    {policy.enabled ? 'active' : 'disabled'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {policy._count.agents} agents · {policy.evaluations.length} violations
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
