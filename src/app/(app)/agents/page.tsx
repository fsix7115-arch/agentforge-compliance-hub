import Link from 'next/link';
import { Bot, Plus, Search } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseJson } from '@/lib/utils';
import { formatRelative } from '@/lib/format-client';
import { AgentStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function AgentsPage({
  searchParams
}: {
  searchParams: { search?: string; status?: string };
}) {
  const session = await requireSession();

  const agents = await prisma.agent.findMany({
    where: {
      organizationId: session.organizationId,
      ...(searchParams.status ? { status: searchParams.status } : {}),
      ...(searchParams.search
        ? {
            OR: [
              { name: { contains: searchParams.search } },
              { description: { contains: searchParams.search } }
            ]
          }
        : {})
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: { select: { name: true } },
      _count: { select: { actions: true, policies: true } }
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">{agents.length} registered</p>
        </div>
        <Button asChild>
          <Link href="/agents/new">
            <Plus className="mr-2 h-4 w-4" />
            New agent
          </Link>
        </Button>
      </div>

      <form className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={searchParams.search ?? ''}
            placeholder="Search agents…"
            className="pl-9"
          />
        </div>
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">draft</option>
          <option value="STAGING">staging</option>
          <option value="PRODUCTION">production</option>
          <option value="DEPRECATED">deprecated</option>
        </select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {agents.length === 0 ? (
        <Card className="p-12 text-center">
          <Bot className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">No agents yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Register your first agent to start building an audit trail.
          </p>
          <Button asChild className="mt-6">
            <Link href="/agents/new">Register an agent</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const tags = parseJson<string[]>(agent.tags, []);
            return (
              <Link key={agent.id} href={`/agents/${agent.id}`}>
                <Card className="h-full p-5 transition-colors hover:border-primary/50">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold leading-tight">{agent.name}</h2>
                    <AgentStatusBadge status={agent.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    v{agent.version} · {agent.owner.name}
                  </p>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>
                  {tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">
                    {agent._count.actions} actions · {agent._count.policies} policies · updated{' '}
                    {formatRelative(agent.updatedAt)}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
