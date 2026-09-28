import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseJson } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FrameworkBadge } from '@/components/status-badge';
import { InstallPackButton } from './install-pack-button';

export const dynamic = 'force-dynamic';

function price(cents: number): string {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(0)}`;
}

export default async function MarketplacePage() {
  const session = await requireSession();

  const [packs, templates] = await Promise.all([
    prisma.marketplacePack.findMany({
      orderBy: [{ priceCents: 'asc' }, { installs: 'desc' }],
      include: {
        installsByOrg: { where: { organizationId: session.organizationId }, select: { id: true } }
      }
    }),
    prisma.marketplaceTemplate.findMany({ orderBy: [{ category: 'asc' }, { installs: 'desc' }] })
  ]);

  const revenueShare = packs.reduce((sum, p) => sum + (p.priceCents * p.installs) / 100, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Marketplace</h1>
        <p className="text-sm text-muted-foreground">
          Pre-built compliance packs and agent templates. Installing a pack clones its policies into
          your workspace — you can edit them afterwards like any local policy.
        </p>
      </div>

      {session.role === 'ADMIN' && (
        <Card className="p-5">
          <h2 className="font-semibold">Revenue share (admin view)</h2>
          <p className="mt-1 text-3xl font-bold">${revenueShare.toFixed(2)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Gross across {packs.length} packs. The MVP tracks installs and list prices only — no
            payment processing is wired.
          </p>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">Compliance packs ({packs.length})</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {packs.map((pack) => (
            <Card key={pack.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{pack.name}</h3>
                <FrameworkBadge framework={pack.framework} />
              </div>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{pack.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{price(pack.priceCents)}</span>
                  <Badge variant="outline" className="text-xs">
                    v{pack.version}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{pack.installs} installs</span>
                </div>
                <InstallPackButton packId={pack.id} installed={pack.installsByOrg.length > 0} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Agent templates ({templates.length})</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const config = parseJson<{ model?: string; tools?: string[] }>(template.configJson, {});
            return (
              <Card key={template.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{template.name}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {template.category}
                  </Badge>
                </div>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{template.description}</p>
                <p className="mt-3 font-mono text-xs text-muted-foreground">
                  {config.model} · {config.tools?.length ?? 0} tools
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {price(template.priceCents)} · {template.installs} installs
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Copy the config from the detail view
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
