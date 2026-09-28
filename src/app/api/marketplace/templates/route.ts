import { prisma } from '@/lib/prisma';
import { handleRouteError, ok } from '@/lib/api-response';
import { requireSession } from '@/lib/auth';
import { parseJson } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireSession();
    const templates = await prisma.marketplaceTemplate.findMany({
      orderBy: [{ category: 'asc' }, { installs: 'desc' }]
    });
    return ok(
      templates.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        category: t.category,
        version: t.version,
        priceCents: t.priceCents,
        installs: t.installs,
        config: parseJson<Record<string, unknown>>(t.configJson, {})
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

