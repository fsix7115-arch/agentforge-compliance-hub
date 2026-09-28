import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Network, ShieldCheck, Wallet } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyAgentChain } from '@/lib/services/actions';
import { parseJson } from '@/lib/utils';
import { formatRelative, formatUsd } from '@/lib/format-client';
import { AgentStatusBadge, ActionStatusBadge, FrameworkBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

export default async function AgentDetailPage({ params }: { params: { id: string } }) {
  const session = await requireSession();

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, organizationId: session.organizationId },
    include: {
      owner: { select: { name: true, email: true } },
      policies: { include: { policy: true } },
      dependencies: { include: { target: { select: { id: true, name: true, status: true } } } },
      dependents: { include: { agent: { select: { id: true, name: true, status: true } } } }
    }
  });

  if (!agent) notFound();

  const [actions, verification, spend, evaluations, budgets] = await Promise.all([
    prisma.agentAction.findMany({
      where: { agentId: agent.id },
      orderBy: { sequence: 'desc' },
      take: 50
    }),
    verifyAgentChain(agent.id),
    prisma.agentAction.aggregate({
      where: { agentId: agent.id },
      _sum: { tokenCost: true },
      _count: { _all: true }
    }),
    prisma.evaluation.findMany({ where: { agentId: agent.id }, orderBy: { period: 'asc' } }),
    prisma.costBudget.findMany({ where: { agentId: agent.id } })
  ]);

  const config = parseJson<Record<string, unknown>>(agent.config, {});
  const tags = parseJson<string[]>(agent.tags, []);

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/agents">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All agents
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
              <AgentStatusBadge status={agent.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              v{agent.version} · owned by {agent.owner.name} · updated {formatRelative(agent.updatedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={verification.valid ? 'success' : 'destructive'}>
              {verification.valid
                ? `chain intact · ${verification.checked} links`
                : `TAMPER DETECTED · ${verification.breaks.length} break(s)`}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/agents/${agent.id}/audit/verify`}>Verify chain</a>
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="actions">Actions ({actions.length})</TabsTrigger>
          <TabsTrigger value="policies">Policies ({agent.policies.length})</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card className="p-5">
            <h2 className="font-semibold">Description</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {agent.description || 'No description provided.'}
            </p>
            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-semibold">Configuration</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Model</dt>
                  <dd className="font-medium">{String(config.model ?? '—')}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Temperature</dt>
                  <dd className="font-medium">{String(config.temperature ?? '—')}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Max tokens</dt>
                  <dd className="font-medium">{String(config.maxTokens ?? '—')}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">System prompt</dt>
                  <dd className="mt-1 rounded-md bg-muted/50 p-2 text-xs leading-relaxed">
                    {String(config.systemPrompt ?? '—')}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tools</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {(config.tools as string[] | undefined)?.map((tool) => (
                      <Badge key={tool} variant="outline" className="text-xs">
                        {tool}
                      </Badge>
                    )) ?? <span className="text-xs text-muted-foreground">none</span>}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Network className="h-4 w-4 text-muted-foreground" />
                Dependency graph
              </h2>
              {agent.dependencies.length === 0 && agent.dependents.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No dependencies recorded. An agent with no dependencies is a single-node graph.
                </p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {agent.dependencies.map(({ target }) => (
                    <li key={target.id} className="flex items-center gap-2">
                      <span className="text-muted-foreground">depends on</span>
                      <Link href={`/agents/${target.id}`} className="font-medium hover:underline">
                        {target.name}
                      </Link>
                      <AgentStatusBadge status={target.status} />
                    </li>
                  ))}
                  {agent.dependents.map(({ agent: dependent }) => (
                    <li key={dependent.id} className="flex items-center gap-2">
                      <span className="text-muted-foreground">used by</span>
                      <Link href={`/agents/${dependent.id}`} className="font-medium hover:underline">
                        {dependent.name}
                      </Link>
                      <AgentStatusBadge status={dependent.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          <Card>
            {actions.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">
                No actions logged yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seq</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Hash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map((action) => (
                    <TableRow key={action.id}>
                      <TableCell className="font-mono text-xs">#{action.sequence}</TableCell>
                      <TableCell className="font-medium">{action.actionType}</TableCell>
                      <TableCell>
                        <ActionStatusBadge status={action.status} />
                      </TableCell>
                      <TableCell className="text-sm">{formatUsd(action.tokenCost)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelative(action.createdAt)}
                      </TableCell>
                      <TableCell
                        className="max-w-[120px] truncate font-mono text-xs text-muted-foreground"
                        title={action.hash}
                      >
                        {action.hash.slice(0, 12)}…
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="mt-4">
          <Card>
            {agent.policies.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">
                No policies attached. Actions will be logged without compliance checks.
              </p>
            ) : (
              <ul className="divide-y">
                {agent.policies.map(({ policy }) => (
                  <li key={policy.id} className="flex items-start gap-3 px-5 py-4">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">{policy.name}</p>
                      <p className="text-sm text-muted-foreground">{policy.description}</p>
                    </div>
                    <FrameworkBadge framework={policy.framework} />
                    <Badge variant={policy.enabled ? 'success' : 'outline'}>
                      {policy.enabled ? 'active' : 'disabled'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">Lifetime spend</p>
              <p className="mt-1 text-2xl font-bold">{formatUsd(spend._sum.tokenCost ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">across {spend._count._all} actions</p>
            </Card>
            {budgets.map((budget) => (
              <Card key={budget.id} className="p-5">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{budget.label}</p>
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {formatUsd(budget.currentSpend)}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    / {formatUsd(budget.monthlyLimit)}
                  </span>
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full ${budget.currentSpend / budget.monthlyLimit > 0.9 ? 'bg-destructive' : 'bg-primary'}`}
                    style={{
                      width: `${Math.min(100, (budget.currentSpend / budget.monthlyLimit) * 100)}%`
                    }}
                  />
                </div>
                {budget.autoThrottle && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Auto-throttle enabled — actions blocked once the budget is exhausted.
                  </p>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="evaluations" className="mt-4">
          <Card>
            {evaluations.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">
                No evaluation metrics reported for this agent.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Sample</TableHead>
                    <TableHead>Period</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evaluations.map((evaluation) => (
                    <TableRow key={evaluation.id}>
                      <TableCell className="font-medium">{evaluation.metric.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{evaluation.value.toFixed(3)}</TableCell>
                      <TableCell className="text-muted-foreground">{evaluation.sampleSize}</TableCell>
                      <TableCell className="text-muted-foreground">{evaluation.period}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
