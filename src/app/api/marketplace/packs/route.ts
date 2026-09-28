import { prisma } from '@/lib/prisma';
import { handleRouteError, ok } from '@/lib/api-response';
import { requireSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireSession();
    const packs = await prisma.marketplacePack.findMany({
      orderBy: [{ priceCents: 'asc' }, { installs: 'desc' }],
      include: {
        installsByOrg: { where: { organizationId: session.organizationId }, select: { id: true } }
      }
    });

    return ok(
      packs.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        framework: p.framework,
        version: p.version,
        priceCents: p.priceCents,
        installs: p.installs,
        installed: p.installsByOrg.length > 0,
        policiesYaml: p.policiesYaml
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

