import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import { requireCapability } from '@/lib/auth';
import { parsePolicyYaml } from '@/lib/policy/engine';
import { InstallPackSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

/** Clone a marketplace pack's policies into the caller's organization. */
export async function POST(request: Request) {
  try {
    const session = await requireCapability('policy:write');
    const body = InstallPackSchema.parse(await request.json());

    const pack = await prisma.marketplacePack.findUnique({ where: { id: body.packId } });
    if (!pack) return fail('Pack not found', 404);

    const document = parsePolicyYaml(pack.policiesYaml);

    const policy = await prisma.policy.create({
      data: {
        name: `${pack.name} (${document.rules.length} rules)`,
        description: `Installed from marketplace pack: ${pack.description}`,
        framework: pack.framework,
        rulesYaml: pack.policiesYaml,
        enabled: true,
        organizationId: session.organizationId
      }
    });

    await prisma.marketplacePack.update({
      where: { id: pack.id },
      data: { installs: { increment: 1 } }
    });

    const install = await prisma.marketplaceInstall.upsert({
      where: { organizationId_packId: { organizationId: session.organizationId, packId: pack.id } },
      create: { organizationId: session.organizationId, packId: pack.id, installedBy: session.userId },
      update: {}
    });

    return ok({ install, policy, pack: { id: pack.id, name: pack.name } }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

