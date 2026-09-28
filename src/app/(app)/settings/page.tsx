import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatAbsolute } from '@/lib/format-client';

export const dynamic = 'force-dynamic';

const CAPABILITIES: Record<string, string[]> = {
  ADMIN: ['everything', 'manage members', 'delete agents', 'export audits'],
  DEVELOPER: ['create and edit agents and policies', 'manage budgets', 'decide approvals'],
  AUDITOR: ['read everything', 'export audit logs', 'decide approvals'],
  VIEWER: ['read dashboards only']
};

export default async function SettingsPage() {
  const session = await requireSession();

  const [org, members, agentCount, policyCount, actionCount] = await Promise.all([
    prisma.organization.findUnique({ where: { id: session.organizationId } }),
    prisma.user.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.agent.count({ where: { organizationId: session.organizationId } }),
    prisma.policy.count({ where: { organizationId: session.organizationId } }),
    prisma.agentAction.count({ where: { agent: { organizationId: session.organizationId } } })
  ]);

  if (!org) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Organization, members and roles.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Organization</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{org.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Workspace slug</dt>
              <dd className="font-mono">{org.slug}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Plan</dt>
              <dd>
                <Badge variant="secondary">{org.plan.toLowerCase()}</Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatAbsolute(org.createdAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Usage</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Agents</dt>
              <dd className="font-medium">{agentCount}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Policies</dt>
              <dd className="font-medium">{policyCount}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Actions logged</dt>
              <dd className="font-medium">{actionCount}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Team members ({members.length})</h2>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Badge variant={member.role === 'ADMIN' ? 'default' : 'secondary'}>
                      {member.role.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatAbsolute(member.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">What each role can do</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(CAPABILITIES).map(([role, capabilities]) => (
            <Card key={role} className="p-4">
              <p className="text-sm font-semibold uppercase tracking-wide">{role.toLowerCase()}</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {capabilities.map((capability) => (
                  <li key={capability}>· {capability}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold">Your session</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{session.email}</span> with role{' '}
          <span className="font-medium text-foreground">{session.role.toLowerCase()}</span>. Sessions
          are httpOnly signed cookies valid for 7 days. Sign out from the header.
        </p>
      </Card>
    </div>
  );
}
